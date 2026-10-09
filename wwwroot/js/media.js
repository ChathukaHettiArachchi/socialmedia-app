/* Voice Recorder, Media Upload & Lightbox Preview Module */
const Media = {
  mediaRecorder: null,
  audioChunks: [],
  recordingTimer: null,
  recordingSeconds: 0,
  recordedBlob: null,

  async startVoiceRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      UI.showToast('error', 'Audio recording is not supported in your browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.recordedBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        this.showAudioPreview();
      };

      this.mediaRecorder.start();
      this.recordingSeconds = 0;
      this.updateRecordingUI(true);

      this.recordingTimer = setInterval(() => {
        this.recordingSeconds++;
        const timerText = document.getElementById('recording-timer-text');
        if (timerText) {
          const mins = Math.floor(this.recordingSeconds / 60).toString().padStart(2, '0');
          const secs = (this.recordingSeconds % 60).toString().padStart(2, '0');
          timerText.textContent = `${mins}:${secs}`;
        }
      }, 1000);

    } catch (err) {
      console.error('Microphone Access Error:', err);
      UI.showToast('error', 'Microphone access was denied or is unavailable.');
    }
  },

  stopVoiceRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      clearInterval(this.recordingTimer);
      this.updateRecordingUI(false);
    }
  },

  cancelVoiceRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.audioChunks = [];
      this.recordedBlob = null;
    }
    clearInterval(this.recordingTimer);
    this.updateRecordingUI(false);
    const modal = document.getElementById('audio-preview-modal');
    if (modal) modal.classList.remove('show');
  },

  updateRecordingUI(isRecording) {
    const recordingBar = document.getElementById('voice-recording-bar');
    if (recordingBar) {
      recordingBar.style.display = isRecording ? 'flex' : 'none';
    }
  },

  showAudioPreview() {
    if (!this.recordedBlob) return;
    const audioUrl = URL.createObjectURL(this.recordedBlob);
    const audioPlayer = document.getElementById('audio-preview-player');
    if (audioPlayer) {
      audioPlayer.src = audioUrl;
    }
    UI.openModal('audio-preview-modal');
  },

  async sendRecordedAudio() {
    if (!this.recordedBlob || !Chat.activeConversation) return;

    try {
      const file = new File([this.recordedBlob], 'voice-message.webm', { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'audio');

      UI.showToast('info', 'Uploading voice message...');
      const uploadResult = await API.post('/files/upload', formData, true);

      // Send Audio message via REST or SignalR
      const sentMsg = await API.post('/messages', {
        conversationId: Chat.activeConversation.id,
        textContent: uploadResult.fileUrl,
        messageType: 'Audio',
        fileId: uploadResult.fileId
      });

      if (sentMsg) {
        Chat.handleReceiveMessage(sentMsg);
      }

      UI.closeModal('audio-preview-modal');
      UI.showToast('success', 'Voice message sent!');
      this.recordedBlob = null;
    } catch (err) {
      UI.showToast('error', err.message || 'Failed to send voice message.');
    }
  },

  // File Upload Handling (Images, Videos, Files)
  handleFileAttachmentSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    let messageType = 'File';
    let category = 'files';

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) {
      messageType = 'Image';
      category = 'images';
    } else if (['.mp4', '.webm', '.mov', '.m4v'].includes(extension)) {
      messageType = 'Video';
      category = 'videos';
    } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(extension)) {
      messageType = 'Audio';
      category = 'audio';
    }

    this.showFilePreviewModal(file, messageType, category);
  },

  showFilePreviewModal(file, messageType, category) {
    const previewContainer = document.getElementById('file-preview-content');
    const title = document.getElementById('file-preview-title');
    const sendBtn = document.getElementById('file-preview-send-btn');

    if (title) title.textContent = `Send ${messageType}`;
    if (previewContainer) {
      if (messageType === 'Image') {
        const reader = new FileReader();
        reader.onload = (e) => {
          previewContainer.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 260px; border-radius: 12px; object-fit: contain;">`;
        };
        reader.readAsDataURL(file);
      } else if (messageType === 'Video') {
        const videoUrl = URL.createObjectURL(file);
        previewContainer.innerHTML = `<video controls src="${videoUrl}" style="max-width: 100%; max-height: 260px; border-radius: 12px;"></video>`;
      } else {
        previewContainer.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <i class="fa-solid fa-file" style="font-size: 3rem; color: var(--primary); margin-bottom: 10px;"></i>
            <div style="font-weight: 700; font-size: 1rem;">${UI.escapeHtml(file.name)}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">${(file.size / (1024 * 1024)).toFixed(2)} MB</div>
          </div>
        `;
      }
    }

    if (sendBtn) {
      sendBtn.onclick = () => this.uploadAndSendFile(file, messageType, category);
    }

    UI.openModal('file-preview-modal');
  },

  async uploadAndSendFile(file, messageType, category) {
    if (!Chat.activeConversation) return;

    try {
      const sendBtn = document.getElementById('file-preview-send-btn');
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);

      const uploadResult = await API.post('/files/upload', formData, true);

      const sentMsg = await API.post('/messages', {
        conversationId: Chat.activeConversation.id,
        textContent: uploadResult.fileUrl,
        messageType: messageType,
        fileId: uploadResult.fileId
      });

      if (sentMsg) {
        Chat.handleReceiveMessage(sentMsg);
      }

      UI.closeModal('file-preview-modal');
      UI.showToast('success', `${messageType} sent!`);
      document.getElementById('chat-file-input').value = '';
    } catch (err) {
      UI.showToast('error', err.message || 'File upload failed.');
    } finally {
      const sendBtn = document.getElementById('file-preview-send-btn');
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = 'Send File <i class="fa-solid fa-paper-plane"></i>';
      }
    }
  },

  openLightbox(imageUrl) {
    const lightboxImg = document.getElementById('lightbox-img');
    if (lightboxImg) {
      lightboxImg.src = imageUrl;
      UI.openModal('lightbox-modal');
    }
  }
};

window.Media = Media;
