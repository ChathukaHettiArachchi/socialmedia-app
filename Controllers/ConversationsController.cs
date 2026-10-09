using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SocialConnect.Data;
using SocialConnect.Hubs;
using SocialConnect.Services;

namespace SocialConnect.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ConversationsController : ControllerBase
    {
        private readonly IChatService _chatService;
        private readonly IHubContext<CommunicationHub> _hubContext;
        private readonly ApplicationDbContext _db;

        public ConversationsController(IChatService chatService, IHubContext<CommunicationHub> hubContext, ApplicationDbContext db)
        {
            _chatService = chatService;
            _hubContext = hubContext;
            _db = db;
        }

        [HttpGet]
        public async Task<IActionResult> GetMyConversations()
        {
            var userId = GetCurrentUserId();
            var conversations = await _chatService.GetUserConversationsAsync(userId);
            return Ok(conversations);
        }

        [HttpPost("private/{targetUserId}")]
        public async Task<IActionResult> GetOrCreatePrivateConversation(Guid targetUserId)
        {
            try
            {
                var userId = GetCurrentUserId();
                var conversation = await _chatService.GetOrCreatePrivateConversationAsync(userId, targetUserId);
                return Ok(conversation);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred starting conversation.", detail = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetConversationById(Guid id)
        {
            var userId = GetCurrentUserId();
            var conversation = await _chatService.GetConversationByIdAsync(userId, id);
            if (conversation == null)
            {
                return NotFound(new { message = "Conversation not found or access denied." });
            }
            return Ok(conversation);
        }

        [HttpPost("{id}/read")]
        public async Task<IActionResult> MarkAsRead(Guid id)
        {
            var userId = GetCurrentUserId();
            await _chatService.MarkMessagesAsReadAsync(userId, id);

            // Broadcast real-time MessagesRead signal to group and participant user groups
            await _hubContext.Clients.Group($"conversation_{id}").SendAsync("MessagesRead", new
            {
                ConversationId = id,
                ReaderId = userId
            });

            var participantIds = await _db.ConversationParticipants
                .Where(cp => cp.ConversationId == id && cp.UserId != userId)
                .Select(cp => cp.UserId)
                .ToListAsync();

            foreach (var pid in participantIds)
            {
                await _hubContext.Clients.Group($"user_{pid}").SendAsync("MessagesRead", new
                {
                    ConversationId = id,
                    ReaderId = userId
                });
            }

            return Ok(new { message = "Messages marked as read." });
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
