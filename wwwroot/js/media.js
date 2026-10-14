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

  // Camera Capture & Viewfinder Properties
  cameraStream: null,
  cameraFacingMode: 'environment',
  capturedPhotoFile: null,

  // Camera Open Handler (Native capture on mobile, Live Viewfinder on desktop)
  openCameraCapture() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);

    // On mobile devices, triggering <input type="file" capture="environment"> launches device camera directly
    if (isMobile) {
      const cameraInput = document.getElementById('chat-camera-input');
      if (cameraInput) {
        cameraInput.click();
        return;
      }
    }

    // On desktop, or if supported, launch Live Camera Viewfinder modal
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      this.openLiveCameraModal();
    } else {
      const cameraInput = document.getElementById('chat-camera-input');
      if (cameraInput) {
        cameraInput.click();
      } else {
        UI.showToast('error', 'Camera not supported in this browser.');
      }
    }
  },

  async openLiveCameraModal() {
    this.capturedPhotoFile = null;

    const liveControls = document.getElementById('camera-live-controls');
    const previewControls = document.getElementById('camera-preview-controls');
    const video = document.getElementById('camera-video-preview');
    const snapshotImg = document.getElementById('camera-snapshot-img');

    if (liveControls) liveControls.style.display = 'flex';
    if (previewControls) previewControls.style.display = 'none';
    if (video) video.style.display = 'block';
    if (snapshotImg) {
      snapshotImg.style.display = 'none';
      snapshotImg.src = '';
    }

    UI.openModal('camera-modal');
    await this.startCameraStream();
  },

  async startCameraStream() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.cameraFacingMode || 'environment',
          width: { ideal: 1280 },
          height: { ideal: 960 }
        },
        audio: false
      });

      const video = document.getElementById('camera-video-preview');
      if (video) {
        video.srcObject = this.cameraStream;
        await video.play().catch(() => {});
      }
    } catch (err) {
      console.warn('Live camera stream failed, falling back to camera input:', err);
      this.closeCameraModal();
      const cameraInput = document.getElementById('chat-camera-input');
      if (cameraInput) {
        cameraInput.click();
      } else {
        UI.showToast('error', 'Camera permission denied or camera unavailable.');
      }
    }
  },

  async switchCameraFacing() {
    this.cameraFacingMode = this.cameraFacingMode === 'user' ? 'environment' : 'user';
    await this.startCameraStream();
  },

  captureSnapshot() {
    const video = document.getElementById('camera-video-preview');
    const canvas = document.getElementById('camera-snapshot-canvas');
    const snapshotImg = document.getElementById('camera-snapshot-img');
    const liveControls = document.getElementById('camera-live-controls');
    const previewControls = document.getElementById('camera-preview-controls');

    if (!video || !canvas) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      this.capturedPhotoFile = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      if (snapshotImg) {
        snapshotImg.src = URL.createObjectURL(blob);
        snapshotImg.style.display = 'block';
      }
      video.style.display = 'none';
      if (liveControls) liveControls.style.display = 'none';
      if (previewControls) previewControls.style.display = 'flex';
    }, 'image/jpeg', 0.9);
  },

  retakeSnapshot() {
    this.capturedPhotoFile = null;
    const video = document.getElementById('camera-video-preview');
    const snapshotImg = document.getElementById('camera-snapshot-img');
    const liveControls = document.getElementById('camera-live-controls');
    const previewControls = document.getElementById('camera-preview-controls');

    if (snapshotImg) {
      snapshotImg.style.display = 'none';
      snapshotImg.src = '';
    }
    if (video) video.style.display = 'block';
    if (liveControls) liveControls.style.display = 'flex';
    if (previewControls) previewControls.style.display = 'none';
  },

  acceptCapturedSnapshot() {
    if (!this.capturedPhotoFile) return;
    const file = this.capturedPhotoFile;
    this.closeCameraModal();
    this.showFilePreviewModal(file, 'Image', 'images');
  },

  closeCameraModal() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    UI.closeModal('camera-modal');
  },

  // Client-side image optimizer (handles high-res camera photos, HEIC, and large sensor files)
  compressImage(file, maxDimension = 1920, quality = 0.85) {
    return new Promise((resolve) => {
      const isGif = file.type === 'image/gif' || (file.name && file.name.toLowerCase().endsWith('.gif'));
      if (isGif) {
        resolve(file);
        return;
      }

      // If already small (< 600KB), no need to re-compress
      if (file.size < 600 * 1024 && file.type === 'image/jpeg') {
        resolve(file);
        return;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height) {
          resolve(file);
          return;
        }

        // Downscale proportionally if larger than maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          let cleanName = (file.name || 'photo').replace(/\.[^/.]+$/, "") + ".jpg";
          const compressedFile = new File([blob], cleanName, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(compressedFile);
        }, 'image/jpeg', quality);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        // Fallback to original file if image decoding fails
        resolve(file);
      };

      img.src = objectUrl;
    });
  },

  // File & Camera Attachment Selection Handling
  async handleFileAttachmentSelect(event) {
    let file = event.target.files && event.target.files[0];
    if (!file) return;

    // Reset input value so re-selecting same file/photo triggers onchange
    event.target.value = '';

    const extension = file.name && file.name.includes('.')
      ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
      : '';

    const isImage = (file.type && file.type.startsWith('image/')) ||
      ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp'].includes(extension);

    let messageType = 'File';
    let category = 'files';

    if (isImage) {
      messageType = 'Image';
      category = 'images';
      try {
        file = await this.compressImage(file);
      } catch (err) {
        console.warn('Image optimization skipped:', err);
      }
    } else if (['.mp4', '.webm', '.mov', '.m4v'].includes(extension) || (file.type && file.type.startsWith('video/'))) {
      messageType = 'Video';
      category = 'videos';
    } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(extension) || (file.type && file.type.startsWith('audio/'))) {
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
        const objectUrl = URL.createObjectURL(file);
        previewContainer.innerHTML = `<img src="${objectUrl}" style="max-width: 100%; max-height: 260px; border-radius: 12px; object-fit: contain;">`;
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
      const fileInput = document.getElementById('chat-file-input');
      if (fileInput) fileInput.value = '';
      const cameraInput = document.getElementById('chat-camera-input');
      if (cameraInput) cameraInput.value = '';
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
