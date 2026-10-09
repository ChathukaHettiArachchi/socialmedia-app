using System.ComponentModel.DataAnnotations;

namespace SocialConnect.DTOs
{
    public class ConversationDto
    {
        public Guid Id { get; set; }
        public string Type { get; set; } = "Private"; // Private or Group
        public UserDto OtherParticipant { get; set; } = null!;
        public MessageDto? LastMessage { get; set; }
        public int UnreadCount { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class MessageDto
    {
        public Guid Id { get; set; }
        public Guid ConversationId { get; set; }
        public Guid SenderId { get; set; }
        public string SenderUsername { get; set; } = string.Empty;
        public string SenderFullName { get; set; } = string.Empty;
        public string? SenderAvatarUrl { get; set; }
        public string MessageType { get; set; } = "Text"; // Text, Emoji, Image, Video, Audio, File
        public string? TextContent { get; set; }
        public string? FileUrl { get; set; }
        public string? FileName { get; set; }
        public DateTime CreatedAt { get; set; }
        public bool IsRead { get; set; }
    }

    public class SendMessageDto
    {
        [Required]
        public Guid ConversationId { get; set; }

        public string MessageType { get; set; } = "Text";

        [StringLength(2000, ErrorMessage = "Message cannot exceed 2000 characters")]
        public string? TextContent { get; set; }

        public Guid? FileId { get; set; }
    }
}
