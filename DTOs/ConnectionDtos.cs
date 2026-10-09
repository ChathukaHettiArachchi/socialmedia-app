namespace SocialConnect.DTOs
{
    public class UserSearchResultDto
    {
        public Guid Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string? Bio { get; set; }
        public string? ProfileImageUrl { get; set; }
        public bool IsOnline { get; set; }
        public DateTime? LastSeenAt { get; set; }
        public string ConnectionStatus { get; set; } = "None"; // None, RequestSent, RequestReceived, Connected, Blocked
        public Guid? PendingRequestId { get; set; }
    }

    public class FriendRequestDto
    {
        public Guid Id { get; set; }
        public Guid SenderId { get; set; }
        public UserDto Sender { get; set; } = null!;
        public Guid ReceiverId { get; set; }
        public UserDto Receiver { get; set; } = null!;
        public string Status { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
    }

    public class ConnectionUserDto
    {
        public Guid ConnectionId { get; set; }
        public Guid UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string? Bio { get; set; }
        public string? ProfileImageUrl { get; set; }
        public bool IsOnline { get; set; }
        public DateTime? LastSeenAt { get; set; }
        public DateTime ConnectedAt { get; set; }
    }
}
