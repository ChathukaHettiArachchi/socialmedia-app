/* Users Discovery & Connection Management Module */
const Users = {
  activeQuery: '',

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const searchInputs = ['user-search-input', 'sidebar-user-search-input'];
    searchInputs.forEach(inputId => {
      const input = document.getElementById(inputId);
      if (input) {
        let debounceTimer;
        input.addEventListener('input', (e) => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            this.activeQuery = e.target.value.trim();
            this.loadUsers();
            this.loadUsersContainer('sidebar-users-container');
          }, 300);
        });
      }
    });
  },

  async loadUsers() {
    this.loadUsersContainer('users-list-container');
  },

  async loadUsersContainer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted);">
          <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 8px;"></i>
          <p style="font-size: 0.85rem;">Searching people...</p>
        </div>
      `;

      const users = await API.get(`/users?query=${encodeURIComponent(this.activeQuery)}`);
      this.renderUserCards(container, users);
    } catch (err) {
      console.error('Failed to load users:', err);
      container.innerHTML = `
        <div style="text-align: center; padding: 15px; color: var(--accent-danger); font-size: 0.85rem;">
          <i class="fa-solid fa-circle-exclamation"></i> Unable to load users.
        </div>
      `;
    }
  },

  async loadPendingRequests() {
    this.loadPendingRequestsContainer('pending-requests-container');
  },

  async loadPendingRequestsContainer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      const requests = await API.get('/friendrequests/pending');
      this.renderPendingRequests(container, requests);
    } catch (err) {
      console.error('Failed to load pending requests:', err);
    }
  },

  async loadConnectedFriends() {
    this.loadFriendsContainer('friends-list-container');
  },

  async loadFriendsContainer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      const friends = await API.get('/friendrequests/friends');
      this.renderFriends(container, friends);
    } catch (err) {
      console.error('Failed to load friends:', err);
    }
  },

  renderUserCards(container, users) {
    if (!users || users.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px 15px; color: var(--text-muted);">
          <i class="fa-solid fa-users-slash" style="font-size: 1.8rem; margin-bottom: 8px;"></i>
          <p style="font-weight: 600; font-size: 0.9rem;">No users found</p>
          <span style="font-size: 0.8rem;">Try searching for a different name, username or email.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = users.map(user => {
      const avatarUrl = UI.getAvatarUrl(user);
      const isOnline = user.isOnline;
      const statusBadge = isOnline
        ? `<span class="status-badge status-online"><span class="status-dot"></span> Online</span>`
        : `<span class="status-badge status-offline"><span class="status-dot"></span> Offline</span>`;

      let actionBtn = '';

      switch (user.connectionStatus) {
        case 'Connected':
          actionBtn = `
            <button class="btn btn-primary btn-sm" onclick="Users.openPrivateChat('${user.id}')">
              <i class="fa-solid fa-comments"></i> Send Message
            </button>
          `;
          break;

        case 'RequestSent':
          actionBtn = `
            <button class="btn btn-secondary btn-sm" onclick="Users.cancelRequest('${user.pendingRequestId}')" title="Click to cancel request">
              <i class="fa-solid fa-clock"></i> Request Sent
            </button>
          `;
          break;

        case 'RequestReceived':
          actionBtn = `
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-primary btn-sm" onclick="Users.acceptRequest('${user.pendingRequestId}')">
                <i class="fa-solid fa-check"></i> Accept
              </button>
              <button class="btn btn-secondary btn-sm" onclick="Users.rejectRequest('${user.pendingRequestId}')">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          `;
          break;

        case 'Blocked':
          actionBtn = `<span style="font-size: 0.8rem; color: var(--accent-danger);">Blocked</span>`;
          break;

        default: // 'None'
          actionBtn = `
            <button class="btn btn-primary btn-sm" onclick="Users.sendRequest('${user.id}')">
              <i class="fa-solid fa-user-plus"></i> Add Friend
            </button>
          `;
          break;
      }

      return `
        <div class="user-card glass-card">
          <div class="user-card-header">
            <div class="avatar-container">
              <img src="${avatarUrl}" alt="${UI.escapeHtml(user.username)}" class="user-card-avatar">
              <span class="${isOnline ? 'online-blob' : 'offline-blob'}" title="${isOnline ? 'Online' : 'Offline'}"></span>
            </div>
            <div class="user-card-info">
              <div class="user-card-name">${UI.escapeHtml(user.fullName)}</div>
              <div class="user-card-username">@${UI.escapeHtml(user.username)}</div>
              ${statusBadge}
            </div>
          </div>
          <div class="user-card-bio">${UI.escapeHtml(user.bio || 'No bio available.')}</div>
          <div class="user-card-footer">
            ${actionBtn}
          </div>
        </div>
      `;
    }).join('');
  },

  renderPendingRequests(container, requests) {
    if (!requests || requests.length === 0) {
      container.innerHTML = `<p style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 10px;">No pending requests.</p>`;
      return;
    }

    container.innerHTML = requests.map(req => {
      const isIncoming = req.receiverId === Auth.currentUser.id;
      const otherUser = isIncoming ? req.sender : req.receiver;
      const avatarUrl = UI.getAvatarUrl(otherUser);

      return `
        <div class="pending-req-item">
          <img src="${avatarUrl}" class="user-avatar" style="width: 36px; height: 36px;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 0.88rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${UI.escapeHtml(otherUser.fullName)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">
              ${isIncoming ? 'Sent you a request' : 'Request pending...'}
            </div>
          </div>
          ${isIncoming ? `
            <div style="display: flex; gap: 4px;">
              <button class="icon-btn" style="width: 30px; height: 30px; color: var(--accent-green);" onclick="Users.acceptRequest('${req.id}')" title="Accept">
                <i class="fa-solid fa-check"></i>
              </button>
              <button class="icon-btn" style="width: 30px; height: 30px; color: var(--accent-danger);" onclick="Users.rejectRequest('${req.id}')" title="Reject">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          ` : `
            <button class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 4px 8px;" onclick="Users.cancelRequest('${req.id}')">
              Cancel
            </button>
          `}
        </div>
      `;
    }).join('');
  },

  renderFriends(container, friends) {
    if (!friends || friends.length === 0) {
      container.innerHTML = `<p style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 10px;">No connected friends yet.</p>`;
      return;
    }

    container.innerHTML = friends.map(friend => {
      const avatarUrl = UI.getAvatarUrl(friend);
      return `
        <div class="friend-item" onclick="Users.openPrivateChat('${friend.userId}')">
          <div class="avatar-container" style="flex-shrink: 0;">
            <img src="${avatarUrl}" class="user-avatar" style="width: 38px; height: 38px;">
            <span class="${friend.isOnline ? 'online-blob' : 'offline-blob'}" title="${friend.isOnline ? 'Online' : 'Offline'}"></span>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div class="friend-name" style="font-size: 0.88rem; font-weight: 700; color: #ffffff !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${UI.escapeHtml(friend.fullName)}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">@${UI.escapeHtml(friend.username)}</div>
          </div>
          <span class="status-badge ${friend.isOnline ? 'status-online' : 'status-offline'}" style="flex-shrink: 0;">
            <span class="status-dot"></span>
          </span>
        </div>
      `;
    }).join('');
  },

  async sendRequest(receiverId) {
    try {
      await API.post(`/friendrequests/send/${receiverId}`, {});
      UI.showToast('success', 'Connection request sent!');
      this.refreshAllViews();
    } catch (err) {
      UI.showToast('error', err.message || 'Failed to send request.');
    }
  },

  async acceptRequest(requestId) {
    try {
      await API.post(`/friendrequests/accept/${requestId}`, {});
      UI.showToast('success', 'Connection request accepted! You are now connected.');
      this.refreshAllViews();
    } catch (err) {
      UI.showToast('error', err.message || 'Failed to accept request.');
    }
  },

  async rejectRequest(requestId) {
    try {
      await API.post(`/friendrequests/reject/${requestId}`, {});
      UI.showToast('info', 'Request rejected.');
      this.refreshAllViews();
    } catch (err) {
      UI.showToast('error', err.message || 'Failed to reject request.');
    }
  },

  async cancelRequest(requestId) {
    try {
      await API.post(`/friendrequests/cancel/${requestId}`, {});
      UI.showToast('info', 'Request cancelled.');
      this.refreshAllViews();
    } catch (err) {
      UI.showToast('error', err.message || 'Failed to cancel request.');
    }
  },

  refreshAllViews() {
    this.loadUsers();
    this.loadUsersContainer('sidebar-users-container');
    this.loadPendingRequests();
    this.loadPendingRequestsContainer('sidebar-pending-container');
    this.loadConnectedFriends();
    if (typeof loadDashboardConnections === 'function') {
      loadDashboardConnections();
    }
  },

  openPrivateChat(friendId) {
    window.location.href = `chat.html?userId=${friendId}`;
  }
};

window.Users = Users;
