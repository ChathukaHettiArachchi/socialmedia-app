/* Emoji Picker Component */
const Emoji = {
  categories: {
    'Smileys': ['😊', '😂', '😍', '😎', '🥳', '😇', '🤩', '😜', '😭', '🤔', '😴', '😷', '🥳', '😈', '🤡', '👽'],
    'Hands & Hearts': ['👍', '👎', '👋', '🙌', '👏', '🤝', '🙏', '💪', '🔥', '❤️', '💖', '✨', '⭐', '💯', '🎉', '🎁'],
    'Animals & Nature': ['🐶', '🐱', '🦊', '🐻', '🐼', '🦁', '🚀', '🌈', '☀️', '🌸', '🍀', '🌺'],
    'Food & Drinks': ['🍕', '🍔', '🍟', '🍦', '☕', '🧃', '🍩', '🍿', '🍉', '🍓', '🍣', '🎂']
  },

  init(inputId, popoverId) {
    const popover = document.getElementById(popoverId);
    if (!popover) return;

    let html = '<div class="emoji-picker-content">';
    for (const [category, emojis] of Object.entries(this.categories)) {
      html += `<div class="emoji-category-title">${category}</div><div class="emoji-grid">`;
      for (const emoji of emojis) {
        html += `<button type="button" class="emoji-btn" onclick="Emoji.insertEmoji('${emoji}', '${inputId}')">${emoji}</button>`;
      }
      html += '</div>';
    }
    html += '</div>';

    popover.innerHTML = html;

    // Attach click outside listener to auto-close popover
    if (!this.listenerAttached) {
      this.listenerAttached = true;
      document.addEventListener('click', (e) => {
        const pop = document.getElementById(popoverId);
        const emojiBtn = document.getElementById('chat-emoji-btn');
        if (pop && pop.classList.contains('show')) {
          if (!pop.contains(e.target) && !emojiBtn?.contains(e.target)) {
            pop.classList.remove('show');
          }
        }
      });
    }
  },

  togglePicker(popoverId = 'emoji-popover') {
    const popover = document.getElementById(popoverId);
    if (popover) {
      popover.classList.toggle('show');
    }
  },

  closePicker(popoverId = 'emoji-popover') {
    const popover = document.getElementById(popoverId);
    if (popover) {
      popover.classList.remove('show');
    }
  },

  insertEmoji(emojiStr, inputId) {
    const input = document.getElementById(inputId);
    if (input) {
      const start = input.selectionStart || input.value.length;
      const end = input.selectionEnd || input.value.length;
      input.value = input.value.substring(0, start) + emojiStr + input.value.substring(end);
      try {
        input.setSelectionRange(start + emojiStr.length, start + emojiStr.length);
      } catch (e) {}
      
      // Dispatch input event for typing indicator and auto-grow
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
};

window.Emoji = Emoji;
