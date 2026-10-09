async function testAuth() {
  console.log('--- Phase 1 Auth API Test ---');

  // 1. Register User 2
  const formData = new FormData();
  formData.append('fullName', 'Sarah Connor');
  formData.append('username', 'sarahc');
  formData.append('email', 'sarah@example.com');
  formData.append('password', 'SecurePass123!');
  formData.append('confirmPassword', 'SecurePass123!');
  formData.append('bio', 'UI/UX Designer & Tech Enthusiast');

  const regRes = await fetch('http://localhost:5000/api/auth/register', {
    method: 'POST',
    body: formData
  });
  const regData = await regRes.json();
  console.log('Registration Status:', regRes.status);
  console.log('Registration Data:', JSON.stringify(regData, null, 2));

  // 2. Login User 2
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'sarahc',
      password: 'SecurePass123!'
    })
  });
  const loginData = await loginRes.json();
  console.log('Login Status:', loginRes.status);
  console.log('Token received:', !!loginData.token);

  // 3. Test GET /api/auth/me using Bearer token
  const meRes = await fetch('http://localhost:5000/api/auth/me', {
    headers: { 'Authorization': `Bearer ${loginData.token}` }
  });
  const meData = await meRes.json();
  console.log('Get Current User Status:', meRes.status);
  console.log('Authenticated User Profile:', JSON.stringify(meData, null, 2));
}

testAuth();
