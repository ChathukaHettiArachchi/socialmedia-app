/* Profile Management Module */
const Profile = {
  init() {
    this.bindEvents();
  },

  bindEvents() {
    const profileEditForm = document.getElementById('profile-edit-form');
    if (profileEditForm) {
      profileEditForm.addEventListener('submit', (e) => this.handleProfileUpdate(e));
    }

    const newAvatarInput = document.getElementById('edit-profile-avatar-input');
    const avatarTrigger = document.getElementById('edit-avatar-trigger');
    if (newAvatarInput && avatarTrigger) {
      avatarTrigger.addEventListener('click', () => newAvatarInput.click());
      newAvatarInput.addEventListener('change', (e) => this.handleAvatarPreview(e));
    }
  },

  renderProfileData(user) {
    if (!user) return;

    // Header Profile Summary elements
    const headerAvatar = document.getElementById('header-user-avatar');
    const headerName = document.getElementById('header-user-name');
    const headerHandle = document.getElementById('header-user-handle');

    if (headerAvatar) headerAvatar.src = UI.getAvatarUrl(user);
    if (headerName) headerName.textContent = user.fullName || user.username;
    if (headerHandle) headerHandle.textContent = `@${user.username}`;

    // Modal Profile View elements
    const modalAvatar = document.getElementById('modal-profile-avatar');
    const modalName = document.getElementById('modal-profile-name');
    const modalUsername = document.getElementById('modal-profile-username');
    const modalEmail = document.getElementById('modal-profile-email');
    const modalBio = document.getElementById('modal-profile-bio');
    const modalJoined = document.getElementById('modal-profile-joined');

    if (modalAvatar) modalAvatar.src = UI.getAvatarUrl(user);
    if (modalName) modalName.textContent = user.fullName || user.username;
    if (modalUsername) modalUsername.textContent = `@${user.username}`;
    if (modalEmail) modalEmail.textContent = user.email;
    if (modalBio) modalBio.textContent = user.bio || 'No bio added yet.';
    if (modalJoined) {
      const date = new Date(user.createdAt);
      modalJoined.textContent = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // Populate Edit Form fields
    const editFullName = document.getElementById('edit-fullName');
    const editBio = document.getElementById('edit-bio');
    const editAvatarImg = document.getElementById('edit-avatar-preview-img');

    if (editFullName) editFullName.value = user.fullName || '';
    if (editBio) editBio.value = user.bio || '';
    if (editAvatarImg) editAvatarImg.src = UI.getAvatarUrl(user);
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
      const img = document.getElementById('edit-avatar-preview-img');
      if (img) img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  async handleProfileUpdate(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');

    const fullName = form.fullName.value.trim();
    const bio = form.bio.value.trim();
    const currentPassword = form.currentPassword.value;
    const newPassword = form.newPassword.value;
    const photoFile = form.profilePhoto ? form.profilePhoto.files[0] : null;

    if (!fullName) {
      UI.showToast('error', 'Full name is required.');
      return;
    }

    if (newPassword && newPassword.length < 6) {
      UI.showToast('error', 'New password must be at least 6 characters long.');
      return;
    }

    const formData = new FormData();
    formData.append('fullName', fullName);
    formData.append('bio', bio);
    if (currentPassword) formData.append('currentPassword', currentPassword);
    if (newPassword) formData.append('newPassword', newPassword);
    if (photoFile) formData.append('profilePhoto', photoFile);

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

      const response = await API.put('/profile', formData, true);
      UI.showToast('success', response.message || 'Profile updated successfully.');

      // Update current cached user
      Auth.currentUser = response.user;
      this.renderProfileData(response.user);

      // Reset password fields
      form.currentPassword.value = '';
      form.newPassword.value = '';

      UI.closeModal('edit-profile-modal');
    } catch (err) {
      UI.showToast('error', err.message || 'Failed to update profile.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Save Changes <i class="fa-solid fa-check"></i>';
    }
  }
};

window.Profile = Profile;
