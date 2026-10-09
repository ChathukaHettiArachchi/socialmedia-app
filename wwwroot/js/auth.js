/* Authentication Module */
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});

const Auth = {
  currentUser: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Password visibility toggles
    document.querySelectorAll('.password-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const input = e.currentTarget.closest('.input-wrapper')?.querySelector('input');
        if (input) {
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          e.currentTarget.classList.toggle('fa-eye', !isPassword);
          e.currentTarget.classList.toggle('fa-eye-slash', isPassword);
        }
      });
    });

    // Login Form Submit
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // Register Form Submit & Avatar Preview
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', (e) => this.handleRegister(e));

      const avatarInput = document.getElementById('register-avatar-input');
      const avatarTrigger = document.getElementById('avatar-preview-trigger');

      if (avatarTrigger && avatarInput) {
        avatarTrigger.addEventListener('click', () => avatarInput.click());
        avatarInput.addEventListener('change', (e) => this.handleAvatarPreview(e));
      }
    }
  },

  handleAvatarPreview(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      UI.showToast('error', 'Profile photo must be less than 5MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.getElementById('avatar-preview-img');
      const placeholder = document.getElementById('avatar-placeholder');
      if (img && placeholder) {
        img.src = e.target.result;
        img.style.display = 'block';
        placeholder.style.display = 'none';
      }
    };
    reader.readAsDataURL(file);
  },

  async handleLogin(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');

    const usernameOrEmail = form.usernameOrEmail.value.trim();
    const password = form.password.value;

    if (!usernameOrEmail || !password) {
      UI.showToast('error', 'Please fill in all required fields.');
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging in...';

      const response = await API.post('/auth/login', { usernameOrEmail, password });
      API.setToken(response.token);
      this.currentUser = response.user;

      UI.showToast('success', 'Logged in successfully! Redirecting...');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 800);
    } catch (err) {
      UI.showToast('error', err.message || 'Login failed. Please check your credentials.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Login <i class="fa-solid fa-arrow-right"></i>';
    }
  },

  async handleRegister(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');

    const fullName = form.fullName.value.trim();
    const username = form.username.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;
    const bio = form.bio ? form.bio.value.trim() : '';
    const photoFile = form.profilePhoto.files[0];

    // Form Validations
    if (!fullName || !username || !email || !password || !confirmPassword) {
      UI.showToast('error', 'Please fill in all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      UI.showToast('error', 'Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      UI.showToast('error', 'Password must be at least 6 characters long.');
      return;
    }

    const formData = new FormData();
    formData.append('fullName', fullName);
    formData.append('username', username);
    formData.append('email', email);
    formData.append('password', password);
    formData.append('confirmPassword', confirmPassword);
    if (bio) formData.append('bio', bio);
    if (photoFile) formData.append('profilePhoto', photoFile);

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating account...';

      const response = await API.post('/auth/register', formData, true);
      API.setToken(response.token);
      this.currentUser = response.user;

      UI.showToast('success', 'Account created successfully! Welcome to SocialConnect.');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
    } catch (err) {
      UI.showToast('error', err.message || 'Registration failed. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Create Account <i class="fa-solid fa-user-plus"></i>';
    }
  },

  async getCurrentUser() {
    const token = API.getToken();
    if (!token) return null;

    try {
      const user = await API.get('/auth/me');
      this.currentUser = user;
      return user;
    } catch (err) {
      API.clearToken();
      return null;
    }
  },

  async logout() {
    try {
      await API.post('/auth/logout', {});
    } catch (e) {
      // Ignore API errors on logout
    } finally {
      API.clearToken();
      UI.showToast('info', 'Logged out.');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 500);
    }
  }
};

window.Auth = Auth;
