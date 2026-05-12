// =============================================================================
// App Orchestrator
// =============================================================================

let currentTab = 'pos';

function navigateToTab(tabName) {
  currentTab = tabName;
  // Hide all sections
  document.querySelectorAll('.tab-section').forEach(s => s.classList.add('hidden'));
  // Show target
  const target = document.getElementById('section-' + tabName);
  if (target) target.classList.remove('hidden');
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  // Trigger load for tab
  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'transactions') loadTransactions('today');
  if (tabName === 'pos') renderPOSProducts();
  if (tabName === 'utang') showUtangView('dashboard');
}

function initModules() {
  initProducts();
  initUtang();
}

// Toast notification system
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = {
    success: '✓', error: '✕', warning: '⚠', info: 'ℹ'
  };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-msg">${message}</span>`;
  container.appendChild(toast);
  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Loading overlay
function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  // Auth
  initAuthListener();

  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    if (!email || !pass) { showToast('Enter email and password.', 'warning'); return; }
    try { await loginUser(email, pass); } catch (e) { /* handled in loginUser */ }
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', logoutUser);

  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateToTab(btn.dataset.tab));
  });

  // Product form
  const pf = document.getElementById('product-form');
  if (pf) pf.addEventListener('submit', handleProductFormSubmit);

  const pcb = document.getElementById('product-cancel-btn');
  if (pcb) pcb.addEventListener('click', resetProductForm);

  // POS search
  const ps = document.getElementById('pos-search');
  if (ps) ps.addEventListener('input', renderPOSProducts);

  // Amount paid
  const ap = document.getElementById('amount-paid');
  if (ap) ap.addEventListener('input', calculateChange);

  // Complete / Cancel sale
  const csBtn = document.getElementById('complete-sale-btn');
  if (csBtn) csBtn.addEventListener('click', completeSale);

  const cancelBtn = document.getElementById('cancel-sale-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', cancelSale);

  const drawerBtn = document.getElementById('open-drawer-btn');
  if (drawerBtn) drawerBtn.addEventListener('click', openCashDrawer);

  // Transaction filter
  const txf = document.getElementById('tx-filter-select');
  if (txf) txf.addEventListener('change', handleFilterChange);

  const txcf = document.getElementById('apply-custom-filter');
  if (txcf) txcf.addEventListener('click', applyCustomFilter);

  // Modal close on overlay click
  const mo = document.getElementById('modal-overlay');
  if (mo) mo.addEventListener('click', (e) => { if (e.target === mo) closeModal(); });
});
