/* Frontend Deployment Configuration */
window.CONFIG = {
  // API & SignalR Base URLs (Defaults to current origin, configurable for cloud deployment)
  API_BASE_URL: window.location.origin + '/api',
  HUB_URL: window.location.origin + '/hubs/communication',

  // WebRTC ICE Servers (STUN/TURN)
  // For production over NAT/Firewalls, specify TURN server credentials here or via environment injection.
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
    /* Production TURN Server Example:
    {
      urls: 'turn:turn.yourdomain.com:3478',
      username: 'socialconnect_user',
      credential: 'TurnPassword2026!'
    }
    */
  ]
};
