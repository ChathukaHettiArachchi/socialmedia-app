/* UI Utilities & Toast Notification Module */
const UI = {
  showToast(type, message, duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconClass = 'fa-circle-info';
    let accentBorder = 'rgba(56, 189, 248, 0.45)';
    let iconColor = '#38bdf8';

    if (type === 'success') {
      iconClass = 'fa-circle-check';
      accentBorder = 'rgba(34, 197, 94, 0.45)';
      iconColor = '#4ade80';
    } else if (type === 'error') {
      iconClass = 'fa-circle-exclamation';
      accentBorder = 'rgba(239, 68, 68, 0.45)';
      iconColor = '#f87171';
    }

    // Force inline transparent styling with !important to bypass any cached CSS
    toast.style.cssText = `
      background: rgba(15, 23, 42, 0.82) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      border: 1px solid ${accentBorder} !important;
      border-radius: 20px !important;
      padding: 6px 14px !important;
      font-size: 0.81rem !important;
      font-weight: 500 !important;
      color: #f1f5f9 !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
      width: fit-content !important;
      max-width: 90vw !important;
      pointer-events: auto !important;
      box-sizing: border-box !important;
      animation: toastSlideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
    `;

    toast.innerHTML = `
      <i class="fa-solid ${iconClass}" style="color: ${iconColor} !important; font-size: 0.85rem !important; flex-shrink: 0 !important;"></i>
      <span style="color: #f1f5f9 !important; font-weight: 500 !important;">${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px) scale(0.96)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  },

  getAvatarUrl(user) {
    if (user && user.profileImageUrl) {
      return user.profileImageUrl;
    }
    const name = (user && (user.fullName || user.username)) || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b82f6&color=fff&bold=true`;
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      document.body.appendChild(modal);
      modal.classList.add('show');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
    }
  }
};

window.UI = UI;
