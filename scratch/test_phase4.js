async function testPhase4() {
  console.log('--- Phase 4 Integration Test: Media Chat & File Uploads ---');

  // 1. Login User 1
  const login = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'chathukatest', password: 'Password123!' })
  }).then(r => r.json());

  const token = login.token;
  console.log('User Logged In:', login.user.username);

  // Get active conversation with User 2
  const convs = await fetch('http://localhost:5000/api/conversations', {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.json());
  const conversationId = convs[0].id;

  // 2. Upload Sample Image File
  const dummyImageBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00]); // JPEG header
  const imageBlob = new Blob([dummyImageBytes], { type: 'image/jpeg' });
  const imgFormData = new FormData();
  imgFormData.append('file', imageBlob, 'test_photo.jpg');
  imgFormData.append('category', 'images');

  const imgUploadRes = await fetch('http://localhost:5000/api/files/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: imgFormData
  });
  const imgResult = await imgUploadRes.json();
  console.log('Image Uploaded:', imgResult.fileName, '| URL:', imgResult.fileUrl, '| Size:', imgResult.fileSize, 'bytes');

  // 3. Send Image Message
  const sendImgRes = await fetch('http://localhost:5000/api/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      conversationId: conversationId,
      textContent: imgResult.fileUrl,
      messageType: 'Image',
      fileId: imgResult.fileId
    })
  });
  const imgMsg = await sendImgRes.json();
  console.log('Image Message Sent:', imgMsg.messageType, '| FileUrl:', imgMsg.textContent);

  // 4. Upload Voice Audio Message
  const dummyAudioBytes = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3]); // WebM header
  const audioBlob = new Blob([dummyAudioBytes], { type: 'audio/webm' });
  const audioFormData = new FormData();
  audioFormData.append('file', audioBlob, 'voice_note.webm');
  audioFormData.append('category', 'audio');

  const audioUploadRes = await fetch('http://localhost:5000/api/files/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: audioFormData
  });
  const audioResult = await audioUploadRes.json();
  console.log('Audio Uploaded:', audioResult.fileName, '| URL:', audioResult.fileUrl);

  // 5. Send Audio Message
  const sendAudioRes = await fetch('http://localhost:5000/api/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      conversationId: conversationId,
      textContent: audioResult.fileUrl,
      messageType: 'Audio',
      fileId: audioResult.fileId
    })
  });
  const audioMsg = await sendAudioRes.json();
  console.log('Audio Message Sent:', audioMsg.messageType, '| FileUrl:', audioMsg.textContent);

  // 6. Retrieve Messages History
  const history = await fetch(`http://localhost:5000/api/messages/${conversationId}?page=1&pageSize=50`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.json());

  console.log('Total Messages in Conversation:', history.length);
  console.log('Latest 2 Messages:', history.slice(-2).map(m => ({ type: m.messageType, url: m.textContent })));

  console.log('--- Phase 4 Test Complete ---');
}

testPhase4();
