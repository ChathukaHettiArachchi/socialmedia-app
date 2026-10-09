using System;
using System.Collections.Generic;

namespace SocialConnect.Models
{
    public class User
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? LastSeenAt { get; set; }
        public bool IsOnline { get; set; } = false;

        // Navigation properties
        public UserProfile? Profile { get; set; }
        public ICollection<FriendRequest> SentFriendRequests { get; set; } = new List<FriendRequest>();
        public ICollection<FriendRequest> ReceivedFriendRequests { get; set; } = new List<FriendRequest>();
        public ICollection<Connection> ConnectionsInitiated { get; set; } = new List<Connection>();
        public ICollection<Connection> ConnectionsReceived { get; set; } = new List<Connection>();
        public ICollection<ConversationParticipant> ConversationParticipants { get; set; } = new List<ConversationParticipant>();
        public ICollection<Message> Messages { get; set; } = new List<Message>();
        public ICollection<GroupMember> GroupMemberships { get; set; } = new List<GroupMember>();
        public ICollection<BlockedUser> BlockedByMe { get; set; } = new List<BlockedUser>();
        public ICollection<BlockedUser> BlockedMe { get; set; } = new List<BlockedUser>();
        public ICollection<Notification> Notifications { get; set; } = new List<Notification>();
    }

    public class UserProfile
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public string FullName { get; set; } = string.Empty;
        public string? Bio { get; set; }
        public string? ProfileImageUrl { get; set; }
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    public enum FriendRequestStatus
    {
        Pending,
        Accepted,
        Rejected,
        Cancelled
    }

    public class FriendRequest
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid SenderId { get; set; }
        public User Sender { get; set; } = null!;
        public Guid ReceiverId { get; set; }
        public User Receiver { get; set; } = null!;
        public FriendRequestStatus Status { get; set; } = FriendRequestStatus.Pending;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? RespondedAt { get; set; }
    }

    public class Connection
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public Guid ConnectedUserId { get; set; }
        public User ConnectedUser { get; set; } = null!;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public enum ConversationType
    {
        Private,
        Group
    }

    public class Conversation
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public ConversationType Type { get; set; } = ConversationType.Private;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<ConversationParticipant> Participants { get; set; } = new List<ConversationParticipant>();
        public ICollection<Message> Messages { get; set; } = new List<Message>();
        public Group? Group { get; set; }
    }

    public class ConversationParticipant
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid ConversationId { get; set; }
        public Conversation Conversation { get; set; } = null!;
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
        public DateTime? LeftAt { get; set; }
    }

    public enum MessageType
    {
        Text,
        Emoji,
        Image,
        Video,
        Audio,
        File
    }

    public class Message
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid ConversationId { get; set; }
        public Conversation Conversation { get; set; } = null!;
        public Guid SenderId { get; set; }
        public User Sender { get; set; } = null!;
        public MessageType MessageType { get; set; } = MessageType.Text;
        public string? TextContent { get; set; }
        public Guid? FileId { get; set; }
        public FileRecord? File { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public bool IsRead { get; set; } = false;
    }

    public class FileRecord
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string FileName { get; set; } = string.Empty;
        public string StoredFileName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public string FileType { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public Guid UploadedById { get; set; }
        public User UploadedBy { get; set; } = null!;
        public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    }

    public class Group
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid ConversationId { get; set; }
        public Conversation Conversation { get; set; } = null!;
        public string Name { get; set; } = string.Empty;
        public string? GroupImageUrl { get; set; }
        public Guid CreatedById { get; set; }
        public User CreatedBy { get; set; } = null!;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<GroupMember> Members { get; set; } = new List<GroupMember>();
    }

    public enum GroupRole
    {
        Admin,
        Member
    }

    public class GroupMember
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid GroupId { get; set; }
        public Group Group { get; set; } = null!;
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public GroupRole Role { get; set; } = GroupRole.Member;
        public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    }

    public enum CallType
    {
        Voice,
        Video
    }

    public enum CallStatus
    {
        Completed,
        Missed,
        Rejected,
        Cancelled
    }

    public class CallHistory
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CallerId { get; set; }
        public User Caller { get; set; } = null!;
        public Guid ReceiverId { get; set; }
        public User Receiver { get; set; } = null!;
        public CallType CallType { get; set; } = CallType.Voice;
        public CallStatus Status { get; set; } = CallStatus.Completed;
        public DateTime StartedAt { get; set; } = DateTime.UtcNow;
        public DateTime? EndedAt { get; set; }
        public int DurationSeconds { get; set; } = 0;
    }

    public class BlockedUser
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid BlockerId { get; set; }
        public User Blocker { get; set; } = null!;
        public Guid BlockedUserId { get; set; }
        public User Blocked { get; set; } = null!;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public enum NotificationType
    {
        FriendRequest,
        FriendRequestAccepted,
        NewMessage,
        IncomingCall,
        GroupInvitation
    }

    public class Notification
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public NotificationType Type { get; set; }
        public Guid? ReferenceId { get; set; }
        public string Message { get; set; } = string.Empty;
        public bool IsRead { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
