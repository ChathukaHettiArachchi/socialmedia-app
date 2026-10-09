async function testPhase2() {
  console.log('--- Phase 2 Integration Test: Users & Connections ---');

  // 1. Login User 1 (chathukatest)
  const login1Res = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'chathukatest', password: 'Password123!' })
  });
  const u1Data = await login1Res.json();
  const token1 = u1Data.token;
  console.log('User 1 Logged In:', u1Data.user.username);

  // 2. Login User 2 (sarahc)
  const login2Res = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'sarahc', password: 'SecurePass123!' })
  });
  const u2Data = await login2Res.json();
  const token2 = u2Data.token;
  console.log('User 2 Logged In:', u2Data.user.username);

  // 3. User 1 Searches for Users
  const searchRes = await fetch('http://localhost:5000/api/users?query=sarah', {
    headers: { 'Authorization': `Bearer ${token1}` }
  });
  const searchUsers = await searchRes.json();
  console.log('User 1 Search Result:', searchUsers.map(u => ({ username: u.username, status: u.connectionStatus })));

  // 4. User 1 sends Friend Request to User 2
  const sendRes = await fetch(`http://localhost:5000/api/friendrequests/send/${u2Data.user.id}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token1}` }
  });
  const sendData = await sendRes.json();
  console.log('Send Friend Request Response:', sendData.message);

  // 5. User 2 checks Pending Requests
  const pendingRes = await fetch('http://localhost:5000/api/friendrequests/pending', {
    headers: { 'Authorization': `Bearer ${token2}` }
  });
  const pendingRequests = await pendingRes.json();
  console.log('User 2 Pending Requests:', pendingRequests.map(r => ({ requestId: r.id, sender: r.sender.username, status: r.status })));

  // 6. User 2 Accepts Request
  const requestId = pendingRequests[0].id;
  const acceptRes = await fetch(`http://localhost:5000/api/friendrequests/accept/${requestId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token2}` }
  });
  const acceptData = await acceptRes.json();
  console.log('Accept Friend Request Response:', acceptData.message);

  // 7. Verify Connected Friends for both users
  const friends1Res = await fetch('http://localhost:5000/api/friendrequests/friends', {
    headers: { 'Authorization': `Bearer ${token1}` }
  });
  const friends1 = await friends1Res.json();
  console.log('User 1 Connected Friends:', friends1.map(f => f.username));

  const friends2Res = await fetch('http://localhost:5000/api/friendrequests/friends', {
    headers: { 'Authorization': `Bearer ${token2}` }
  });
  const friends2 = await friends2Res.json();
  console.log('User 2 Connected Friends:', friends2.map(f => f.username));

  console.log('--- Phase 2 Test Complete ---');
}

testPhase2();
