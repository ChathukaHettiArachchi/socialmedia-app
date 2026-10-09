async function testPhase3() {
  console.log('--- Phase 3 Integration Test: Private Chat & Real-Time Setup ---');

  // 1. Login User 1 (chathukatest) & User 2 (sarahc)
  const login1 = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'chathukatest', password: 'Password123!' })
  }).then(r => r.json());

  const login2 = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'sarahc', password: 'SecurePass123!' })
  }).then(r => r.json());

  const token1 = login1.token;
  const token2 = login2.token;
  console.log('User 1:', login1.user.username, '| User 2:', login2.user.username);

  // 2. User 1 starts private conversation with User 2
  const convRes = await fetch(`http://localhost:5000/api/conversations/private/${login2.user.id}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token1}` }
  });
  const conversation = await convRes.json();
  console.log('Conversation Created/Loaded:', conversation.id, '| Partner:', conversation.otherParticipant.username);

  // 3. User 1 sends message to User 2
  const sendRes = await fetch('http://localhost:5000/api/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token1}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      conversationId: conversation.id,
      textContent: 'Hello Sarah! Welcome to SocialConnect real-time chat! 😊',
      messageType: 'Text'
    })
  });
  const msgData = await sendRes.json();
  console.log('Sent Message:', msgData.textContent, '| At:', msgData.createdAt);

  // 4. User 2 checks conversation list and unread count
  const user2Convs = await fetch('http://localhost:5000/api/conversations', {
    headers: { 'Authorization': `Bearer ${token2}` }
  }).then(r => r.json());

  console.log('User 2 Conversations List:', user2Convs.map(c => ({
    partner: c.otherParticipant.username,
    lastMsg: c.lastMessage?.textContent,
    unreadCount: c.unreadCount
  })));

  // 5. User 2 fetches paginated messages history
  const historyRes = await fetch(`http://localhost:5000/api/messages/${conversation.id}?page=1&pageSize=50`, {
    headers: { 'Authorization': `Bearer ${token2}` }
  });
  const history = await historyRes.json();
  console.log('Fetched Messages Count:', history.length);

  // 6. User 2 marks conversation as read
  await fetch(`http://localhost:5000/api/conversations/${conversation.id}/read`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token2}` }
  });

  const updatedConvs = await fetch('http://localhost:5000/api/conversations', {
    headers: { 'Authorization': `Bearer ${token2}` }
  }).then(r => r.json());

  console.log('User 2 Unread Count after Read:', updatedConvs[0].unreadCount);
  console.log('--- Phase 3 Test Complete ---');
}

testPhase3();
