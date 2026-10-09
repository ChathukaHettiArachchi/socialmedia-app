using Microsoft.EntityFrameworkCore;
using SocialConnect.Data;
using SocialConnect.DTOs;
using SocialConnect.Models;

namespace SocialConnect.Services
{
    public class UserService : IUserService
    {
        private readonly ApplicationDbContext _db;

        public UserService(ApplicationDbContext db)
        {
            _db = db;
        }

        public async Task<List<UserSearchResultDto>> GetUsersAsync(Guid currentUserId, string? query, int page = 1, int pageSize = 20)
        {
            var baseQuery = _db.Users
                .Include(u => u.Profile)
                .Where(u => u.Id != currentUserId);

            if (!string.IsNullOrWhiteSpace(query))
            {
                var q = query.Trim().ToLower();
                baseQuery = baseQuery.Where(u =>
                    u.Username.ToLower().Contains(q) ||
                    u.Email.ToLower().Contains(q) ||
                    (u.Profile != null && u.Profile.FullName.ToLower().Contains(q)));
            }

            var totalUsers = await baseQuery.CountAsync();
            var users = await baseQuery
                .OrderBy(u => u.Username)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var userIds = users.Select(u => u.Id).ToList();

            // Connections for current user
            var connections = await _db.Connections
                .Where(c => c.UserId == currentUserId && userIds.Contains(c.ConnectedUserId))
                .Select(c => c.ConnectedUserId)
                .ToListAsync();

            // Sent pending requests
            var sentRequests = await _db.FriendRequests
                .Where(fr => fr.SenderId == currentUserId && userIds.Contains(fr.ReceiverId) && fr.Status == FriendRequestStatus.Pending)
                .ToListAsync();

            // Received pending requests
            var receivedRequests = await _db.FriendRequests
                .Where(fr => fr.ReceiverId == currentUserId && userIds.Contains(fr.SenderId) && fr.Status == FriendRequestStatus.Pending)
                .ToListAsync();

            // Blocked users
            var blockedUsers = await _db.BlockedUsers
                .Where(b => (b.BlockerId == currentUserId && userIds.Contains(b.BlockedUserId)) ||
                            (b.BlockedUserId == currentUserId && userIds.Contains(b.BlockerId)))
                .Select(b => b.BlockerId == currentUserId ? b.BlockedUserId : b.BlockerId)
                .ToListAsync();

            var result = new List<UserSearchResultDto>();

            foreach (var user in users)
            {
                string status = "None";
                Guid? pendingRequestId = null;

                if (connections.Contains(user.Id))
                {
                    status = "Connected";
                }
                else if (sentRequests.Any(r => r.ReceiverId == user.Id))
                {
                    status = "RequestSent";
                    pendingRequestId = sentRequests.First(r => r.ReceiverId == user.Id).Id;
                }
                else if (receivedRequests.Any(r => r.SenderId == user.Id))
                {
                    status = "RequestReceived";
                    pendingRequestId = receivedRequests.First(r => r.SenderId == user.Id).Id;
                }
                else if (blockedUsers.Contains(user.Id))
                {
                    status = "Blocked";
                }

                result.Add(new UserSearchResultDto
                {
                    Id = user.Id,
                    Username = user.Username,
                    Email = user.Email,
                    FullName = user.Profile?.FullName ?? user.Username,
                    Bio = user.Profile?.Bio,
                    ProfileImageUrl = user.Profile?.ProfileImageUrl,
                    IsOnline = user.IsOnline,
                    LastSeenAt = user.LastSeenAt,
                    ConnectionStatus = status,
                    PendingRequestId = pendingRequestId
                });
            }

            return result;
        }

        public async Task<UserSearchResultDto?> GetUserByIdAsync(Guid currentUserId, Guid targetUserId)
        {
            var users = await GetUsersAsync(currentUserId, null, 1, 1000);
            return users.FirstOrDefault(u => u.Id == targetUserId);
        }

        public async Task<FriendRequestDto> SendFriendRequestAsync(Guid senderId, Guid receiverId)
        {
            if (senderId == receiverId)
            {
                throw new InvalidOperationException("You cannot send a connection request to yourself.");
            }

            var receiver = await _db.Users.Include(u => u.Profile).FirstOrDefaultAsync(u => u.Id == receiverId);
            if (receiver == null)
            {
                throw new KeyNotFoundException("User not found.");
            }

            var isAlreadyConnected = await _db.Connections.AnyAsync(c => c.UserId == senderId && c.ConnectedUserId == receiverId);
            if (isAlreadyConnected)
            {
                throw new InvalidOperationException("You are already connected with this user.");
            }

            var existingRequest = await _db.FriendRequests.FirstOrDefaultAsync(fr =>
                (fr.SenderId == senderId && fr.ReceiverId == receiverId) ||
                (fr.SenderId == receiverId && fr.ReceiverId == senderId));

            if (existingRequest != null && existingRequest.Status == FriendRequestStatus.Pending)
            {
                throw new InvalidOperationException("A pending connection request already exists.");
            }

            var sender = await _db.Users.Include(u => u.Profile).FirstAsync(u => u.Id == senderId);

            var friendRequest = new FriendRequest
            {
                Id = Guid.NewGuid(),
                SenderId = senderId,
                Sender = sender,
                ReceiverId = receiverId,
                Receiver = receiver,
                Status = FriendRequestStatus.Pending,
                CreatedAt = DateTime.UtcNow
            };

            _db.FriendRequests.Add(friendRequest);
            await _db.SaveChangesAsync();

            return MapToFriendRequestDto(friendRequest);
        }

        public async Task AcceptFriendRequestAsync(Guid currentUserId, Guid requestId)
        {
            var request = await _db.FriendRequests
                .Include(r => r.Sender)
                .Include(r => r.Receiver)
                .FirstOrDefaultAsync(r => r.Id == requestId);

            if (request == null)
            {
                throw new KeyNotFoundException("Friend request not found.");
            }

            if (request.ReceiverId != currentUserId)
            {
                throw new UnauthorizedAccessException("You are not authorized to accept this request.");
            }

            if (request.Status != FriendRequestStatus.Pending)
            {
                throw new InvalidOperationException("This friend request is no longer pending.");
            }

            request.Status = FriendRequestStatus.Accepted;
            request.RespondedAt = DateTime.UtcNow;

            // Create bidirectional connection
            var connection1 = new Connection
            {
                Id = Guid.NewGuid(),
                UserId = request.SenderId,
                ConnectedUserId = request.ReceiverId,
                CreatedAt = DateTime.UtcNow
            };

            var connection2 = new Connection
            {
                Id = Guid.NewGuid(),
                UserId = request.ReceiverId,
                ConnectedUserId = request.SenderId,
                CreatedAt = DateTime.UtcNow
            };

            _db.Connections.Add(connection1);
            _db.Connections.Add(connection2);

            await _db.SaveChangesAsync();
        }

        public async Task RejectFriendRequestAsync(Guid currentUserId, Guid requestId)
        {
            var request = await _db.FriendRequests.FirstOrDefaultAsync(r => r.Id == requestId);
            if (request == null)
            {
                throw new KeyNotFoundException("Friend request not found.");
            }

            if (request.ReceiverId != currentUserId)
            {
                throw new UnauthorizedAccessException("You are not authorized to reject this request.");
            }

            request.Status = FriendRequestStatus.Rejected;
            request.RespondedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }

        public async Task CancelFriendRequestAsync(Guid currentUserId, Guid requestId)
        {
            var request = await _db.FriendRequests.FirstOrDefaultAsync(r => r.Id == requestId);
            if (request == null)
            {
                throw new KeyNotFoundException("Friend request not found.");
            }

            if (request.SenderId != currentUserId)
            {
                throw new UnauthorizedAccessException("You are not authorized to cancel this request.");
            }

            request.Status = FriendRequestStatus.Cancelled;
            request.RespondedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }

        public async Task<List<FriendRequestDto>> GetPendingRequestsAsync(Guid currentUserId)
        {
            var requests = await _db.FriendRequests
                .Include(r => r.Sender).ThenInclude(s => s.Profile)
                .Include(r => r.Receiver).ThenInclude(rc => rc.Profile)
                .Where(r => (r.ReceiverId == currentUserId || r.SenderId == currentUserId) && r.Status == FriendRequestStatus.Pending)
                .OrderByDescending(r => r.CreatedAt)
                .ToListAsync();

            return requests.Select(MapToFriendRequestDto).ToList();
        }

        public async Task<List<ConnectionUserDto>> GetConnectedFriendsAsync(Guid currentUserId)
        {
            var connections = await _db.Connections
                .Include(c => c.ConnectedUser).ThenInclude(u => u.Profile)
                .Where(c => c.UserId == currentUserId)
                .OrderBy(c => c.ConnectedUser.Username)
                .ToListAsync();

            return connections.Select(c => new ConnectionUserDto
            {
                ConnectionId = c.Id,
                UserId = c.ConnectedUserId,
                Username = c.ConnectedUser.Username,
                FullName = c.ConnectedUser.Profile?.FullName ?? c.ConnectedUser.Username,
                Bio = c.ConnectedUser.Profile?.Bio,
                ProfileImageUrl = c.ConnectedUser.Profile?.ProfileImageUrl,
                IsOnline = c.ConnectedUser.IsOnline,
                LastSeenAt = c.ConnectedUser.LastSeenAt,
                ConnectedAt = c.CreatedAt
            }).ToList();
        }

        public async Task RemoveConnectionAsync(Guid currentUserId, Guid targetUserId)
        {
            var connections = await _db.Connections
                .Where(c => (c.UserId == currentUserId && c.ConnectedUserId == targetUserId) ||
                            (c.UserId == targetUserId && c.ConnectedUserId == currentUserId))
                .ToListAsync();

            if (connections.Any())
            {
                _db.Connections.RemoveRange(connections);
                await _db.SaveChangesAsync();
            }
        }

        private static FriendRequestDto MapToFriendRequestDto(FriendRequest fr)
        {
            return new FriendRequestDto
            {
                Id = fr.Id,
                SenderId = fr.SenderId,
                Sender = MapToUserDto(fr.Sender),
                ReceiverId = fr.ReceiverId,
                Receiver = MapToUserDto(fr.Receiver),
                Status = fr.Status.ToString(),
                CreatedAt = fr.CreatedAt
            };
        }

        private static UserDto MapToUserDto(User user)
        {
            return new UserDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                FullName = user.Profile?.FullName ?? user.Username,
                Bio = user.Profile?.Bio,
                ProfileImageUrl = user.Profile?.ProfileImageUrl,
                IsOnline = user.IsOnline,
                LastSeenAt = user.LastSeenAt,
                CreatedAt = user.CreatedAt
            };
        }
    }
}
