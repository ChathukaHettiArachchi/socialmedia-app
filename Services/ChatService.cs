using Microsoft.EntityFrameworkCore;
using SocialConnect.Data;
using SocialConnect.DTOs;
using SocialConnect.Models;

namespace SocialConnect.Services
{
    public class ChatService : IChatService
    {
        private readonly ApplicationDbContext _db;

        public ChatService(ApplicationDbContext db)
        {
            _db = db;
        }

        public async Task<ConversationDto> GetOrCreatePrivateConversationAsync(Guid currentUserId, Guid targetUserId)
        {
            if (currentUserId == targetUserId)
            {
                throw new InvalidOperationException("You cannot start a conversation with yourself.");
            }

            // Enforce Connection rule
            var isConnected = await _db.Connections.AnyAsync(c => c.UserId == currentUserId && c.ConnectedUserId == targetUserId);
            if (!isConnected)
            {
                throw new InvalidOperationException("You can only chat with users you are connected with.");
            }

            // Check existing private conversation between these 2 users
            var existingConversationId = await _db.ConversationParticipants
                .Where(cp => cp.UserId == currentUserId && cp.Conversation.Type == ConversationType.Private)
                .Select(cp => cp.ConversationId)
                .FirstOrDefaultAsync(cid => _db.ConversationParticipants.Any(cp => cp.ConversationId == cid && cp.UserId == targetUserId));

            if (existingConversationId != Guid.Empty)
            {
                var existingDto = await GetConversationByIdAsync(currentUserId, existingConversationId);
                if (existingDto != null) return existingDto;
            }

            // Create new conversation
            var conversation = new Conversation
            {
                Id = Guid.NewGuid(),
                Type = ConversationType.Private,
                CreatedAt = DateTime.UtcNow
            };

            var participant1 = new ConversationParticipant
            {
                Id = Guid.NewGuid(),
                ConversationId = conversation.Id,
                UserId = currentUserId,
                JoinedAt = DateTime.UtcNow
            };

            var participant2 = new ConversationParticipant
            {
                Id = Guid.NewGuid(),
                ConversationId = conversation.Id,
                UserId = targetUserId,
                JoinedAt = DateTime.UtcNow
            };

            _db.Conversations.Add(conversation);
            _db.ConversationParticipants.Add(participant1);
            _db.ConversationParticipants.Add(participant2);

            await _db.SaveChangesAsync();

            var createdDto = await GetConversationByIdAsync(currentUserId, conversation.Id);
            return createdDto ?? throw new InvalidOperationException("Failed to load created conversation.");
        }

        public async Task<List<ConversationDto>> GetUserConversationsAsync(Guid userId)
        {
            var conversationIds = await _db.ConversationParticipants
                .Where(cp => cp.UserId == userId && cp.LeftAt == null)
                .Select(cp => cp.ConversationId)
                .ToListAsync();

            var dtos = new List<ConversationDto>();
            foreach (var cid in conversationIds)
            {
                var dto = await GetConversationByIdAsync(userId, cid);
                if (dto != null)
                {
                    dtos.Add(dto);
                }
            }

            return dtos.OrderByDescending(c => c.LastMessage?.CreatedAt ?? c.CreatedAt).ToList();
        }

        public async Task<ConversationDto?> GetConversationByIdAsync(Guid userId, Guid conversationId)
        {
            var isParticipant = await _db.ConversationParticipants.AnyAsync(cp => cp.ConversationId == conversationId && cp.UserId == userId && cp.LeftAt == null);
            if (!isParticipant) return null;

            var conversation = await _db.Conversations
                .Include(c => c.Participants).ThenInclude(p => p.User).ThenInclude(u => u.Profile)
                .Include(c => c.Group)
                .FirstOrDefaultAsync(c => c.Id == conversationId);

            if (conversation == null) return null;

            var otherParticipant = conversation.Participants
                .FirstOrDefault(p => p.UserId != userId)?.User;

            if (otherParticipant == null) return null;

            var lastMessage = await _db.Messages
                .Include(m => m.Sender).ThenInclude(s => s.Profile)
                .Include(m => m.File)
                .Where(m => m.ConversationId == conversationId)
                .OrderByDescending(m => m.CreatedAt)
                .FirstOrDefaultAsync();

            var unreadCount = await _db.Messages
                .Where(m => m.ConversationId == conversationId && m.SenderId != userId && !m.IsRead)
                .CountAsync();

            return new ConversationDto
            {
                Id = conversation.Id,
                Type = conversation.Type.ToString(),
                OtherParticipant = MapToUserDto(otherParticipant),
                LastMessage = lastMessage != null ? MapToMessageDto(lastMessage) : null,
                UnreadCount = unreadCount,
                CreatedAt = conversation.CreatedAt
            };
        }

        public async Task<List<MessageDto>> GetMessagesAsync(Guid userId, Guid conversationId, int page = 1, int pageSize = 50)
        {
            var isParticipant = await _db.ConversationParticipants.AnyAsync(cp => cp.ConversationId == conversationId && cp.UserId == userId && cp.LeftAt == null);
            if (!isParticipant)
            {
                throw new UnauthorizedAccessException("You are not a participant in this conversation.");
            }

            var messages = await _db.Messages
                .Include(m => m.Sender).ThenInclude(s => s.Profile)
                .Include(m => m.File)
                .Where(m => m.ConversationId == conversationId)
                .OrderByDescending(m => m.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            messages.Reverse(); // Chronological order
            return messages.Select(MapToMessageDto).ToList();
        }

        public async Task<MessageDto> SendMessageAsync(Guid senderId, SendMessageDto dto)
        {
            var isParticipant = await _db.ConversationParticipants.AnyAsync(cp => cp.ConversationId == dto.ConversationId && cp.UserId == senderId && cp.LeftAt == null);
            if (!isParticipant)
            {
                throw new UnauthorizedAccessException("You are not a participant in this conversation.");
            }

            if (!Enum.TryParse<MessageType>(dto.MessageType, true, out var msgType))
            {
                msgType = MessageType.Text;
            }

            var sender = await _db.Users.Include(u => u.Profile).FirstAsync(u => u.Id == senderId);

            var message = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = dto.ConversationId,
                SenderId = senderId,
                Sender = sender,
                MessageType = msgType,
                TextContent = dto.TextContent?.Trim(),
                FileId = dto.FileId,
                CreatedAt = DateTime.UtcNow,
                IsRead = false
            };

            _db.Messages.Add(message);
            await _db.SaveChangesAsync();

            return MapToMessageDto(message);
        }

        public async Task MarkMessagesAsReadAsync(Guid userId, Guid conversationId)
        {
            var unreadMessages = await _db.Messages
                .Where(m => m.ConversationId == conversationId && m.SenderId != userId && !m.IsRead)
                .ToListAsync();

            if (unreadMessages.Any())
            {
                foreach (var msg in unreadMessages)
                {
                    msg.IsRead = true;
                }
                await _db.SaveChangesAsync();
            }
        }

        private static MessageDto MapToMessageDto(Message msg)
        {
            return new MessageDto
            {
                Id = msg.Id,
                ConversationId = msg.ConversationId,
                SenderId = msg.SenderId,
                SenderUsername = msg.Sender.Username,
                SenderFullName = msg.Sender.Profile?.FullName ?? msg.Sender.Username,
                SenderAvatarUrl = msg.Sender.Profile?.ProfileImageUrl,
                MessageType = msg.MessageType.ToString(),
                TextContent = msg.TextContent,
                FileUrl = msg.File?.FilePath,
                FileName = msg.File?.FileName,
                CreatedAt = msg.CreatedAt,
                IsRead = msg.IsRead
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
