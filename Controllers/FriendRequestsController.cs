using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using SocialConnect.Hubs;
using SocialConnect.Services;

namespace SocialConnect.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class FriendRequestsController : ControllerBase
    {
        private readonly IUserService _userService;
        private readonly IHubContext<CommunicationHub> _hubContext;

        public FriendRequestsController(IUserService userService, IHubContext<CommunicationHub> hubContext)
        {
            _userService = userService;
            _hubContext = hubContext;
        }

        [HttpPost("send/{receiverId}")]
        public async Task<IActionResult> SendRequest(Guid receiverId)
        {
            try
            {
                var senderId = GetCurrentUserId();
                var result = await _userService.SendFriendRequestAsync(senderId, receiverId);

                // Broadcast real-time SignalR notification
                await _hubContext.Clients.Group($"user_{receiverId}").SendAsync("ReceiveFriendRequestNotification", new
                {
                    SenderId = senderId,
                    SenderName = result.Sender.FullName,
                    Message = $"{result.Sender.FullName} sent you a connection request."
                });

                return Ok(new { message = "Connection request sent successfully.", request = result });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while sending request.", detail = ex.Message });
            }
        }

        [HttpPost("accept/{requestId}")]
        public async Task<IActionResult> AcceptRequest(Guid requestId)
        {
            try
            {
                var userId = GetCurrentUserId();
                var pendingRequests = await _userService.GetPendingRequestsAsync(userId);
                var targetRequest = pendingRequests.FirstOrDefault(r => r.Id == requestId);

                await _userService.AcceptFriendRequestAsync(userId, requestId);

                if (targetRequest != null)
                {
                    // Broadcast notification to original sender
                    await _hubContext.Clients.Group($"user_{targetRequest.SenderId}").SendAsync("FriendRequestAcceptedNotification", new
                    {
                        UserId = userId,
                        Message = $"🔔 Connection request accepted! You are now connected."
                    });
                }

                return Ok(new { message = "Connection request accepted!" });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { message = ex.Message });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }

        [HttpPost("reject/{requestId}")]
        public async Task<IActionResult> RejectRequest(Guid requestId)
        {
            try
            {
                var userId = GetCurrentUserId();
                await _userService.RejectFriendRequestAsync(userId, requestId);
                return Ok(new { message = "Connection request rejected." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { message = ex.Message });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }

        [HttpPost("cancel/{requestId}")]
        public async Task<IActionResult> CancelRequest(Guid requestId)
        {
            try
            {
                var userId = GetCurrentUserId();
                await _userService.CancelFriendRequestAsync(userId, requestId);
                return Ok(new { message = "Connection request cancelled." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { message = ex.Message });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }

        [HttpGet("pending")]
        public async Task<IActionResult> GetPendingRequests()
        {
            var userId = GetCurrentUserId();
            var requests = await _userService.GetPendingRequestsAsync(userId);
            return Ok(requests);
        }

        [HttpGet("friends")]
        public async Task<IActionResult> GetConnectedFriends()
        {
            var userId = GetCurrentUserId();
            var friends = await _userService.GetConnectedFriendsAsync(userId);
            return Ok(friends);
        }

        [HttpDelete("friends/{friendId}")]
        public async Task<IActionResult> Unfriend(Guid friendId)
        {
            var userId = GetCurrentUserId();
            await _userService.RemoveConnectionAsync(userId, friendId);
            return Ok(new { message = "Connection removed." });
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
