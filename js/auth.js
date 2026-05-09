// =============================================================================
// Authentication Module
// =============================================================================
// Handles login/logout, role detection from Firestore, and UI visibility.
// =============================================================================

let currentUser = null;

function getCurrentUser() {
  return currentUser;
}

// Login with email & password
async function loginUser(email, password) {
  try {
    showLoading(true);
    const credential = await auth.signInWithEmailAndPassword(email, password);
    return credential.user;
  } catch (error) {
    let message = 'Login failed. Please try again.';
    switch (error.code) {
      case 'auth/user-not-found':
        message = 'No account found with this email.';
        break;
      case 'auth/wrong-password':
        message = 'Incorrect password.';
        break;
      case 'auth/invalid-email':
        message = 'Invalid email address.';
        break;
      case 'auth/too-many-requests':
        message = 'Too many attempts. Please try again later.';
        break;
      case 'auth/invalid-credential':
        message = 'Invalid email or password.';
        break;
    }
    showToast(message, 'error');
    throw error;
  } finally {
    showLoading(false);
  }
}

// Logout
async function logoutUser() {
  try {
    await auth.signOut();
    currentUser = null;
  } catch (error) {
    showToast('Logout failed. Please try again.', 'error');
  }
}

// Fetch user role from Firestore users collection
async function fetchUserRole(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      return doc.data();
    }
    return null;
  } catch (error) {
    console.error('Error fetching user role:', error);
    return null;
  }
}

// Listen for auth state changes
function initAuthListener() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      const userData = await fetchUserRole(user.uid);
      if (userData) {
        currentUser = {
          uid: user.uid,
          email: user.email,
          role: userData.role || 'cashier',
          name: userData.name || user.email.split('@')[0]
        };
        onLoginSuccess();
      } else {
        // User exists in Auth but not in Firestore users collection
        currentUser = {
          uid: user.uid,
          email: user.email,
          role: 'cashier',
          name: user.email.split('@')[0]
        };
        showToast('User profile not found in database. Defaulting to cashier role.', 'warning');
        onLoginSuccess();
      }
    } else {
      currentUser = null;
      onLogout();
    }
  });
}

// Called when user successfully logs in
function onLoginSuccess() {
  // Hide login, show app
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');

  // Update user info display
  const userDisplay = document.getElementById('user-display');
  const roleClass = currentUser.role === 'admin' ? 'role-admin' : 'role-cashier';
  userDisplay.innerHTML = `
    <span class="user-name">${currentUser.name}</span>
    <span class="role-badge ${roleClass}">${currentUser.role.toUpperCase()}</span>
  `;

  // Show/hide tabs based on role
  const adminTabs = document.querySelectorAll('[data-admin-only]');
  adminTabs.forEach(tab => {
    tab.style.display = currentUser.role === 'admin' ? '' : 'none';
  });

  // Navigate to default tab
  const defaultTab = currentUser.role === 'admin' ? 'dashboard' : 'pos';
  navigateToTab(defaultTab);

  // Initialize modules
  initModules();
}

// Called on logout
function onLogout() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');

  // Clear form
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}
