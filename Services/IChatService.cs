using SocialConnect.DTOs;

namespace SocialConnect.Services
{
    public interface IChatService
    {
        Task<ConversationDto> GetOrCreatePrivateConversationAsync(Guid currentUserId, Guid targetUserId);
        Task<List<ConversationDto>> GetUserConversationsAsync(Guid userId);
        Task<ConversationDto?> GetConversationByIdAsync(Guid userId, Guid conversationId);
        Task<List<MessageDto>> GetMessagesAsync(Guid userId, Guid conversationId, int page = 1, int pageSize = 50);
        Task<MessageDto> SendMessageAsync(Guid senderId, SendMessageDto dto);
        Task MarkMessagesAsReadAsync(Guid userId, Guid conversationId);
    }
}
