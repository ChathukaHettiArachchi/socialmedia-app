using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SocialConnect.Data;
using SocialConnect.DTOs;
using SocialConnect.Hubs;
using SocialConnect.Services;

namespace SocialConnect.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class MessagesController : ControllerBase
    {
        private readonly IChatService _chatService;
        private readonly IHubContext<CommunicationHub> _hubContext;
        private readonly ApplicationDbContext _db;

        public MessagesController(IChatService chatService, IHubContext<CommunicationHub> hubContext, ApplicationDbContext db)
        {
            _chatService = chatService;
            _hubContext = hubContext;
            _db = db;
        }

        [HttpGet("{conversationId}")]
        public async Task<IActionResult> GetMessages(Guid conversationId, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
        {
            try
            {
                var userId = GetCurrentUserId();
                var messages = await _chatService.GetMessagesAsync(userId, conversationId, page, pageSize);
                return Ok(messages);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { message = ex.Message });
            }
        }

        [HttpPost]
        public async Task<IActionResult> SendMessage([FromBody] SendMessageDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(new { message = "Invalid message data." });
            }

            try
            {
                var userId = GetCurrentUserId();
                var messageDto = await _chatService.SendMessageAsync(userId, dto);

                // Broadcast message via SignalR hub
                await _hubContext.Clients.Group($"conversation_{dto.ConversationId}").SendAsync("ReceiveMessage", messageDto);

                // Broadcast notification to participants outside active conversation
                var participantIds = await _db.ConversationParticipants
                    .Where(cp => cp.ConversationId == dto.ConversationId && cp.UserId != userId)
                    .Select(cp => cp.UserId)
                    .ToListAsync();

                foreach (var pid in participantIds)
                {
                    await _hubContext.Clients.Group($"user_{pid}").SendAsync("NewMessageNotification", messageDto);
                }

                return Ok(messageDto);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Failed to send message.", detail = ex.Message });
            }
        }

        private Guid GetCurrentUserId()
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            {
                throw new UnauthorizedAccessException("Invalid authentication claim.");
            }
            return userId;
        }
    }
}
