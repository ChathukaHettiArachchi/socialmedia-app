/* Real-Time Private Chat & SignalR Client Module */
const Chat = {
  connection: null,
  activeConversation: null,
  typingTimeout: null,
  isTyping: false,
  currentPage: 1,

  headerTimer: null,

  async init() {
    await this.initSignalR();
    this.bindEvents();
    this.initSwipeToGoBack();
    this.startRealtimeHeaderTimer();
  },

  async initSignalR() {
    const token = API.getToken();
    if (!token) return;

    if (this.connection) {
      if (this.connection.state === signalR.HubConnectionState.Connected) {
        if (typeof Call !== 'undefined' && Call.bindHubHandlers) {
          Call.bindHubHandlers(this.connection);
        }
        return;
      }
      if (this.connection.state === signalR.HubConnectionState.Connecting) {
        return;
      }
      try {
        await this.connection.stop();
      } catch (e) {}
    }

    // Build SignalR Hub Connection
    const hubUrl = (window.CONFIG && window.CONFIG.HUB_URL) ? window.CONFIG.HUB_URL : '/hubs/communication';
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${hubUrl}?access_token=${encodeURIComponent(token)}`)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // Bind Call WebRTC handlers
    if (typeof Call !== 'undefined' && Call.bindHubHandlers) {
      Call.bindHubHandlers(this.connection);
    }

    // SignalR Event Handlers
    this.connection.on('ReceiveMessage', (message) => this.handleReceiveMessage(message));
    this.connection.on('NewMessageNotification', (message) => this.handleNewMessageNotification(message));
    this.connection.on('MessagesRead', (data) => this.handleMessagesRead(data));
    this.connection.on('UserTyping', (data) => this.handleUserTyping(data));
    this.connection.on('UserStoppedTyping', (data) => this.handleUserStoppedTyping(data));
    this.connection.on('UserStatusChanged', (data) => this.handleUserStatusChanged(data));
    this.connection.on('ReceiveFriendRequestNotification', (data) => {
      UI.showToast('info', `🔔 ${data.message || 'New friend request received.'}`);
      if (typeof Users !== 'undefined' && Users.refreshAllViews) Users.refreshAllViews();
    });
    this.connection.on('FriendRequestAcceptedNotification', (data) => {
      UI.showToast('success', `🔔 ${data.message || 'Connection request accepted.'}`);
      if (typeof Users !== 'undefined' && Users.refreshAllViews) Users.refreshAllViews();
    });

    // Reconnection Lifecycle Events
    this.connection.onreconnecting((error) => {
      console.warn('SignalR reconnecting:', error);
      UI.showToast('info', 'Connection lost. Reconnecting...');
    });

    this.connection.onreconnected(async (connectionId) => {
      console.log('SignalR reconnected:', connectionId);
      UI.showToast('success', 'Reconnected!');
      if (typeof Call !== 'undefined' && Call.bindHubHandlers) {
        Call.bindHubHandlers(this.connection);
      }
      await this.ensureJoinedActiveConversation();
    });

    try {
      await this.connection.start();
      console.log('SignalR Hub Connected successfully!');
      if (typeof Call !== 'undefined' && Call.bindHubHandlers) {
        Call.bindHubHandlers(this.connection);
      }
      await this.ensureJoinedActiveConversation();
    } catch (err) {
      console.error('SignalR Connection Error:', err);
    }
  },

  async ensureJoinedActiveConversation() {
    if (!this.activeConversation || !this.connection) return;
    if (this.connection.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke('JoinConversation', this.activeConversation.id);
        await this.connection.invoke('MarkAsRead', this.activeConversation.id);
      } catch (err) {
        console.error('Failed to join conversation group on Hub:', err);
      }
    }
  },

  bindEvents() {
    const messageForm = document.getElementById('chat-message-form');
    if (messageForm) {
      messageForm.addEventListener('submit', (e) => this.handleSendMessage(e));
    }

    const inputField = document.getElementById('chat-message-input');
    if (inputField) {
      inputField.addEventListener('input', () => this.handleTypingInput());
      inputField.addEventListener('click', () => {
        if (typeof Emoji !== 'undefined' && Emoji.closePicker) {
          Emoji.closePicker();
        }
      });
      inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage(e);
        }
      });
    }

    const actionBtn = document.getElementById('chat-action-btn');
    if (actionBtn) {
      actionBtn.addEventListener('click', (e) => this.handleActionButtonClick(e));
    }

    const messagesWindow = document.getElementById('chat-messages-window');
    if (messagesWindow) {
      messagesWindow.addEventListener('click', () => {
        if (typeof Emoji !== 'undefined' && Emoji.closePicker) {
          Emoji.closePicker();
        }
      });
    }
  },

  initSwipeToGoBack() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    const chatContainer = document.querySelector('.chat-container') || document.querySelector('.app-main');
    if (!chatContainer) return;

    chatContainer.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchEndX = touchStartX;
      touchEndY = touchStartY;
    }, { passive: true });

    chatContainer.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      touchEndX = touch.clientX;
      touchEndY = touch.clientY;
    }, { passive: true });

    chatContainer.addEventListener('touchend', () => {
      const deltaX = touchEndX - touchStartX;
      const deltaY = Math.abs(touchEndY - touchStartY);

      const layout = document.querySelector('.app-layout');
      if (layout && layout.classList.contains('mobile-chat-active')) {
        // Swiping from left edge toward right
        if (touchStartX < 120 && deltaX > 50 && deltaY < 90) {
          this.showConversationsListOnMobile();
        }
      }
    }, { passive: true });
  },

  startRealtimeHeaderTimer() {
    if (this.headerTimer) clearInterval(this.headerTimer);
    this.headerTimer = setInterval(() => {
      if (this.activeConversation && this.activeConversation.otherParticipant) {
        const partner = this.activeConversation.otherParticipant;
        if (!partner.isOnline && partner.lastSeenAt) {
          const statusEl = document.querySelector('.chat-header-status');
          if (statusEl) {
            statusEl.textContent = this.formatLastSeen(partner.lastSeenAt);
          }
        }
      }
    }, 20000);
  },

  parseDate(dateInput) {
    if (!dateInput) return new Date();
    if (dateInput instanceof Date) return dateInput;
    let str = String(dateInput).trim();
    // If ISO date without timezone ('Z' or '+/-HH:mm'), append 'Z' so it is parsed as UTC
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str) && !str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
      str += 'Z';
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date(dateInput) : d;
  },

  formatMessageTime(dateInput) {
    const d = this.parseDate(dateInput);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  formatLastSeen(dateInput) {
    if (!dateInput) return 'Offline';
    const date = this.parseDate(dateInput);
    const now = new Date();
    const diffSeconds = Math.max(0, Math.floor((now - date) / 1000));
    if (diffSeconds < 60) return 'Last seen just now';
    if (diffSeconds < 3600) {
      const mins = Math.floor(diffSeconds / 60);
      return `Last seen ${mins}m ago`;
    }
    if (diffSeconds < 86400) {
      const hours = Math.floor(diffSeconds / 3600);
      return `Last seen ${hours}h ago`;
    }
    return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  },

  handleActionButtonClick(e) {
    const inputField = document.getElementById('chat-message-input');
    const hasText = inputField && inputField.value.trim().length > 0;

    if (hasText) {
      this.handleSendMessage(e);
    } else {
      if (typeof Media !== 'undefined' && Media.startVoiceRecording) {
        Media.startVoiceRecording();
      }
    }
  },

  adjustTextareaHeight(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    // Single line ~22px, max 3 lines is approx 72-74px
    const maxHeight = 74;
    const scrollH = textarea.scrollHeight;
    if (scrollH > maxHeight) {
      textarea.style.height = maxHeight + 'px';
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.height = Math.max(scrollH, 22) + 'px';
      textarea.style.overflowY = 'hidden';
    }
  },

  updateActionButtonState() {
    const inputField = document.getElementById('chat-message-input');
    const actionBtn = document.getElementById('chat-action-btn');
    if (!inputField || !actionBtn) return;

    const hasText = inputField.value.trim().length > 0;
    if (hasText) {
      if (!actionBtn.classList.contains('is-send')) {
        actionBtn.classList.remove('is-mic');
        actionBtn.classList.add('is-send');
        actionBtn.title = 'Send Message';
        actionBtn.setAttribute('aria-label', 'Send Message');
        actionBtn.innerHTML = '<i class="fa-solid fa-paper-plane" style="transform: translateX(1px);"></i>';
      }
    } else {
      if (!actionBtn.classList.contains('is-mic')) {
        actionBtn.classList.remove('is-send');
        actionBtn.classList.add('is-mic');
        actionBtn.title = 'Record Voice Message';
        actionBtn.setAttribute('aria-label', 'Record Voice Message');
        actionBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
      }
    }
  },

  showConversationsListOnMobile() {
    const layout = document.querySelector('.app-layout');
    if (layout) {
      layout.classList.remove('mobile-chat-active');
    }
  },

  async startPrivateChat(targetUserId) {
    try {
      const layout = document.querySelector('.app-layout');
      if (layout) {
        layout.classList.add('mobile-chat-active');
      }
      const conversation = await API.post(`/conversations/private/${targetUserId}`, {});
      await this.openConversation(conversation);
    } catch (err) {
      UI.showToast('error', err.message || 'Unable to open private chat.');
    }
  },

  async openConversation(conversation) {
    const layout = document.querySelector('.app-layout');
    if (layout) {
      layout.classList.add('mobile-chat-active');
    }

    if (this.activeConversation && this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke('LeaveConversation', this.activeConversation.id);
      } catch (e) {}
    }

    this.activeConversation = conversation;
    this.currentPage = 1;

    // Immediately mark as read via REST API to ensure DB state is updated
    await API.post(`/conversations/${conversation.id}/read`, {}).catch(() => {});

    // Ensure SignalR group is joined
    await this.ensureJoinedActiveConversation();

    this.renderChatHeader(conversation);
    await this.loadMessages(conversation.id);

    // Refresh conversation list in sidebar
    this.loadUserConversations();

    if (typeof Emoji !== 'undefined' && Emoji.closePicker) {
      Emoji.closePicker();
    }

    const inputField = document.getElementById('chat-message-input');
    if (inputField) {
      inputField.value = '';
      this.adjustTextareaHeight(inputField);
      this.updateActionButtonState();
      inputField.focus();
    }
  },

  renderChatHeader(conversation) {
    const headerContainer = document.getElementById('chat-header-container');
    if (!headerContainer) return;

    const partner = conversation.otherParticipant;
    const partnerId = partner.id || partner.Id || '';
    const partnerFullName = partner.fullName || partner.FullName || partner.username || partner.Username || 'User';
    const avatarUrl = UI.getAvatarUrl(partner);
    const isOnline = partner.isOnline !== undefined ? partner.isOnline : partner.IsOnline;
    
    let lastSeenText = 'Offline';
    if (isOnline) {
      lastSeenText = '🟢 Online';
    } else if (partner.lastSeenAt || partner.LastSeenAt) {
      lastSeenText = this.formatLastSeen(partner.lastSeenAt || partner.LastSeenAt);
    }

    headerContainer.innerHTML = `
      <div class="chat-header-user" style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
        <div class="avatar-container" style="position: relative; flex-shrink: 0;">
          <img src="${avatarUrl}" class="chat-header-avatar" alt="${UI.escapeHtml(partnerFullName)}">
          <span class="${isOnline ? 'online-blob' : 'offline-blob'}" title="${isOnline ? 'Online' : 'Offline'}"></span>
        </div>
        <div class="chat-header-details" style="flex: 1; min-width: 0;">
          <div class="chat-header-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 700; font-size: 0.96rem;">${UI.escapeHtml(partnerFullName)}</div>
          <div class="chat-header-status" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.78rem;">${lastSeenText}</div>
        </div>
      </div>
      <div class="chat-header-actions" style="flex-shrink: 0;">
        <button class="icon-btn" onclick="Call.startVoiceCall('${partnerId}', '${UI.escapeHtml(partnerFullName)}', '${avatarUrl}')" title="Voice Call">
          <i class="fa-solid fa-phone" style="color: var(--accent-green);"></i>
        </button>
        <button class="icon-btn" onclick="Call.startVideoCall('${partnerId}', '${UI.escapeHtml(partnerFullName)}', '${avatarUrl}')" title="Video Call">
          <i class="fa-solid fa-video" style="color: var(--primary);"></i>
        </button>
        <button class="icon-btn" title="More Options">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
      </div>
    `;
  },

  async loadMessages(conversationId) {
    const messagesWindow = document.getElementById('chat-messages-window');
    if (!messagesWindow) return;

    try {
      const messages = await API.get(`/messages/${conversationId}?page=${this.currentPage}&pageSize=50`);
      this.renderMessages(messagesWindow, messages);
      this.scrollToBottom(messagesWindow);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  },

  renderMessages(container, messages) {
    if (!messages || messages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; margin: auto; color: var(--text-muted);">
          <i class="fa-solid fa-comments" style="font-size: 2.5rem; margin-bottom: 12px; color: var(--primary);"></i>
          <p style="font-weight: 600;">No messages yet.</p>
          <span style="font-size: 0.85rem;">Say hello to start the conversation!</span>
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(msg => this.renderMessageItem(msg)).join('');
  },

  renderMessageItem(msg) {
    const senderId = msg.senderId || msg.SenderId;
    const currentUserId = Auth.currentUser?.id || Auth.currentUser?.Id;
    const isOutgoing = senderId && currentUserId && String(senderId).toLowerCase() === String(currentUserId).toLowerCase();

    const senderFullName = msg.senderFullName || msg.SenderFullName || msg.senderUsername || msg.SenderUsername || 'User';
    const senderAvatarUrl = msg.senderAvatarUrl || msg.SenderAvatarUrl || UI.getAvatarUrl({ fullName: senderFullName });
    const createdAt = msg.createdAt || msg.CreatedAt || new Date();
    const timeStr = this.formatMessageTime(createdAt);
    const msgId = msg.id || msg.Id || '';
    const isRead = msg.isRead ?? msg.IsRead ?? false;

    const rawText = (msg.textContent || msg.TextContent || '').trim();

    // Custom Call Log Card Layout
    if (rawText.startsWith('[CALL_LOG:')) {
      const parts = rawText.substring(10, rawText.length - 1).split('|');
      const callType = parts[0] || 'Voice';
      const status = parts[1] || 'Completed';
      const durationSec = parseInt(parts[2] || '0', 10);

      const isVideo = callType.toLowerCase() === 'video';
      const icon = isVideo ? 'fa-video' : 'fa-phone';

      let directionLabel = isOutgoing
        ? (isVideo ? '↗ Outgoing Video Call' : '↗ Outgoing Voice Call')
        : (status.toLowerCase() === 'missed' || status.toLowerCase() === 'rejected'
            ? (isVideo ? '↙ Missed Video Call' : '↙ Missed Voice Call')
            : (isVideo ? '↙ Incoming Video Call' : '↙ Incoming Voice Call'));

      let statusText = 'Completed';
      let statusColor = '#10b981';
      let iconBg = 'rgba(16, 185, 129, 0.15)';

      if (status.toLowerCase() === 'missed') {
        statusText = 'Missed';
        statusColor = '#ef4444';
        iconBg = 'rgba(239, 68, 68, 0.15)';
      } else if (status.toLowerCase() === 'rejected') {
        statusText = 'Declined';
        statusColor = '#f59e0b';
        iconBg = 'rgba(245, 158, 11, 0.15)';
      }

      let durationText = '';
      if (durationSec > 0) {
        const mins = Math.floor(durationSec / 60);
        const secs = durationSec % 60;
        durationText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      }

      const partner = this.activeConversation ? this.activeConversation.otherParticipant : null;
      const partnerId = partner ? (partner.id || partner.Id) : '';
      const partnerName = partner ? (partner.fullName || partner.username) : 'User';
      const partnerAvatar = partner ? UI.getAvatarUrl(partner) : '';

      return `
        <div class="chat-msg-row ${isOutgoing ? 'outgoing' : 'incoming'}" ${msgId ? `id="msg-${msgId}"` : ''}>
          <div class="chat-call-card-item">
            <div style="width: 42px; height: 42px; border-radius: 50%; background: ${iconBg}; color: ${statusColor}; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; flex-shrink: 0;">
              <i class="fa-solid ${icon}"></i>
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-main); margin-bottom: 2px;">${directionLabel}</div>
              <div style="font-size: 0.8rem; color: ${statusColor}; font-weight: 600;">
                ${statusText} ${durationText ? `• ${durationText}` : ''}
              </div>
            </div>
            ${partnerId ? `
              <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); Call.start${isVideo ? 'Video' : 'Voice'}Call('${partnerId}', '${UI.escapeHtml(partnerName)}', '${partnerAvatar}')" style="padding: 5px 12px; font-size: 0.78rem; border-radius: 14px; gap: 5px; flex-shrink: 0;" title="Call back">
                <i class="fa-solid ${icon}"></i> Call
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }

    const type = (msg.messageType || msg.MessageType || 'Text').toUpperCase();
    const isOnlyEmoji = (type === 'TEXT' || !msg.messageType) && this.isOnlyEmoji(rawText);

    const contentHtml = this.renderMessageContent(msg);

    return `
      <div class="chat-msg-row ${isOutgoing ? 'outgoing' : 'incoming'}" ${msgId ? `id="msg-${msgId}"` : ''}>
        <div class="chat-message ${isOutgoing ? 'outgoing' : 'incoming'}">
          ${!isOutgoing ? `<img src="${senderAvatarUrl}" class="chat-msg-avatar">` : ''}
          <div class="chat-msg-content">
            <div class="chat-msg-bubble ${isOnlyEmoji ? 'is-emoji-bubble' : ''}">${contentHtml}</div>
            <div class="chat-msg-meta">
              <span>${timeStr}</span>
              ${isOutgoing ? `<i class="fa-solid ${isRead ? 'fa-check-double' : 'fa-check'}" style="color: ${isRead ? 'var(--accent-green)' : 'inherit'};"></i>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderMessageContent(msg) {
    const fileUrl = msg.textContent || msg.TextContent || msg.fileUrl || msg.FileUrl || '';
    const type = (msg.messageType || msg.MessageType || 'Text').toUpperCase();

    if (type === 'IMAGE') {
      return `<img src="${fileUrl}" alt="Shared Image" style="max-width: 260px; max-height: 260px; border-radius: 12px; cursor: pointer; object-fit: cover; display: block;" onclick="Media.openLightbox('${fileUrl}')">`;
    }

    if (type === 'VIDEO') {
      return `<video controls src="${fileUrl}" style="max-width: 280px; max-height: 220px; border-radius: 12px; display: block;"></video>`;
    }

    if (type === 'AUDIO') {
      return `
        <div style="display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-microphone" style="color: var(--primary); font-size: 1.2rem;"></i>
          <audio controls src="${fileUrl}" style="max-width: 220px; height: 36px; outline: none;"></audio>
        </div>
      `;
    }

    if (type === 'FILE') {
      const fileName = msg.fileName || msg.FileName || fileUrl.substring(fileUrl.lastIndexOf('/') + 1) || 'File Attachment';
      return `
        <div style="display: flex; align-items: center; gap: 10px; min-width: 200px;">
          <i class="fa-solid fa-file-lines" style="font-size: 1.6rem; color: var(--primary);"></i>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${UI.escapeHtml(fileName)}</div>
            <a href="${fileUrl}" download class="btn btn-secondary btn-sm" style="margin-top: 4px; padding: 2px 8px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-download"></i> Download
            </a>
          </div>
        </div>
      `;
    }

    // Check if Message is a Call Log Card
    const rawText = msg.textContent || msg.TextContent || '';
    if (rawText.startsWith('[CALL_LOG:')) {
      const parts = rawText.substring(10, rawText.length - 1).split('|');
      const callType = parts[0] || 'Voice';
      const status = parts[1] || 'Completed';
      const durationSec = parseInt(parts[2] || '0', 10);

      const isVideo = callType.toLowerCase() === 'video';
      const icon = isVideo ? 'fa-video' : 'fa-phone';
      const callTypeName = isVideo ? 'Video Call' : 'Voice Call';

      let statusText = 'Completed';
      let statusColor = 'color: #10b981;';
      if (status.toLowerCase() === 'missed') {
        statusText = 'Missed Call';
        statusColor = 'color: #ef4444;';
      } else if (status.toLowerCase() === 'rejected') {
        statusText = 'Declined';
        statusColor = 'color: #f59e0b;';
      } else if (status.toLowerCase() === 'cancelled') {
        statusText = 'Cancelled';
        statusColor = 'color: #94a3b8;';
      }

      let durationText = '';
      if (durationSec > 0) {
        const mins = Math.floor(durationSec / 60);
        const secs = durationSec % 60;
        durationText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      }

      const partnerId = this.activeConversation && this.activeConversation.otherParticipant
        ? (this.activeConversation.otherParticipant.id || this.activeConversation.otherParticipant.Id)
        : '';
      const partnerName = this.activeConversation && this.activeConversation.otherParticipant
        ? (this.activeConversation.otherParticipant.fullName || this.activeConversation.otherParticipant.username)
        : 'User';

      return `
        <div class="chat-call-log-card">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: rgba(59, 130, 246, 0.15); display: flex; align-items: center; justify-content: center; ${statusColor}">
            <i class="fa-solid ${icon}" style="font-size: 1.15rem;"></i>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-main);">${callTypeName}</div>
            <div style="font-size: 0.8rem; ${statusColor} font-weight: 600;">
              ${statusText} ${durationText ? `• ${durationText}` : ''}
            </div>
          </div>
          ${partnerId ? `
            <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); Call.start${isVideo ? 'Video' : 'Voice'}Call('${partnerId}', '${UI.escapeHtml(partnerName)}', '')" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 12px; gap: 4px;">
              <i class="fa-solid ${icon}"></i> Call
            </button>
          ` : ''}
        </div>
      `;
    }

    // Default Text / Emoji (Preserve line breaks from Enter key)
    const trimmed = rawText.trim();
    if (this.isOnlyEmoji(trimmed)) {
      return `<span class="emoji-large">${trimmed}</span>`;
    }
    return UI.escapeHtml(rawText).replace(/\n/g, '<br>');
  },

  async handleSendMessage(event) {
    if (event) event.preventDefault();
    if (!this.activeConversation) {
      UI.showToast('error', 'Select a conversation first.');
      return;
    }

    const inputField = document.getElementById('chat-message-input');
    const textContent = inputField.value.trim();
    if (!textContent) return;

    inputField.value = '';
    this.adjustTextareaHeight(inputField);
    this.updateActionButtonState();
    this.stopTypingSignal();
    if (typeof Emoji !== 'undefined' && Emoji.closePicker) {
      Emoji.closePicker();
    }

    try {
      let sentMsg = null;
      if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
        sentMsg = await this.connection.invoke('SendMessage', this.activeConversation.id, textContent, 'Text');
      } else {
        // Fallback REST API
        sentMsg = await API.post('/messages', {
          conversationId: this.activeConversation.id,
          textContent: textContent,
          messageType: 'Text'
        });
      }

      if (sentMsg) {
        this.handleReceiveMessage(sentMsg);
      }
    } catch (err) {
      console.error('Send Message Error:', err);
      UI.showToast('error', 'Failed to send message.');
    }
  },

  handleReceiveMessage(message) {
    if (!message) return;
    const conversationId = message.conversationId || message.ConversationId;

    if (this.activeConversation && conversationId === this.activeConversation.id) {
      const messagesWindow = document.getElementById('chat-messages-window');
      if (messagesWindow) {
        const msgId = message.id || message.Id;
        if (msgId && document.getElementById(`msg-${msgId}`)) {
          return; // Message already rendered
        }

        const emptyState = messagesWindow.querySelector('.fa-comments');
        if (emptyState) messagesWindow.innerHTML = '';

        const msgHtml = this.renderMessageItem(message);
        messagesWindow.insertAdjacentHTML('beforeend', msgHtml);
        this.scrollToBottom(messagesWindow);

        const senderId = message.senderId || message.SenderId;
        const currentUserId = Auth.currentUser?.id || Auth.currentUser?.Id;
        const isOutgoing = senderId && currentUserId && String(senderId).toLowerCase() === String(currentUserId).toLowerCase();

        if (!isOutgoing) {
          if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
            this.connection.invoke('MarkAsRead', conversationId);
          } else {
            API.post(`/conversations/${conversationId}/read`, {});
          }
        }
      }
    }

    this.loadUserConversations();
  },

  handleNewMessageNotification(message) {
    if (!message) return;
    const conversationId = message.conversationId || message.ConversationId;

    if (this.activeConversation && this.activeConversation.id === conversationId) {
      this.handleReceiveMessage(message);
    } else {
      const senderFullName = message.senderFullName || message.SenderFullName || 'Friend';
      const textContent = message.textContent || message.TextContent;
      const messageType = message.messageType || message.MessageType || 'Media';
      const textPreview = textContent || `${messageType} message`;
      UI.showToast('info', `💬 ${senderFullName}: ${textPreview}`);
    }

    this.loadUserConversations();
    if (typeof loadDashboardConnections === 'function') {
      loadDashboardConnections();
    }
    if (typeof Users !== 'undefined' && Users.refreshAllViews) {
      Users.refreshAllViews();
    }
  },

  handleMessagesRead(data) {
    if (!data) return;
    const conversationId = data.conversationId || data.ConversationId;
    if (this.activeConversation && this.activeConversation.id === conversationId) {
      const checkmarks = document.querySelectorAll('.chat-message.outgoing .chat-msg-meta i');
      checkmarks.forEach(i => {
        i.className = 'fa-solid fa-check-double';
        i.style.color = 'var(--accent-green)';
      });
    }
    this.loadUserConversations();
  },

  handleTypingInput() {
    const inputField = document.getElementById('chat-message-input');
    this.adjustTextareaHeight(inputField);
    this.updateActionButtonState();

    if (!this.activeConversation || !this.connection) return;

    if (!this.isTyping) {
      this.isTyping = true;
      this.connection.invoke('StartTyping', this.activeConversation.id);
    }

    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.stopTypingSignal();
    }, 2000);
  },

  stopTypingSignal() {
    if (this.isTyping && this.activeConversation && this.connection) {
      this.isTyping = false;
      this.connection.invoke('StopTyping', this.activeConversation.id);
    }
  },

  handleUserTyping(data) {
    if (this.activeConversation && data.conversationId === this.activeConversation.id) {
      const typingBar = document.getElementById('typing-indicator-bar');
      if (typingBar) {
        typingBar.innerHTML = `
          <div class="typing-dots"><span></span><span></span><span></span></div>
          <span>${UI.escapeHtml(data.fullName)} is typing...</span>
        `;
        typingBar.style.display = 'flex';
      }
    }
  },

  handleUserStoppedTyping(data) {
    if (this.activeConversation && data.conversationId === this.activeConversation.id) {
      const typingBar = document.getElementById('typing-indicator-bar');
      if (typingBar) {
        typingBar.style.display = 'none';
        typingBar.innerHTML = '';
      }
    }
  },

  handleUserStatusChanged(data) {
    if (!data) return;
    const changedUserId = data.userId || data.UserId;
    if (this.activeConversation && this.activeConversation.otherParticipant) {
      const partner = this.activeConversation.otherParticipant;
      const partnerId = partner.id || partner.Id;
      if (partnerId && changedUserId && String(partnerId).toLowerCase() === String(changedUserId).toLowerCase()) {
        const isOnline = data.isOnline !== undefined ? data.isOnline : data.IsOnline;
        const lastSeenAt = data.lastSeenAt || data.LastSeenAt;
        partner.isOnline = isOnline;
        if (lastSeenAt) {
          partner.lastSeenAt = lastSeenAt;
        }
        this.renderChatHeader(this.activeConversation);
      }
    }
    this.loadUserConversations();
  },

  async loadUserConversations() {
    const container = document.getElementById('sidebar-conversations-container');
    if (!container) return;

    try {
      const conversations = await API.get('/conversations');
      this.renderConversationsList(container, conversations);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  },

  formatLastMessagePreview(msg) {
    if (!msg) return { icon: '<i class="fa-regular fa-comment-dots" style="color: var(--text-muted);"></i>', text: 'No messages yet' };
    const text = (msg.textContent || msg.TextContent || '').trim();
    const type = (msg.messageType || msg.MessageType || 'Text').toUpperCase();

    if (text.startsWith('[CALL_LOG:')) {
      const parts = text.substring(10, text.length - 1).split('|');
      const callType = parts[0] || 'Voice';
      const status = parts[1] || 'Completed';
      const durationSec = parseInt(parts[2] || '0', 10);

      const isVideo = callType.toLowerCase() === 'video';
      const name = isVideo ? 'Video Call' : 'Voice Call';

      if (status.toLowerCase() === 'missed') {
        const icon = isVideo ? '<i class="fa-solid fa-video" style="color: #ef4444; font-size: 0.82rem;"></i>' : '<i class="fa-solid fa-phone-slash" style="color: #ef4444; font-size: 0.82rem;"></i>';
        return { icon, text: `Missed ${name}` };
      } else if (status.toLowerCase() === 'rejected') {
        const icon = isVideo ? '<i class="fa-solid fa-video" style="color: #f59e0b; font-size: 0.82rem;"></i>' : '<i class="fa-solid fa-phone-slash" style="color: #f59e0b; font-size: 0.82rem;"></i>';
        return { icon, text: `Declined ${name}` };
      }

      let dur = '';
      if (durationSec > 0) {
        const mins = Math.floor(durationSec / 60);
        const secs = durationSec % 60;
        dur = mins > 0 ? ` (${mins}m ${secs}s)` : ` (${secs}s)`;
      }
      const icon = isVideo ? '<i class="fa-solid fa-video" style="color: var(--primary); font-size: 0.82rem;"></i>' : '<i class="fa-solid fa-phone" style="color: var(--accent-green); font-size: 0.82rem;"></i>';
      return { icon, text: `${name}${dur}` };
    }

    if (type === 'IMAGE') return { icon: '<i class="fa-solid fa-image" style="color: #8b5cf6; font-size: 0.82rem;"></i>', text: 'Photo' };
    if (type === 'VIDEO') return { icon: '<i class="fa-solid fa-film" style="color: #3b82f6; font-size: 0.82rem;"></i>', text: 'Video' };
    if (type === 'AUDIO') return { icon: '<i class="fa-solid fa-microphone" style="color: #10b981; font-size: 0.82rem;"></i>', text: 'Voice Message' };
    if (type === 'FILE') return { icon: '<i class="fa-solid fa-file-lines" style="color: #f59e0b; font-size: 0.82rem;"></i>', text: 'File Attachment' };

    return { icon: '<i class="fa-regular fa-comment-dots" style="color: var(--text-muted); font-size: 0.82rem;"></i>', text: text };
  },

  renderConversationsList(container, conversations) {
    if (!conversations || conversations.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 28px 14px; color: var(--text-muted);">
          <i class="fa-solid fa-message" style="font-size: 2rem; margin-bottom: 10px; color: var(--primary);"></i>
          <p style="font-size: 0.88rem; font-weight: 500;">No active chats yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = conversations.map(c => {
      const partner = c.otherParticipant;
      const avatarUrl = UI.getAvatarUrl(partner);
      const isActive = this.activeConversation && this.activeConversation.id === c.id;
      const hasUnread = c.unreadCount > 0;
      const preview = this.formatLastMessagePreview(c.lastMessage);
      const timeStr = c.lastMessage ? this.formatMessageTime(c.lastMessage.createdAt || c.lastMessage.CreatedAt) : '';

      let readTickHtml = '';
      if (c.lastMessage) {
        const lastSenderId = c.lastMessage.senderId || c.lastMessage.SenderId;
        const currentUserId = Auth.currentUser ? (Auth.currentUser.id || Auth.currentUser.Id) : null;
        if (lastSenderId && currentUserId && String(lastSenderId).toLowerCase() === String(currentUserId).toLowerCase()) {
          const isRead = c.lastMessage.isRead ?? c.lastMessage.IsRead ?? false;
          readTickHtml = `<i class="fa-solid ${isRead ? 'fa-check-double' : 'fa-check'}" style="font-size: 0.78rem; color: ${isRead ? 'var(--accent-green)' : 'var(--text-muted)'};"></i>`;
        }
      }

      return `
        <div class="friend-item ${isActive ? 'active' : ''} ${hasUnread ? 'has-unread' : ''}" 
             onclick="Chat.openConversationById('${c.id}')" 
             style="display: flex; align-items: center; gap: 14px; padding: 12px 16px; margin-bottom: 8px; border-radius: 12px; cursor: pointer; transition: all 0.2s ease; box-sizing: border-box; width: 100%; ${isActive ? 'background: var(--bg-card-hover); border-left: 3px solid var(--primary);' : ''}">
          <div class="avatar-container" style="flex-shrink: 0; position: relative; display: inline-flex; align-items: center; justify-content: center;">
            <img src="${avatarUrl}" class="user-avatar" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">
            <span class="${partner.isOnline ? 'online-blob' : 'offline-blob'}" title="${partner.isOnline ? 'Online' : 'Offline'}"></span>
          </div>
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; justify-content: center;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
              <span class="friend-name" style="font-size: 0.98rem; font-weight: 700; color: #ffffff !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${UI.escapeHtml(partner.fullName || partner.username)}
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 6px; font-size: 0.83rem; color: ${hasUnread ? 'var(--text-main)' : 'var(--text-secondary)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;">
                <span style="flex-shrink: 0; display: inline-flex; align-items: center;">${preview.icon}</span>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${hasUnread ? '600' : '400'};">${UI.escapeHtml(preview.text)}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                ${readTickHtml}
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">${timeStr}</span>
                ${hasUnread ? `<span class="unread-count-badge">${c.unreadCount}</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  async openConversationById(conversationId) {
    if (!document.getElementById('chat-messages-window')) {
      window.location.href = `chat.html?conversationId=${conversationId}`;
      return;
    }
    try {
      const conversation = await API.get(`/conversations/${conversationId}`);
      await this.openConversation(conversation);
    } catch (err) {
      UI.showToast('error', 'Unable to open conversation.');
    }
  },

  scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
  },

  isOnlyEmoji(text) {
    if (!text) return false;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 8 || /[a-zA-Z0-9]/.test(trimmed)) return false;
    try {
      const reg = new RegExp('^(\\p{Extended_Pictographic}|\\u200d|\\ufe0f|\\s){1,4}$', 'u');
      return reg.test(trimmed);
    } catch (e) {
      return false;
    }
  }
};

window.Chat = Chat;
