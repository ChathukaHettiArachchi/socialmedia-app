using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialConnect.Data;
using SocialConnect.DTOs;

namespace SocialConnect.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class CallsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public CallsController(ApplicationDbContext db)
        {
            _db = db;
        }

        [HttpGet("history")]
        public async Task<IActionResult> GetCallHistory([FromQuery] int page = 1, [FromQuery] int pageSize = 30)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            var query = _db.CallHistories
                .Include(c => c.Caller).ThenInclude(u => u.Profile)
                .Include(c => c.Receiver).ThenInclude(u => u.Profile)
                .Where(c => c.CallerId == userId || c.ReceiverId == userId)
                .OrderByDescending(c => c.StartedAt);

            var totalItems = await query.CountAsync();
            var calls = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(c => new CallHistoryDto
                {
                    Id = c.Id,
                    CallerId = c.CallerId,
                    CallerName = c.Caller.Profile != null ? c.Caller.Profile.FullName : c.Caller.Username,
                    CallerAvatarUrl = c.Caller.Profile != null ? c.Caller.Profile.ProfileImageUrl : null,
                    ReceiverId = c.ReceiverId,
                    ReceiverName = c.Receiver.Profile != null ? c.Receiver.Profile.FullName : c.Receiver.Username,
                    ReceiverAvatarUrl = c.Receiver.Profile != null ? c.Receiver.Profile.ProfileImageUrl : null,
                    CallType = c.CallType.ToString(),
                    Status = c.Status.ToString(),
                    IsOutgoing = c.CallerId == userId,
                    StartedAt = c.StartedAt,
                    EndedAt = c.EndedAt,
                    DurationSeconds = c.DurationSeconds
                })
                .ToListAsync();

            return Ok(new { totalItems, page, pageSize, items = calls });
        }

        private Guid GetCurrentUserId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                     ?? User.FindFirst("sub")?.Value
                     ?? User.FindFirst("id")?.Value;

            if (Guid.TryParse(claim, out var userId)) return userId;
            return Guid.Empty;
        }
    }
}
