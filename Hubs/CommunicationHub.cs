using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SocialConnect.Data;
using SocialConnect.DTOs;
using SocialConnect.Models;
using SocialConnect.Services;

namespace SocialConnect.Hubs
{
    [Authorize]
    public class CommunicationHub : Hub
    {
        private readonly ApplicationDbContext _db;
        private readonly IChatService _chatService;
        private static readonly Dictionary<Guid, HashSet<string>> ConnectedUserConnections = new();

        public CommunicationHub(ApplicationDbContext db, IChatService chatService)
        {
            _db = db;
            _chatService = chatService;
        }

        public override async Task OnConnectedAsync()
        {
            var userId = GetUserId();
            if (userId != Guid.Empty)
            {
                lock (ConnectedUserConnections)
                {
                    if (!ConnectedUserConnections.ContainsKey(userId))
                    {
                        ConnectedUserConnections[userId] = new HashSet<string>();
                    }
                    ConnectedUserConnections[userId].Add(Context.ConnectionId);
                }

                // Join personal group for direct notifications
                await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");

                // Update Online Status in DB
                var user = await _db.Users.FindAsync(userId);
                if (user != null)
                {
                    user.IsOnline = true;
                    user.LastSeenAt = DateTime.UtcNow;
                    await _db.SaveChangesAsync();

                    // Notify connected friends
                    var friendIds = await _db.Connections
                        .Where(c => c.UserId == userId)
                        .Select(c => c.ConnectedUserId)
                        .ToListAsync();

                    foreach (var friendId in friendIds)
                    {
                        await Clients.Group($"user_{friendId}").SendAsync("UserStatusChanged", new
                        {
                            UserId = userId,
                            IsOnline = true,
                            LastSeenAt = user.LastSeenAt
                        });
                    }
                }
            }

            await base.OnConnectedAsync();
        }

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<Guid, Guid> ActiveCallPairs = new();

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var userId = GetUserId();
            if (userId != Guid.Empty)
            {
                // If user was in an active call, notify partner that call ended
                if (ActiveCallPairs.TryRemove(userId, out var partnerId))
                {
                    ActiveCallPairs.TryRemove(partnerId, out _);
                    await Clients.Group($"user_{partnerId}").SendAsync("CallEnded", new { SenderId = userId });
                }

                bool isCompletelyOffline = false;
                lock (ConnectedUserConnections)
                {
                    if (ConnectedUserConnections.ContainsKey(userId))
                    {
                        ConnectedUserConnections[userId].Remove(Context.ConnectionId);
                        if (ConnectedUserConnections[userId].Count == 0)
                        {
                            ConnectedUserConnections.Remove(userId);
                            isCompletelyOffline = true;
                        }
                    }
                }

                if (isCompletelyOffline)
                {
                    var user = await _db.Users.FindAsync(userId);
                    if (user != null)
                    {
                        user.IsOnline = false;
                        user.LastSeenAt = DateTime.UtcNow;
                        await _db.SaveChangesAsync();

                        // Notify connected friends
                        var friendIds = await _db.Connections
                            .Where(c => c.UserId == userId)
                            .Select(c => c.ConnectedUserId)
                            .ToListAsync();

                        foreach (var friendId in friendIds)
                        {
                            await Clients.Group($"user_{friendId}").SendAsync("UserStatusChanged", new
                            {
                                UserId = userId,
                                IsOnline = false,
                                LastSeenAt = user.LastSeenAt
                            });
                        }
                    }
                }
            }

            await base.OnDisconnectedAsync(exception);
        }

        public async Task JoinConversation(string conversationId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"conversation_{conversationId}");
        }

        public async Task LeaveConversation(string conversationId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"conversation_{conversationId}");
        }

        public async Task<MessageDto> SendMessage(string conversationIdStr, string textContent, string messageType = "Text")
        {
            if (!Guid.TryParse(conversationIdStr, out var conversationId)) return null!;
            var senderId = GetUserId();

            var dto = new SendMessageDto
            {
                ConversationId = conversationId,
                MessageType = messageType,
                TextContent = textContent
            };

            var messageDto = await _chatService.SendMessageAsync(senderId, dto);

            // Broadcast message to conversation SignalR group
            await Clients.Group($"conversation_{conversationId}").SendAsync("ReceiveMessage", messageDto);

            // Notify participants outside room for unread badges
            var participantIds = await _db.ConversationParticipants
                .Where(cp => cp.ConversationId == conversationId && cp.UserId != senderId)
                .Select(cp => cp.UserId)
                .ToListAsync();

            foreach (var pid in participantIds)
            {
                await Clients.Group($"user_{pid}").SendAsync("NewMessageNotification", messageDto);
            }

            return messageDto;
        }

        public async Task MarkAsRead(string conversationIdStr)
        {
            if (!Guid.TryParse(conversationIdStr, out var conversationId)) return;
            var userId = GetUserId();
            await _chatService.MarkMessagesAsReadAsync(userId, conversationId);

            // Notify all participants in real-time that messages were read
            await Clients.Group($"conversation_{conversationId}").SendAsync("MessagesRead", new
            {
                ConversationId = conversationId,
                ReaderId = userId
            });

            var participantIds = await _db.ConversationParticipants
                .Where(cp => cp.ConversationId == conversationId && cp.UserId != userId)
                .Select(cp => cp.UserId)
                .ToListAsync();

            foreach (var pid in participantIds)
            {
                await Clients.Group($"user_{pid}").SendAsync("MessagesRead", new
                {
                    ConversationId = conversationId,
                    ReaderId = userId
                });
            }
        }

        public async Task StartTyping(string conversationId)
        {
            var userId = GetUserId();
            var user = await _db.Users.Include(u => u.Profile).FirstOrDefaultAsync(u => u.Id == userId);
            if (user != null)
            {
                await Clients.OthersInGroup($"conversation_{conversationId}").SendAsync("UserTyping", new
                {
                    ConversationId = conversationId,
                    UserId = userId,
                    Username = user.Username,
                    FullName = user.Profile?.FullName ?? user.Username
                });
            }
        }

        public async Task StopTyping(string conversationId)
        {
            var userId = GetUserId();
            await Clients.OthersInGroup($"conversation_{conversationId}").SendAsync("UserStoppedTyping", new
            {
                ConversationId = conversationId,
                UserId = userId
            });
        }

        // --- WebRTC Voice & Video Call Signaling Methods ---

        public async Task SendVoiceCallOffer(string targetUserIdStr, object sdpOffer)
        {
            if (!Guid.TryParse(targetUserIdStr, out var targetUserId)) return;
            var callerId = GetUserId();
            var caller = await _db.Users.Include(u => u.Profile).FirstOrDefaultAsync(u => u.Id == callerId);
            if (caller == null) return;

            ActiveCallPairs[callerId] = targetUserId;
            ActiveCallPairs[targetUserId] = callerId;

            var payload = new
            {
                CallerId = callerId,
                TargetUserId = targetUserId,
                CallerUsername = caller.Username,
                CallerFullName = caller.Profile?.FullName ?? caller.Username,
                CallerAvatarUrl = caller.Profile?.ProfileImageUrl,
                SdpOffer = sdpOffer
            };

            await Clients.All.SendAsync("VoiceCallOffered", payload);
        }

        public async Task SendVoiceCallAnswer(string callerIdStr, object sdpAnswer)
        {
            if (!Guid.TryParse(callerIdStr, out var callerId)) return;
            var answererId = GetUserId();

            ActiveCallPairs[callerId] = answererId;
            ActiveCallPairs[answererId] = callerId;

            var payload = new
            {
                AnswererId = answererId,
                TargetUserId = callerId,
                SdpAnswer = sdpAnswer
            };

            await Clients.All.SendAsync("VoiceCallAnswered", payload);
        }

        public async Task SendVideoCallOffer(string targetUserIdStr, object sdpOffer)
        {
            if (!Guid.TryParse(targetUserIdStr, out var targetUserId)) return;
            var callerId = GetUserId();
            var caller = await _db.Users.Include(u => u.Profile).FirstOrDefaultAsync(u => u.Id == callerId);
            if (caller == null) return;

            ActiveCallPairs[callerId] = targetUserId;
            ActiveCallPairs[targetUserId] = callerId;

            var payload = new
            {
                CallerId = callerId,
                TargetUserId = targetUserId,
                CallerUsername = caller.Username,
                CallerFullName = caller.Profile?.FullName ?? caller.Username,
                CallerAvatarUrl = caller.Profile?.ProfileImageUrl,
                SdpOffer = sdpOffer
            };

            await Clients.All.SendAsync("VideoCallOffered", payload);
        }

        public async Task SendVideoCallAnswer(string callerIdStr, object sdpAnswer)
        {
            if (!Guid.TryParse(callerIdStr, out var callerId)) return;
            var answererId = GetUserId();

            ActiveCallPairs[callerId] = answererId;
            ActiveCallPairs[answererId] = callerId;

            var payload = new
            {
                AnswererId = answererId,
                TargetUserId = callerId,
                SdpAnswer = sdpAnswer
            };

            await Clients.All.SendAsync("VideoCallAnswered", payload);
        }

        public async Task SendIceCandidate(string targetUserIdStr, object candidate)
        {
            if (!Guid.TryParse(targetUserIdStr, out var targetUserId)) return;
            var senderId = GetUserId();

            var payload = new
            {
                SenderId = senderId,
                TargetUserId = targetUserId,
                Candidate = candidate
            };

            await Clients.All.SendAsync("IceCandidateReceived", payload);
        }

        public async Task EndCall(string targetUserIdStr)
        {
            if (!Guid.TryParse(targetUserIdStr, out var targetUserId)) return;
            var senderId = GetUserId();

            ActiveCallPairs.TryRemove(senderId, out _);
            ActiveCallPairs.TryRemove(targetUserId, out _);

            var payload = new { SenderId = senderId, TargetUserId = targetUserId };
            await Clients.All.SendAsync("CallEnded", payload);
        }

        public async Task RejectCall(string callerIdStr)
        {
            if (!Guid.TryParse(callerIdStr, out var callerId)) return;
            var rejecterId = GetUserId();

            ActiveCallPairs.TryRemove(callerId, out _);
            ActiveCallPairs.TryRemove(rejecterId, out _);

            var payload = new { RejecterId = rejecterId, TargetUserId = callerId };
            await Clients.All.SendAsync("CallRejected", payload);
        }

        public async Task SendMediaStateChanged(string targetUserIdStr, bool isMuted, bool isCameraOff)
        {
            if (!Guid.TryParse(targetUserIdStr, out var targetUserId)) return;
            var senderId = GetUserId();

            var payload = new
            {
                SenderId = senderId,
                TargetUserId = targetUserId,
                IsMuted = isMuted,
                IsCameraOff = isCameraOff
            };

            await Clients.All.SendAsync("PeerMediaStateChanged", payload);
        }

        public async Task RequestVideoUpgrade(string targetUserIdStr)
        {
            if (!Guid.TryParse(targetUserIdStr, out var targetUserId)) return;
            var senderId = GetUserId();
            var sender = await _db.Users.Include(u => u.Profile).FirstOrDefaultAsync(u => u.Id == senderId);
            if (sender == null) return;

            var payload = new
            {
                CallerId = senderId,
                TargetUserId = targetUserId,
                CallerName = sender.Profile?.FullName ?? sender.Username
            };

            await Clients.All.SendAsync("VideoUpgradeRequested", payload);
        }

        public async Task AcceptVideoUpgrade(string callerIdStr)
        {
            if (!Guid.TryParse(callerIdStr, out var callerId)) return;
            var answererId = GetUserId();

            var payload = new
            {
                AnswererId = answererId,
                TargetUserId = callerId
            };

            await Clients.All.SendAsync("VideoUpgradeAccepted", payload);
        }

        public async Task DeclineVideoUpgrade(string callerIdStr)
        {
            if (!Guid.TryParse(callerIdStr, out var callerId)) return;
            var rejecterId = GetUserId();

            var payload = new
            {
                RejecterId = rejecterId,
                TargetUserId = callerId
            };

            await Clients.All.SendAsync("VideoUpgradeDeclined", payload);
        }

        public async Task LogCallHistory(string targetUserIdStr, string callTypeStr, string statusStr, int durationSeconds)
        {
            if (!Guid.TryParse(targetUserIdStr, out var targetUserId)) return;
            var senderId = GetUserId();
            if (senderId == Guid.Empty) return;

            var callType = Enum.TryParse<CallType>(callTypeStr, true, out var ct) ? ct : CallType.Voice;
            var status = Enum.TryParse<CallStatus>(statusStr, true, out var st) ? st : CallStatus.Completed;

            var history = new CallHistory
            {
                Id = Guid.NewGuid(),
                CallerId = senderId,
                ReceiverId = targetUserId,
                CallType = callType,
                Status = status,
                StartedAt = DateTime.UtcNow.AddSeconds(-durationSeconds),
                EndedAt = DateTime.UtcNow,
                DurationSeconds = durationSeconds
            };

            _db.CallHistories.Add(history);

            try
            {
                var conversationId = await _db.ConversationParticipants
                    .Where(cp => cp.UserId == senderId && cp.Conversation.Type == ConversationType.Private)
                    .Select(cp => cp.ConversationId)
                    .FirstOrDefaultAsync(cid => _db.ConversationParticipants.Any(cp => cp.ConversationId == cid && cp.UserId == targetUserId));

                if (conversationId != Guid.Empty)
                {
                    var sender = await _db.Users.Include(u => u.Profile).FirstOrDefaultAsync(u => u.Id == senderId);

                    var message = new Message
                    {
                        Id = Guid.NewGuid(),
                        ConversationId = conversationId,
                        SenderId = senderId,
                        MessageType = MessageType.Text,
                        TextContent = $"[CALL_LOG:{callTypeStr}|{statusStr}|{durationSeconds}]",
                        CreatedAt = DateTime.UtcNow,
                        IsRead = false
                    };

                    _db.Messages.Add(message);
                    await _db.SaveChangesAsync();

                    var messageDto = new MessageDto
                    {
                        Id = message.Id,
                        ConversationId = conversationId,
                        SenderId = senderId,
                        SenderUsername = sender?.Username ?? "",
                        SenderFullName = sender?.Profile?.FullName ?? sender?.Username ?? "",
                        SenderAvatarUrl = sender?.Profile?.ProfileImageUrl,
                        MessageType = "Text",
                        TextContent = message.TextContent,
                        CreatedAt = message.CreatedAt,
                        IsRead = false
                    };

                    await Clients.Group($"conversation_{conversationId}").SendAsync("ReceiveMessage", messageDto);
                }
                else
                {
                    await _db.SaveChangesAsync();
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"LogCallHistory Exception: {ex.Message}");
            }

            var updatePayload = new { SenderId = senderId, TargetUserId = targetUserId, CallType = callTypeStr, Status = statusStr, DurationSeconds = durationSeconds };
            await Clients.All.SendAsync("CallHistoryUpdated", updatePayload);
        }

        private Guid GetUserId()
        {
            if (Context.User == null) return Guid.Empty;

            var claim = Context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                     ?? Context.User.FindFirst("sub")?.Value
                     ?? Context.User.FindFirst("id")?.Value
                     ?? Context.User.FindFirst(ClaimTypes.Name)?.Value;

            if (!string.IsNullOrEmpty(claim) && Guid.TryParse(claim, out var userId))
            {
                return userId;
            }
            return Guid.Empty;
        }
    }
}
