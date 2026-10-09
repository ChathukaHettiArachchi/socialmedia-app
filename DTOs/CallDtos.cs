using System;

namespace SocialConnect.DTOs
{
    public class CallHistoryDto
    {
        public Guid Id { get; set; }
        public Guid CallerId { get; set; }
        public string CallerName { get; set; } = string.Empty;
        public string? CallerAvatarUrl { get; set; }
        public Guid ReceiverId { get; set; }
        public string ReceiverName { get; set; } = string.Empty;
        public string? ReceiverAvatarUrl { get; set; }
        public string CallType { get; set; } = "Voice"; // Voice, Video
        public string Status { get; set; } = "Completed"; // Completed, Missed, Rejected, Cancelled
        public bool IsOutgoing { get; set; }
        public DateTime StartedAt { get; set; }
        public DateTime? EndedAt { get; set; }
        public int DurationSeconds { get; set; }
    }
}
