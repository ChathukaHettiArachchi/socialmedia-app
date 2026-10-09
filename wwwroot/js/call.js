/* WebRTC Voice & Video Calling + Live Screen Sharing Module */
const Call = {
  peerConnection: null,
  localStream: null,
  screenStream: null,
  remoteAudio: null,
  callPartner: null,
  callTimer: null,
  callSeconds: 0,
  isMuted: false,
  isCameraOff: false,
  peerIsMuted: false,
  peerIsCameraOff: false,
  isScreenSharing: false,
  isVideoCall: false,
  isInitiator: false,
  remoteStream: null,
  incomingCallData: null,
  ringtoneAudioCtx: null,
  ringtoneInterval: null,
  canvasAnimId: null,

  get iceServers() {
    return {
      iceServers: (window.CONFIG && window.CONFIG.ICE_SERVERS) ? window.CONFIG.ICE_SERVERS : [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  },

  init() {
    this.createAudioVideoElements();
    this.registerSignalREvents();
  },

  createAudioVideoElements() {
    if (!document.getElementById('remote-voice-audio')) {
      const audio = document.createElement('audio');
      audio.id = 'remote-voice-audio';
      audio.autoplay = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      this.remoteAudio = audio;
    } else {
      this.remoteAudio = document.getElementById('remote-voice-audio');
    }
  },

  registerSignalREvents() {
    if (typeof Chat !== 'undefined' && Chat.connection) {
      this.bindHubHandlers(Chat.connection);
    } else {
      const checkInterval = setInterval(() => {
        if (typeof Chat !== 'undefined' && Chat.connection) {
          clearInterval(checkInterval);
          this.bindHubHandlers(Chat.connection);
        }
      }, 500);
    }
  },

  bindHubHandlers(connection) {
    if (!connection) return;
    try {
      connection.off('VoiceCallOffered');
      connection.off('VoiceCallAnswered');
      connection.off('VideoCallOffered');
      connection.off('VideoCallAnswered');
      connection.off('IceCandidateReceived');
      connection.off('CallEnded');
      connection.off('CallRejected');
      connection.off('PeerMediaStateChanged');
      connection.off('VideoUpgradeRequested');
      connection.off('VideoUpgradeAccepted');
      connection.off('VideoUpgradeDeclined');
      connection.off('CallHistoryUpdated');
    } catch (e) {}

    connection.on('VoiceCallOffered', (data) => this.handleVoiceCallOffered(data));
    connection.on('VoiceCallAnswered', (data) => this.handleVoiceCallAnswered(data));
    connection.on('VideoCallOffered', (data) => this.handleVideoCallOffered(data));
    connection.on('VideoCallAnswered', (data) => this.handleVideoCallAnswered(data));
    connection.on('IceCandidateReceived', (data) => this.handleIceCandidateReceived(data));
    connection.on('CallEnded', (data) => this.handleCallEnded(data));
    connection.on('CallRejected', (data) => this.handleCallRejected(data));
    connection.on('PeerMediaStateChanged', (data) => this.handlePeerMediaStateChanged(data));
    connection.on('VideoUpgradeRequested', (data) => this.handleVideoUpgradeRequested(data));
    connection.on('VideoUpgradeAccepted', (data) => this.handleVideoUpgradeAccepted(data));
    connection.on('VideoUpgradeDeclined', (data) => this.handleVideoUpgradeDeclined(data));
    connection.on('CallHistoryUpdated', (data) => this.loadCallHistory());
  },

  async getLocalAudioStream() {
    try {
      if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        UI.showToast('error', '⚠️ Camera & Microphone access is BLOCKED by your browser because this site is loaded over unsecure HTTP. Please use HTTPS or enable browser flags.');
      }
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
    } catch (err) {
      console.warn('Microphone unavailable or permission denied. Using synthetic audio stream:', err);
    }
    return this.createSilentAudioStream();
  },

  createSilentAudioStream() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const dst = oscillator.connect(audioCtx.createMediaStreamDestination());
      oscillator.start();
      const stream = dst.stream;
      stream.getAudioTracks().forEach(track => { track.enabled = true; });
      return stream;
    } catch (err) {
      console.error('Failed to create synthetic audio stream:', err);
      return new MediaStream();
    }
  },

  async getLocalVideoStream() {
    try {
      if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        UI.showToast('error', '⚠️ Camera & Microphone access is BLOCKED by your browser because this site is loaded over unsecure HTTP. Please use HTTPS or enable browser flags.');
      }
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      }
    } catch (err) {
      console.warn('Camera unavailable or permission denied. Using synthetic canvas video stream:', err);
      UI.showToast('info', 'Webcam unavailable. Connecting with simulated video stream.');
    }
    return this.createCanvasVideoStream();
  },

  createCanvasVideoStream() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let angle = 0;

    const render = () => {
      angle += 0.04;
      // Gradient background
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#0284c7');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Animated glowing circle
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.beginPath();
      ctx.arc(0, 0, 75 + Math.sin(angle) * 8, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.shadowColor = '#60a5fa';
      ctx.shadowBlur = 25;
      ctx.fill();

      // Camera icon text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📷 LIVE', 0, 0);
      ctx.restore();

      this.canvasAnimId = requestAnimationFrame(render);
    };

    render();

    const audioStream = this.createSilentAudioStream();
    const canvasStream = canvas.captureStream(30);

    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioStream.getAudioTracks()
    ]);
    return combined;
  },

  // --- Voice Call Flow ---

  async startVoiceCall(targetUserId, targetFullName, targetAvatarUrl) {
    if (!targetUserId || targetUserId === 'undefined' || targetUserId === 'null') {
      UI.showToast('error', 'Select a user to call.');
      return;
    }

    if (!Chat.connection || Chat.connection.state !== signalR.HubConnectionState.Connected) {
      UI.showToast('error', 'SignalR is not connected. Reconnecting...');
      Chat.initSignalR();
      return;
    }

    try {
      this.isVideoCall = false;
      this.isInitiator = true;
      this.callPartner = {
        id: targetUserId,
        fullName: targetFullName || 'Connected Friend',
        avatarUrl: targetAvatarUrl || UI.getAvatarUrl({ fullName: targetFullName })
      };

      this.openVoiceCallModal(`Calling ${UI.escapeHtml(this.callPartner.fullName)}...`);

      this.localStream = await this.getLocalAudioStream();

      this.peerConnection = new RTCPeerConnection(this.iceServers);
      this.setupPeerConnectionOntrack(this.peerConnection);

      if (this.localStream && this.localStream.getTracks) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }

      try {
        this.peerConnection.addTransceiver('video', { direction: 'sendrecv' });
      } catch (e) {
        console.warn('Could not add video transceiver:', e);
      }

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && Chat.connection) {
          const candidateData = event.candidate.toJSON ? event.candidate.toJSON() : {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          };
          Chat.connection.invoke('SendIceCandidate', targetUserId, candidateData).catch(e => console.error(e));
        }
      };

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      const plainOffer = {
        type: offer.type || this.peerConnection.localDescription.type,
        sdp: offer.sdp || this.peerConnection.localDescription.sdp
      };

      await Chat.connection.invoke('SendVoiceCallOffer', targetUserId, plainOffer);

    } catch (err) {
      console.error('Start Voice Call Error:', err);
      UI.showToast('error', 'Unable to initiate voice call: ' + (err.message || 'Error occurred.'));
      this.cleanupCall();
    }
  },

  isForMe(data) {
    if (!data) return false;
    const currentUserId = Auth.currentUser ? (Auth.currentUser.id || Auth.currentUser.Id) : null;
    const targetUserId = data.targetUserId || data.TargetUserId;
    if (currentUserId && targetUserId) {
      return String(currentUserId).toLowerCase() === String(targetUserId).toLowerCase();
    }
    return true;
  },

  handleVoiceCallOffered(data) {
    if (!this.isForMe(data)) return;

    this.incomingCallData = data;
    this.isVideoCall = false;
    this.playRingtone();

    const callerNameStr = data.callerFullName || data.callerUsername || 'Someone';
    UI.showToast('info', `📞 Incoming voice call from ${callerNameStr}`);

    const callerName = document.getElementById('incoming-caller-name');
    const callerAvatar = document.getElementById('incoming-caller-avatar');

    if (callerName) callerName.textContent = callerNameStr;
    if (callerAvatar) callerAvatar.src = data.callerAvatarUrl || UI.getAvatarUrl({ fullName: data.callerFullName, username: data.callerUsername });

    UI.openModal('incoming-voice-call-modal');
  },

  async acceptIncomingCall() {
    if (!this.incomingCallData) return;
    this.stopRingtone();
    UI.closeModal('incoming-voice-call-modal');

    const data = this.incomingCallData;
    this.isInitiator = false;
    this.callPartner = {
      id: data.callerId,
      fullName: data.callerFullName || data.callerUsername,
      avatarUrl: data.callerAvatarUrl || UI.getAvatarUrl({ fullName: data.callerFullName })
    };

    try {
      this.openVoiceCallModal(`Connecting call with ${UI.escapeHtml(this.callPartner.fullName)}...`);

      this.localStream = await this.getLocalAudioStream();

      this.peerConnection = new RTCPeerConnection(this.iceServers);
      this.setupPeerConnectionOntrack(this.peerConnection);

      if (this.localStream && this.localStream.getTracks) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }

      try {
        this.peerConnection.addTransceiver('video', { direction: 'sendrecv' });
      } catch (e) {
        console.warn('Could not add video transceiver:', e);
      }

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && Chat.connection) {
          const candidateData = event.candidate.toJSON ? event.candidate.toJSON() : {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          };
          Chat.connection.invoke('SendIceCandidate', data.callerId, candidateData).catch(e => console.error(e));
        }
      };

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdpOffer));

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      const plainAnswer = {
        type: answer.type || this.peerConnection.localDescription.type,
        sdp: answer.sdp || this.peerConnection.localDescription.sdp
      };

      await Chat.connection.invoke('SendVoiceCallAnswer', data.callerId, plainAnswer);
      this.startCallTimer();

    } catch (err) {
      console.error('Accept Voice Call Error:', err);
      UI.showToast('error', 'Failed to accept voice call: ' + (err.message || 'Error occurred.'));
      this.endCall();
    }
  },

  async handleVoiceCallAnswered(data) {
    if (!this.isForMe(data)) return;
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdpAnswer));
      this.startCallTimer();
    } catch (err) {
      console.error('Error setting remote answer:', err);
    }
  },

  // --- Video Call Flow & Screen Sharing ---

  async startVideoCall(targetUserId, targetFullName, targetAvatarUrl) {
    if (!targetUserId || targetUserId === 'undefined' || targetUserId === 'null') {
      UI.showToast('error', 'Select a user to call.');
      return;
    }

    if (!Chat.connection || Chat.connection.state !== signalR.HubConnectionState.Connected) {
      UI.showToast('error', 'SignalR is not connected. Reconnecting...');
      Chat.initSignalR();
      return;
    }

    try {
      this.isVideoCall = true;
      this.isInitiator = true;
      this.callPartner = {
        id: targetUserId,
        fullName: targetFullName || 'Connected Friend',
        avatarUrl: targetAvatarUrl || UI.getAvatarUrl({ fullName: targetFullName })
      };

      this.openVideoCallModal(`Calling ${UI.escapeHtml(this.callPartner.fullName)}...`);

      this.localStream = await this.getLocalVideoStream();

      const localVideoEl = document.getElementById('local-video-element');
      if (localVideoEl) localVideoEl.srcObject = this.localStream;

      this.peerConnection = new RTCPeerConnection(this.iceServers);
      this.setupPeerConnectionOntrack(this.peerConnection);

      if (this.localStream && this.localStream.getTracks) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }

      this.peerConnection.ontrack = (event) => {
        const remoteVideoEl = document.getElementById('remote-video-element');
        if (remoteVideoEl && event.streams[0]) {
          remoteVideoEl.srcObject = event.streams[0];
        }
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && Chat.connection) {
          const candidateData = event.candidate.toJSON ? event.candidate.toJSON() : {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          };
          Chat.connection.invoke('SendIceCandidate', targetUserId, candidateData).catch(e => console.error(e));
        }
      };

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      const plainOffer = {
        type: offer.type || this.peerConnection.localDescription.type,
        sdp: offer.sdp || this.peerConnection.localDescription.sdp
      };

      await Chat.connection.invoke('SendVideoCallOffer', targetUserId, plainOffer);

    } catch (err) {
      console.error('Start Video Call Error:', err);
      UI.showToast('error', 'Unable to initiate video call: ' + (err.message || 'Error occurred.'));
      this.cleanupCall();
    }
  },

  async handleVideoCallOffered(data) {
    if (!this.isForMe(data)) return;

    // In-call WebRTC SDP offer renegotiation (e.g. voice to video upgrade)
    if (this.callPartner && String(this.callPartner.id).toLowerCase() === String(data.callerId).toLowerCase()) {
      try {
        this.isVideoCall = true;
        this.isCameraOff = false;
        if (!this.localStream || !this.localStream.getVideoTracks().length) {
          const vidStream = await this.getLocalVideoStream();
          if (vidStream) {
            vidStream.getAudioTracks().forEach(t => t.stop());
            const vTrack = vidStream.getVideoTracks()[0];
            if (vTrack && this.localStream) {
              this.localStream.addTrack(vTrack);
            }
          }
        }

        if (this.peerConnection) {
          const videoTrack = this.localStream ? this.localStream.getVideoTracks()[0] : null;
          if (videoTrack) {
            videoTrack.enabled = true;
            const senders = this.peerConnection.getSenders();
            let videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (!videoSender) {
              videoSender = senders.find(s => s.track === null || (s.dtlsTransport && !s.track));
            }
            if (!videoSender && senders.length > 1) {
              videoSender = senders[1];
            }

            if (videoSender) {
              await videoSender.replaceTrack(videoTrack).catch(e => console.warn('replaceTrack warning:', e));
            } else {
              try {
                this.peerConnection.addTrack(videoTrack, this.localStream);
              } catch (e) {}
            }
          }

          this.setupPeerConnectionOntrack(this.peerConnection);

          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdpOffer));
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);

          const plainAnswer = {
            type: answer.type || this.peerConnection.localDescription.type,
            sdp: answer.sdp || this.peerConnection.localDescription.sdp
          };

          await Chat.connection.invoke('SendVideoCallAnswer', String(data.callerId), plainAnswer);
        }

        const voiceModal = document.getElementById('voice-call-full-modal');
        if (voiceModal) voiceModal.style.display = 'none';

        const voiceBar = document.getElementById('active-voice-call-bar');
        if (voiceBar) voiceBar.style.display = 'none';

        this.openVideoCallModal("In Video Call");
        this.bindRemoteStreamToElements();
      } catch (err) {
        console.error('Error handling in-call video offer:', err);
      }
      return;
    }

    this.incomingCallData = data;
    this.isVideoCall = true;
    this.playRingtone();

    const callerNameStr = data.callerFullName || data.callerUsername || 'Someone';
    UI.showToast('info', `📹 Incoming video call from ${callerNameStr}`);

    const callerName = document.getElementById('incoming-video-caller-name');
    const callerAvatar = document.getElementById('incoming-video-caller-avatar');

    if (callerName) callerName.textContent = callerNameStr;
    if (callerAvatar) callerAvatar.src = data.callerAvatarUrl || UI.getAvatarUrl({ fullName: data.callerFullName, username: data.callerUsername });

    UI.openModal('incoming-video-call-modal');
  },

  async acceptIncomingVideoCall() {
    if (!this.incomingCallData) return;
    this.stopRingtone();
    UI.closeModal('incoming-video-call-modal');

    const data = this.incomingCallData;
    this.isVideoCall = true;
    this.isInitiator = false;
    this.callPartner = {
      id: data.callerId,
      fullName: data.callerFullName || data.callerUsername,
      avatarUrl: data.callerAvatarUrl || UI.getAvatarUrl({ fullName: data.callerFullName })
    };

    try {
      this.openVideoCallModal(`Connecting video call with ${UI.escapeHtml(this.callPartner.fullName)}...`);

      this.localStream = await this.getLocalVideoStream();

      const localVideoEl = document.getElementById('local-video-element');
      if (localVideoEl) localVideoEl.srcObject = this.localStream;

      this.peerConnection = new RTCPeerConnection(this.iceServers);
      this.setupPeerConnectionOntrack(this.peerConnection);

      if (this.localStream && this.localStream.getTracks) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }

      this.peerConnection.ontrack = (event) => {
        const remoteVideoEl = document.getElementById('remote-video-element');
        if (remoteVideoEl && event.streams[0]) {
          remoteVideoEl.srcObject = event.streams[0];
        }
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && Chat.connection) {
          const candidateData = event.candidate.toJSON ? event.candidate.toJSON() : {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          };
          Chat.connection.invoke('SendIceCandidate', data.callerId, candidateData).catch(e => console.error(e));
        }
      };

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdpOffer));

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      const plainAnswer = {
        type: answer.type || this.peerConnection.localDescription.type,
        sdp: answer.sdp || this.peerConnection.localDescription.sdp
      };

      await Chat.connection.invoke('SendVideoCallAnswer', data.callerId, plainAnswer);
      this.startCallTimer();

    } catch (err) {
      console.error('Accept Video Call Error:', err);
      UI.showToast('error', 'Failed to accept video call: ' + (err.message || 'Error occurred.'));
      this.endCall();
    }
  },

  async handleVideoCallAnswered(data) {
    if (!this.isForMe(data)) return;
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdpAnswer));
      this.startCallTimer();
    } catch (err) {
      console.error('Error setting remote video answer:', err);
    }
  },

  // --- Live Screen Sharing ---

  async toggleScreenShare() {
    if (!this.peerConnection) return;

    if (this.isScreenSharing) {
      this.stopScreenSharing();
    } else {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          UI.showToast('error', 'Screen sharing is not supported in this browser.');
          return;
        }

        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in RTCPeerConnection sender
        const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        }

        const localVideoEl = document.getElementById('local-video-element');
        if (localVideoEl) localVideoEl.srcObject = screenStream;

        this.screenStream = screenStream;
        this.isScreenSharing = true;

        const screenBtn = document.getElementById('video-screen-share-btn');
        if (screenBtn) screenBtn.classList.add('active-screen');

        UI.showToast('success', 'Live screen sharing started!');

        // Listen for user stopping screen share via browser bar
        screenTrack.onended = () => {
          this.stopScreenSharing();
        };

      } catch (err) {
        console.error('Screen sharing error:', err);
        UI.showToast('error', 'Screen sharing cancelled or failed.');
      }
    }
  },

  async stopScreenSharing() {
    if (!this.isScreenSharing) return;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    // Restore original video track
    if (this.localStream && this.peerConnection) {
      const cameraTrack = this.localStream.getVideoTracks()[0];
      const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender && cameraTrack) {
        await sender.replaceTrack(cameraTrack);
      }

      const localVideoEl = document.getElementById('local-video-element');
      if (localVideoEl) localVideoEl.srcObject = this.localStream;
    }

    this.isScreenSharing = false;
    const screenBtn = document.getElementById('video-screen-share-btn');
    if (screenBtn) screenBtn.classList.remove('active-screen');

    UI.showToast('info', 'Screen sharing stopped.');
  },

  toggleCamera() {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      this.isCameraOff = !this.isCameraOff;
      videoTrack.enabled = !this.isCameraOff;

      const camBtn = document.getElementById('video-camera-btn');
      if (camBtn) {
        camBtn.innerHTML = this.isCameraOff
          ? `<i class="fa-solid fa-video-slash"></i>`
          : `<i class="fa-solid fa-video"></i>`;
        camBtn.classList.toggle('muted', this.isCameraOff);
      }
      this.notifyMediaStateChanged();
    }
  },

  handlePeerMediaStateChanged(data) {
    if (!this.isForMe(data)) return;
    const isMuted = data.isMuted !== undefined ? data.isMuted : (data.IsMuted !== undefined ? data.IsMuted : false);
    const isCameraOff = data.isCameraOff !== undefined ? data.isCameraOff : (data.IsCameraOff !== undefined ? data.IsCameraOff : false);

    this.peerIsMuted = isMuted;
    this.peerIsCameraOff = isCameraOff;

    this.updatePeerMediaIndicators();
  },

  updatePeerMediaIndicators() {
    const voiceMuteBadge = document.getElementById('peer-voice-mute-badge');
    if (voiceMuteBadge) {
      voiceMuteBadge.style.display = this.peerIsMuted ? 'inline-flex' : 'none';
    }

    const fullVoiceMuteBadge = document.getElementById('voice-modal-peer-mute');
    if (fullVoiceMuteBadge) {
      fullVoiceMuteBadge.style.display = this.peerIsMuted ? 'inline-flex' : 'none';
    }

    const avatarMuteBadge = document.getElementById('voice-modal-avatar-mute-badge');
    if (avatarMuteBadge) {
      avatarMuteBadge.style.display = this.peerIsMuted ? 'flex' : 'none';
    }

    const videoMuteBadge = document.getElementById('peer-video-mute-badge');
    if (videoMuteBadge) {
      videoMuteBadge.style.display = this.peerIsMuted ? 'inline-flex' : 'none';
    }

    const cameraOffOverlay = document.getElementById('remote-camera-off-overlay');
    if (cameraOffOverlay) {
      cameraOffOverlay.style.display = this.peerIsCameraOff ? 'flex' : 'none';
    }

    const avatarMuteIcon = document.getElementById('remote-camera-off-avatar-mute');
    if (avatarMuteIcon) {
      avatarMuteIcon.style.display = this.peerIsMuted ? 'flex' : 'none';
    }
  },

  notifyMediaStateChanged() {
    if (this.callPartner && Chat.connection && Chat.connection.state === signalR.HubConnectionState.Connected) {
      try {
        Chat.connection.invoke('SendMediaStateChanged', String(this.callPartner.id), this.isMuted, this.isCameraOff);
      } catch (e) {
        console.error('Failed to notify peer of media state change:', e);
      }
    }
  },

  // --- Video Call Upgrade Flow ---

  requestVideoUpgrade() {
    if (this.isVideoCall) {
      this.toggleCamera();
      return;
    }
    if (this.callPartner && Chat.connection && Chat.connection.state === signalR.HubConnectionState.Connected) {
      try {
        Chat.connection.invoke('RequestVideoUpgrade', String(this.callPartner.id));
        UI.showToast('info', '📹 Video call request sent to friend...');
      } catch (e) {
        console.error('Failed to send video upgrade request:', e);
      }
    }
  },

  handleVideoUpgradeRequested(data) {
    if (!this.isForMe(data)) return;

    let existing = document.getElementById('video-upgrade-request-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'video-upgrade-request-modal';
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 1000005 !important;
      background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(10px);
      display: flex; align-items: center; justify-content: center; padding: 20px;
    `;

    const callerName = UI.escapeHtml(data.callerName || 'Friend');

    modal.innerHTML = `
      <div style="background: #1e293b; border: 1.5px solid var(--primary); border-radius: 20px; padding: 28px; width: 90%; max-width: 400px; text-align: center; color: #fff; box-shadow: 0 20px 50px rgba(0,0,0,0.6);">
        <div style="font-size: 3rem; color: var(--primary); margin-bottom: 12px;">
          <i class="fa-solid fa-video"></i>
        </div>
        <h3 style="font-size: 1.3rem; font-weight: 700; margin-bottom: 8px;">Switch to Video Call?</h3>
        <p style="color: #94a3b8; font-size: 0.95rem; margin-bottom: 24px; line-height: 1.5;">
          <strong>${callerName}</strong> requested to turn on camera and upgrade to a video call.
        </p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button class="btn btn-secondary" onclick="Call.declineVideoUpgrade('${data.callerId}')" style="flex: 1; padding: 10px; border-radius: 12px; font-weight: 600;">
            <i class="fa-solid fa-xmark"></i> Decline
          </button>
          <button class="btn btn-primary" onclick="Call.acceptVideoUpgrade('${data.callerId}')" style="flex: 1; padding: 10px; border-radius: 12px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); font-weight: 600;">
            <i class="fa-solid fa-video"></i> Accept
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  },

  acceptVideoUpgrade(callerId) {
    const modal = document.getElementById('video-upgrade-request-modal');
    if (modal) modal.remove();

    if (Chat.connection && Chat.connection.state === signalR.HubConnectionState.Connected) {
      try {
        Chat.connection.invoke('AcceptVideoUpgrade', callerId);
      } catch (e) {}
    }
    this.upgradeToVideoCall();
  },

  declineVideoUpgrade(callerId) {
    const modal = document.getElementById('video-upgrade-request-modal');
    if (modal) modal.remove();

    if (Chat.connection && Chat.connection.state === signalR.HubConnectionState.Connected) {
      try {
        Chat.connection.invoke('DeclineVideoUpgrade', callerId);
      } catch (e) {}
    }
  },

  handleVideoUpgradeAccepted(data) {
    if (!this.isForMe(data)) return;
    UI.showToast('success', '📹 Video call request accepted!');
    this.upgradeToVideoCall();
  },

  handleVideoUpgradeDeclined(data) {
    if (!this.isForMe(data)) return;
    UI.showToast('info', 'Video call request was declined.');
  },

  async upgradeToVideoCall() {
    try {
      this.isVideoCall = true;
      this.isCameraOff = false;

      // Ensure local stream has camera video track
      if (!this.localStream || !this.localStream.getVideoTracks().length) {
        const vidStream = await this.getLocalVideoStream();
        if (vidStream) {
          vidStream.getAudioTracks().forEach(t => t.stop());
          const vTrack = vidStream.getVideoTracks()[0];
          if (vTrack && this.localStream) {
            this.localStream.addTrack(vTrack);
          } else if (vTrack) {
            this.localStream = new MediaStream([vTrack]);
          }
        }
      }

      if (this.localStream && this.peerConnection) {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = true;
          const senders = this.peerConnection.getSenders();
          let videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (!videoSender) {
            videoSender = senders.find(s => s.track === null || (s.dtlsTransport && !s.track));
          }
          if (!videoSender && senders.length > 1) {
            videoSender = senders[1];
          }

          if (videoSender) {
            await videoSender.replaceTrack(videoTrack).catch(e => console.warn('replaceTrack warning:', e));
          } else {
            try {
              this.peerConnection.addTrack(videoTrack, this.localStream);
            } catch (e) {}
          }
        }

        // Send SDP offer for video upgrade to partner
        if (this.callPartner && Chat.connection && Chat.connection.state === signalR.HubConnectionState.Connected) {
          const offer = await this.peerConnection.createOffer();
          await this.peerConnection.setLocalDescription(offer);
          const plainOffer = {
            type: offer.type || this.peerConnection.localDescription.type,
            sdp: offer.sdp || this.peerConnection.localDescription.sdp
          };
          await Chat.connection.invoke('SendVideoCallOffer', String(this.callPartner.id), plainOffer);
        }
      }

      const voiceModal = document.getElementById('voice-call-full-modal');
      if (voiceModal) voiceModal.style.display = 'none';

      const voiceBar = document.getElementById('active-voice-call-bar');
      if (voiceBar) voiceBar.style.display = 'none';

      this.openVideoCallModal(`In Video Call`);
      this.bindRemoteStreamToElements();
      this.notifyMediaStateChanged();
    } catch (err) {
      console.error('Error upgrading to video call:', err);
    }
  },

  // --- Common Signaling Handlers & Utilities ---

  async handleIceCandidateReceived(data) {
    if (!this.isForMe(data)) return;
    if (this.peerConnection && data.candidate) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    }
  },

  handleCallEnded(data) {
    if (!this.isForMe(data)) return;
    UI.showToast('info', 'Call ended.');
    this.cleanupCall();
  },

  handleCallRejected(data) {
    if (!this.isForMe(data)) return;
    UI.showToast('info', 'Call was declined.');
    this.cleanupCall();
  },

  async endCall() {
    if (this.callPartner && Chat.connection && Chat.connection.state === signalR.HubConnectionState.Connected) {
      try {
        await Chat.connection.invoke('EndCall', this.callPartner.id);
      } catch (e) {}
    }
    this.cleanupCall();
  },

  async rejectIncomingCall() {
    this.stopRingtone();
    UI.closeModal('incoming-voice-call-modal');
    UI.closeModal('incoming-video-call-modal');
    if (this.incomingCallData && Chat.connection && Chat.connection.state === signalR.HubConnectionState.Connected) {
      try {
        await Chat.connection.invoke('RejectCall', this.incomingCallData.callerId);
      } catch (e) {}
    }
    this.incomingCallData = null;
  },

  toggleMute() {
    if (!this.localStream) return;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      this.isMuted = !this.isMuted;
      audioTrack.enabled = !this.isMuted;

      const muteBtn = document.getElementById('call-mute-btn') || document.getElementById('video-mute-btn');
      if (muteBtn) {
        muteBtn.innerHTML = this.isMuted
          ? `<i class="fa-solid fa-microphone-slash"></i>`
          : `<i class="fa-solid fa-microphone"></i>`;
        muteBtn.classList.toggle('muted', this.isMuted);
      }
      this.notifyMediaStateChanged();
    }
  },

  startCallTimer() {
    this.callSeconds = 0;
    clearInterval(this.callTimer);

    const overlayTitle = document.getElementById('active-call-status');
    const fullStatusEl = document.getElementById('voice-modal-status');
    const videoTimerEl = document.getElementById('video-call-timer-display');

    this.notifyMediaStateChanged();

    this.callTimer = setInterval(() => {
      this.callSeconds++;
      const mins = Math.floor(this.callSeconds / 60).toString().padStart(2, '0');
      const secs = (this.callSeconds % 60).toString().padStart(2, '0');
      const timeText = `${mins}:${secs}`;

      if (overlayTitle) {
        overlayTitle.textContent = `In Call with ${this.callPartner ? this.callPartner.fullName : 'User'} (${timeText})`;
      }
      if (fullStatusEl) {
        fullStatusEl.textContent = timeText;
      }
      if (videoTimerEl) {
        videoTimerEl.textContent = timeText;
      }
    }, 1000);
  },

  openVoiceCallModal(statusText) {
    let modal = document.getElementById('voice-call-full-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'voice-call-full-modal';
      modal.className = 'voice-call-modal-overlay';
    }
    document.body.appendChild(modal);

    const avatarUrl = this.callPartner ? this.callPartner.avatarUrl : '';
    const partnerName = this.callPartner ? this.callPartner.fullName : 'Connected Friend';

    modal.innerHTML = `
      <div class="voice-call-center-container">
        <div class="voice-call-avatar-wrapper" style="position: relative; display: inline-block;">
          <img id="voice-modal-avatar" src="${avatarUrl}" class="voice-call-avatar-img" alt="${UI.escapeHtml(partnerName)}">
          <span id="voice-modal-avatar-mute-badge" style="position: absolute; bottom: 5px; right: 5px; background: #ef4444; color: #fff; width: 32px; height: 32px; border-radius: 50%; display: ${this.peerIsMuted ? 'flex' : 'none'}; align-items: center; justify-content: center; font-size: 0.9rem; border: 2.5px solid #0f172a; box-shadow: 0 4px 10px rgba(0,0,0,0.5);" title="Muted">
            <i class="fa-solid fa-microphone-slash"></i>
          </span>
        </div>
        <div id="voice-modal-name" class="voice-call-user-name">${UI.escapeHtml(partnerName)}</div>
        <div id="voice-modal-status" class="voice-call-status-timer">${statusText}</div>
        <div id="voice-modal-peer-mute" style="display: ${this.peerIsMuted ? 'inline-flex' : 'none'}; align-items: center; gap: 6px; background: rgba(239, 68, 68, 0.25); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 20px; padding: 4px 14px; font-size: 0.85rem; font-weight: 600; margin-top: 10px;">
          <i class="fa-solid fa-microphone-slash"></i> Muted
        </div>
      </div>

      <div class="voice-call-actions-bar">
        <button id="voice-mute-btn" class="voice-action-btn ${this.isMuted ? 'muted' : ''}" onclick="Call.toggleMute()" title="Mute / Unmute">
          <i class="fa-solid ${this.isMuted ? 'fa-microphone-slash' : 'fa-microphone'}"></i>
        </button>
        <button id="voice-camera-request-btn" class="voice-action-btn" onclick="Call.requestVideoUpgrade()" title="Turn on Camera (Request Video Call)">
          <i class="fa-solid fa-video"></i>
        </button>
        <button class="voice-action-btn" onclick="Call.minimizeVoiceCall()" title="Minimize to Chat">
          <i class="fa-solid fa-comment-dots"></i>
        </button>
        <button class="voice-action-btn btn-hangup" onclick="Call.endCall()" title="End Call">
          <i class="fa-solid fa-phone-slash"></i>
        </button>
      </div>
    `;

    modal.style.display = 'flex';

    const overlay = document.getElementById('active-voice-call-bar');
    if (overlay) overlay.style.display = 'none';
  },

  minimizeVoiceCall() {
    const modal = document.getElementById('voice-call-full-modal');
    if (modal) modal.style.display = 'none';
    const statusText = document.getElementById('voice-modal-status')?.textContent || 'In Call';
    this.showCallOverlay(statusText, false);
  },

  expandVoiceCall() {
    const overlay = document.getElementById('active-voice-call-bar');
    if (overlay) overlay.style.display = 'none';
    const modal = document.getElementById('voice-call-full-modal');
    if (modal) modal.style.display = 'flex';
  },

  showCallOverlay(statusText, isOutgoing) {
    let overlay = document.getElementById('active-voice-call-bar');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'active-voice-call-bar';
    }
    document.body.appendChild(overlay);

    overlay.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999 !important;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 1.5px solid var(--primary);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
      border-radius: 9999px;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: #fff;
      font-size: 0.92rem;
    `;

    const avatarUrl = this.callPartner ? this.callPartner.avatarUrl : '';

    overlay.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <img src="${avatarUrl}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary);">
        <span id="active-call-status" style="font-weight: 700;">${statusText}</span>
        <span id="peer-voice-mute-badge" style="display: ${this.peerIsMuted ? 'inline-flex' : 'none'}; align-items: center; gap: 5px; background: rgba(239, 68, 68, 0.25); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 12px; padding: 2px 10px; font-size: 0.78rem; font-weight: 600;">
          <i class="fa-solid fa-microphone-slash"></i> Muted
        </span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="btn btn-secondary btn-sm" onclick="Call.expandVoiceCall()" style="padding: 6px 12px; border-radius: 20px;" title="Full Screen">
          <i class="fa-solid fa-expand"></i>
        </button>
        <button id="call-mute-btn" class="btn btn-secondary btn-sm" onclick="Call.toggleMute()" style="padding: 6px 12px; border-radius: 20px;">
          <i class="fa-solid fa-microphone"></i> Mute
        </button>
        <button class="btn btn-danger btn-sm" onclick="Call.endCall()" style="padding: 6px 14px; border-radius: 20px;">
          <i class="fa-solid fa-phone-slash"></i> End Call
        </button>
      </div>
    `;

    overlay.style.display = 'flex';
  },

  openVideoCallModal(statusText) {
    let modal = document.getElementById('video-call-modal-overlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'video-call-modal-overlay';
      modal.className = 'video-modal-backdrop';
    }
    document.body.appendChild(modal);

    const avatarUrl = this.callPartner ? this.callPartner.avatarUrl : '';
    const partnerName = this.callPartner ? this.callPartner.fullName : 'Connected Friend';

    let timeText = statusText;
    if (this.callSeconds > 0) {
      const mins = Math.floor(this.callSeconds / 60).toString().padStart(2, '0');
      const secs = (this.callSeconds % 60).toString().padStart(2, '0');
      timeText = `${mins}:${secs}`;
    }

    modal.innerHTML = `
      <div class="video-call-header">
        <div class="video-call-user-info">
          <img src="${avatarUrl}" class="video-call-avatar" alt="${UI.escapeHtml(partnerName)}">
          <div>
            <div class="video-call-title" style="display: flex; align-items: center; gap: 8px;">
              <span>${UI.escapeHtml(partnerName)}</span>
              <span id="peer-video-mute-badge" style="display: ${this.peerIsMuted ? 'inline-flex' : 'none'}; align-items: center; gap: 4px; background: rgba(239, 68, 68, 0.25); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 10px; padding: 2px 8px; font-size: 0.72rem; font-weight: 600;">
                <i class="fa-solid fa-microphone-slash"></i> Muted
              </span>
            </div>
            <div class="video-call-timer" id="video-call-timer-display">${timeText}</div>
          </div>
        </div>
      </div>

      <div class="video-viewport-container">
        <video id="remote-video-element" autoplay playsinline></video>
        <div id="remote-camera-off-overlay" style="position: absolute; inset: 0; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); display: ${this.peerIsCameraOff ? 'flex' : 'none'}; flex-direction: column; align-items: center; justify-content: center; gap: 14px; z-index: 5; border-radius: 12px;">
          <div style="position: relative;">
            <img src="${avatarUrl}" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 3px solid var(--primary); box-shadow: 0 8px 25px rgba(0,0,0,0.6);">
            <span id="remote-camera-off-avatar-mute" style="position: absolute; bottom: 0; right: 0; background: #ef4444; color: #fff; width: 28px; height: 28px; border-radius: 50%; display: ${this.peerIsMuted ? 'flex' : 'none'}; align-items: center; justify-content: center; font-size: 0.75rem; border: 2px solid #0f172a;">
              <i class="fa-solid fa-microphone-slash"></i>
            </span>
          </div>
          <div style="color: #cbd5e1; font-weight: 600; font-size: 1rem; display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.4); padding: 6px 16px; border-radius: 20px;">
            <i class="fa-solid fa-video-slash" style="color: #ef4444;"></i> Camera is turned off
          </div>
        </div>
        <div class="local-video-wrapper">
          <video id="local-video-element" autoplay playsinline muted></video>
        </div>
      </div>

      <div class="video-call-toolbar">
        <button id="video-mute-btn" class="control-btn ${this.isMuted ? 'muted' : ''}" onclick="Call.toggleMute()" title="Mute/Unmute Audio">
          <i class="fa-solid ${this.isMuted ? 'fa-microphone-slash' : 'fa-microphone'}"></i>
        </button>
        <button id="video-camera-btn" class="control-btn ${this.isCameraOff ? 'muted' : ''}" onclick="Call.toggleCamera()" title="Turn Camera On/Off">
          <i class="fa-solid ${this.isCameraOff ? 'fa-video-slash' : 'fa-video'}"></i>
        </button>
        <button id="video-screen-share-btn" class="control-btn" onclick="Call.toggleScreenShare()" title="Share Screen">
          <i class="fa-solid fa-desktop"></i>
        </button>
        <button class="control-btn btn-hangup" onclick="Call.endCall()" title="End Video Call">
          <i class="fa-solid fa-phone-slash"></i>
        </button>
      </div>
    `;

    modal.style.display = 'flex';

    // Bind local stream
    const localVideoEl = document.getElementById('local-video-element');
    if (localVideoEl && this.localStream) {
      localVideoEl.srcObject = this.localStream;
    }

    // Immediately bind remote stream
    this.bindRemoteStreamToElements();
  },

  setupPeerConnectionOntrack(pc) {
    if (!pc) return;
    pc.ontrack = (event) => {
      console.log('WebRTC ontrack received:', event.track.kind, event.streams);
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }

      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach(t => {
          if (!this.remoteStream.getTracks().some(existing => existing.id === t.id)) {
            this.remoteStream.addTrack(t);
          }
        });
      } else if (event.track) {
        if (!this.remoteStream.getTracks().some(existing => existing.id === event.track.id)) {
          this.remoteStream.addTrack(event.track);
        }
      }

      this.bindRemoteStreamToElements();
    };
  },

  bindRemoteStreamToElements() {
    if (this.remoteAudio && this.remoteStream) {
      this.remoteAudio.srcObject = this.remoteStream;
      this.remoteAudio.play().catch(e => console.warn('Remote audio play warning:', e));
    }

    const remoteVideoEl = document.getElementById('remote-video-element');
    if (remoteVideoEl && this.remoteStream) {
      remoteVideoEl.srcObject = this.remoteStream;
      remoteVideoEl.play().catch(e => console.warn('Remote video play warning:', e));
    }
  },

  cleanupCall() {
    this.stopRingtone();
    clearInterval(this.callTimer);
    if (this.canvasAnimId) cancelAnimationFrame(this.canvasAnimId);

    // Save call history entry ONLY if initiator to prevent duplicate logs
    if (this.isInitiator && this.callPartner && Chat.connection && Chat.connection.state === signalR.HubConnectionState.Connected) {
      try {
        const callTypeStr = this.isVideoCall ? 'Video' : 'Voice';
        const statusStr = 'Completed';
        const durationSec = this.callSeconds || 0;
        Chat.connection.invoke('LogCallHistory', String(this.callPartner.id), callTypeStr, statusStr, durationSec).catch(() => {});
      } catch (e) {}
    }

    this.callSeconds = 0;
    this.isMuted = false;
    this.isCameraOff = false;
    this.peerIsMuted = false;
    this.peerIsCameraOff = false;
    this.isScreenSharing = false;
    this.isVideoCall = false;
    this.isInitiator = false;

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
    }

    const fullVoiceModal = document.getElementById('voice-call-full-modal');
    if (fullVoiceModal) fullVoiceModal.style.display = 'none';

    const overlay = document.getElementById('active-voice-call-bar');
    if (overlay) overlay.style.display = 'none';

    const videoModal = document.getElementById('video-call-modal-overlay');
    if (videoModal) videoModal.style.display = 'none';

    const upgradeModal = document.getElementById('video-upgrade-request-modal');
    if (upgradeModal) upgradeModal.remove();

    UI.closeModal('incoming-voice-call-modal');
    UI.closeModal('incoming-video-call-modal');
    this.callPartner = null;
    this.incomingCallData = null;
  },

  async loadCallHistory() {
    const container = document.getElementById('sidebar-calls-container');
    if (!container) return;

    try {
      const res = await API.get('/calls/history?page=1&pageSize=30');
      const items = res.items || res || [];

      if (!items || items.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 24px; color: var(--text-muted);">
            <i class="fa-solid fa-phone-slash" style="font-size: 2rem; margin-bottom: 10px;"></i>
            <p style="font-size: 0.9rem;">No call history yet.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = items.map(c => {
        const partnerName = c.isOutgoing ? c.receiverName : c.callerName;
        const partnerAvatar = c.isOutgoing ? (c.receiverAvatarUrl || UI.getAvatarUrl({ fullName: c.receiverName })) : (c.callerAvatarUrl || UI.getAvatarUrl({ fullName: c.callerName }));
        const partnerId = c.isOutgoing ? c.receiverId : c.callerId;
        const isVideo = (c.callType || 'Voice').toLowerCase() === 'video';

        let directionIcon = '<i class="fa-solid fa-arrow-up-right-from-square call-icon-badge outgoing"></i> Outgoing';
        if (!c.isOutgoing) {
          if (c.status.toLowerCase() === 'missed') {
            directionIcon = '<i class="fa-solid fa-arrow-down-left call-icon-badge missed"></i> Missed';
          } else {
            directionIcon = '<i class="fa-solid fa-arrow-down-left call-icon-badge incoming"></i> Incoming';
          }
        }

        let durationText = '';
        if (c.durationSeconds > 0) {
          const mins = Math.floor(c.durationSeconds / 60);
          const secs = c.durationSeconds % 60;
          durationText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        }

        const dateStr = new Date(c.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        return `
          <div class="call-history-item">
            <img src="${partnerAvatar}" class="call-history-avatar">
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${UI.escapeHtml(partnerName)}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                <span>${directionIcon}</span>
                <span>•</span>
                <span>${dateStr}</span>
                ${durationText ? `<span>• ${durationText}</span>` : ''}
              </div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="Call.start${isVideo ? 'Video' : 'Voice'}Call('${partnerId}', '${UI.escapeHtml(partnerName)}', '${partnerAvatar}')" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 12px;" title="Call back">
              <i class="fa-solid ${isVideo ? 'fa-video' : 'fa-phone'}"></i>
            </button>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Failed to load call history:', err);
      container.innerHTML = `<div style="color: var(--accent-danger); font-size: 0.85rem; padding: 12px;">Failed to load history.</div>`;
    }
  },

  playRingtone() {
    try {
      if (!this.ringtoneAudioCtx) {
        this.ringtoneAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }

      this.stopRingtone();
      this.ringtoneInterval = setInterval(() => {
        if (!this.ringtoneAudioCtx) return;
        const osc = this.ringtoneAudioCtx.createOscillator();
        const gain = this.ringtoneAudioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.ringtoneAudioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, this.ringtoneAudioCtx.currentTime);

        osc.connect(gain);
        gain.connect(this.ringtoneAudioCtx.destination);

        osc.start();
        osc.stop(this.ringtoneAudioCtx.currentTime + 0.8);
      }, 2000);
    } catch (e) {}
  },

  stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }
};

window.Call = Call;

document.addEventListener('DOMContentLoaded', () => {
  Call.init();
});

window.addEventListener('beforeunload', () => {
  if (Call.callPartner) {
    Call.endCall();
  }
});
