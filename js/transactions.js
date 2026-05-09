// =============================================================================
// Transaction History Module
// =============================================================================

let transactionsCache = [];

async function loadTransactions(filter) {
  try {
    showLoading(true);
    let query = db.collection('transactions').orderBy('timestamp', 'desc');

    const now = new Date();
    let startDate, endDate;

    if (filter === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (filter === 'week') {
      const dayOfWeek = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (filter === 'custom') {
      const from = document.getElementById('filter-date-from').value;
      const to = document.getElementById('filter-date-to').value;
      if (from) startDate = new Date(from);
      if (to) { endDate = new Date(to); endDate.setDate(endDate.getDate() + 1); }
    }

    if (startDate) query = query.where('timestamp', '>=', startDate);
    if (endDate) query = query.where('timestamp', '<', endDate);

    const snapshot = await query.limit(200).get();
    transactionsCache = [];
    snapshot.forEach(doc => {
      transactionsCache.push({ id: doc.id, ...doc.data() });
    });
    renderTransactions();
  } catch (e) {
    console.error('Error loading transactions:', e);
    showToast('Failed to load transactions.', 'error');
  } finally {
    showLoading(false);
  }
}

function renderTransactions() {
  const el = document.getElementById('transactions-list');
  if (!el) return;
  if (transactionsCache.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No transactions found.</p></div>';
    return;
  }

  let h = '<div class="table-responsive"><table class="data-table"><thead><tr><th>Date & Time</th><th>Cashier</th><th>Items</th><th>Total</th></tr></thead><tbody>';
  transactionsCache.forEach(tx => {
    const date = tx.timestamp ? tx.timestamp.toDate() : new Date();
    const dateStr = date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    const itemCount = tx.items ? tx.items.reduce((s, i) => s + i.qty, 0) : 0;
    h += `<tr class="clickable-row" onclick="showTransactionDetail('${tx.id}')">
      <td>${dateStr} <span class="text-muted">${timeStr}</span></td>
      <td>${escapeHtml(tx.cashierName || 'N/A')}</td>
      <td>${itemCount} item${itemCount !== 1 ? 's' : ''}</td>
      <td class="price-cell">₱${(tx.total || 0).toFixed(2)}</td>
    </tr>`;
  });
  h += '</tbody></table></div>';
  el.innerHTML = h;
}

function showTransactionDetail(txId) {
  const tx = transactionsCache.find(t => t.id === txId);
  if (!tx) return;
  const date = tx.timestamp ? tx.timestamp.toDate() : new Date();
  let h = `<div class="modal-header">
    <h3>Transaction Details</h3>
    <button class="modal-close" onclick="closeModal()">&times;</button>
  </div>
  <div class="modal-body">
    <div class="tx-meta">
      <p><strong>Date:</strong> ${date.toLocaleString('en-PH')}</p>
      <p><strong>Cashier:</strong> ${escapeHtml(tx.cashierName || 'N/A')}</p>
    </div>
    <table class="data-table">
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead><tbody>`;
  (tx.items || []).forEach(i => {
    h += `<tr><td>${escapeHtml(i.name)}</td><td>${i.qty}</td><td>₱${i.price.toFixed(2)}</td><td>₱${i.subtotal.toFixed(2)}</td></tr>`;
  });
  h += `</tbody></table>
    <div class="tx-totals">
      <p><strong>Total:</strong> ₱${(tx.total || 0).toFixed(2)}</p>
      <p><strong>Paid:</strong> ₱${(tx.amountPaid || 0).toFixed(2)}</p>
      <p><strong>Change:</strong> ₱${(tx.change || 0).toFixed(2)}</p>
    </div>
  </div>`;
  document.getElementById('modal-content').innerHTML = h;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function handleFilterChange() {
  const filterVal = document.getElementById('tx-filter-select').value;
  const customRange = document.getElementById('custom-date-range');
  customRange.classList.toggle('hidden', filterVal !== 'custom');
  if (filterVal !== 'custom') loadTransactions(filterVal);
}

function applyCustomFilter() {
  loadTransactions('custom');
}
