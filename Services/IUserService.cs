using SocialConnect.DTOs;

namespace SocialConnect.Services
{
    public interface IUserService
    {
        Task<List<UserSearchResultDto>> GetUsersAsync(Guid currentUserId, string? query, int page = 1, int pageSize = 20);
        Task<UserSearchResultDto?> GetUserByIdAsync(Guid currentUserId, Guid targetUserId);
        Task<FriendRequestDto> SendFriendRequestAsync(Guid senderId, Guid receiverId);
        Task AcceptFriendRequestAsync(Guid currentUserId, Guid requestId);
        Task RejectFriendRequestAsync(Guid currentUserId, Guid requestId);
        Task CancelFriendRequestAsync(Guid currentUserId, Guid requestId);
        Task<List<FriendRequestDto>> GetPendingRequestsAsync(Guid currentUserId);
        Task<List<ConnectionUserDto>> GetConnectedFriendsAsync(Guid currentUserId);
        Task RemoveConnectionAsync(Guid currentUserId, Guid targetUserId);
    }
}
