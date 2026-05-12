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

  const user = getCurrentUser();
  const isAdmin = user && user.role === 'admin';

  let h = `<div class="table-responsive"><table class="data-table"><thead><tr>
    <th>Date & Time</th>
    <th>Cashier</th>
    <th>Items</th>
    <th>Total</th>
    ${isAdmin ? '<th>Actions</th>' : ''}
  </tr></thead><tbody>`;

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
      ${isAdmin ? `<td><button class="btn btn-sm btn-delete" onclick="event.stopPropagation(); deleteTransaction('${tx.id}')">Void</button></td>` : ''}
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
  
  const user = getCurrentUser();
  if (user && user.role === 'admin') {
    h += `<div class="tx-actions" style="margin-top: 15px; display: flex; gap: 10px; justify-content: flex-end; padding: 15px;">
      <button class="btn btn-primary" onclick="editTransaction('${txId}')">Edit (Void & Re-ring)</button>
      <button class="btn btn-danger" onclick="deleteTransaction('${txId}')">Void Transaction</button>
    </div>`;
  }

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

async function deleteTransaction(txId, skipConfirm = false) {
  if (!skipConfirm && !confirm("Are you sure you want to VOID this transaction? This will return stock and deduct from today's sales.")) return;
  
  const tx = transactionsCache.find(t => t.id === txId);
  if (!tx) return;

  try {
    showLoading(true);
    const batch = db.batch();

    // 1. Return stock
    (tx.items || []).forEach(item => {
      const ref = db.collection('products').doc(item.id);
      batch.update(ref, { stock: firebase.firestore.FieldValue.increment(item.qty) });
    });

    // 2. Adjust dailyStats
    const dateStr = (tx.timestamp ? tx.timestamp.toDate() : new Date()).toLocaleDateString('en-CA');
    const hourStr = (tx.timestamp ? tx.timestamp.toDate() : new Date()).getHours().toString();
    const dailyStatsRef = db.collection('dailyStats').doc(dateStr);
    
    const totalProfit = (tx.items || []).reduce((sum, item) => sum + ((item.price - (item.cost || 0)) * item.qty), 0);
    
    const statsUpdate = {
      totalSales: firebase.firestore.FieldValue.increment(-tx.total),
      totalProfit: firebase.firestore.FieldValue.increment(-totalProfit),
      transactionCount: firebase.firestore.FieldValue.increment(-1)
    };
    statsUpdate[`hourlySales.${hourStr}`] = firebase.firestore.FieldValue.increment(-tx.total);
    
    (tx.items || []).forEach(item => {
      const catKey = sanitizeKey(item.category || 'Uncategorized');
      const prodId = sanitizeKey(item.id);
      statsUpdate[`categorySales.${catKey}`] = firebase.firestore.FieldValue.increment(-(item.price * item.qty));
      statsUpdate[`productSales.${prodId}.qty`] = firebase.firestore.FieldValue.increment(-item.qty);
      statsUpdate[`productSales.${prodId}.revenue`] = firebase.firestore.FieldValue.increment(-(item.price * item.qty));
    });
    
    batch.set(dailyStatsRef, statsUpdate, { merge: true });

    // 3. Delete transaction
    const txRef = db.collection('transactions').doc(txId);
    batch.delete(txRef);

    await batch.commit();
    
    showToast('Transaction voided successfully', 'success');
    closeModal();
    
    // Remove from cache and re-render
    transactionsCache = transactionsCache.filter(t => t.id !== txId);
    renderTransactions();
    
  } catch (error) {
    console.error("Error voiding transaction: ", error);
    showToast('Failed to void transaction', 'error');
  } finally {
    showLoading(false);
  }
}

async function editTransaction(txId) {
  if (!confirm('This will void the current transaction and load its items into your POS cart so you can ring it up again. Proceed?')) return;
  
  const tx = transactionsCache.find(t => t.id === txId);
  if (!tx) return;

  try {
    showLoading(true);
    // Void it, skipping the second confirmation
    await deleteTransaction(txId, true);
    
    // Make sure cart exists (global from pos.js)
    if (typeof cart !== 'undefined') {
      cart = [];
      
      // Re-populate cart
      (tx.items || []).forEach(item => {
        // Find current product to get maxStock, or fallback
        const product = typeof allProducts !== 'undefined' ? allProducts.find(p => p.id === item.id) : null;
        cart.push({
          id: item.id,
          name: item.name,
          price: item.price,
          cost: item.cost || 0,
          category: item.category || 'Uncategorized',
          qty: item.qty,
          maxStock: product ? product.stock : (item.qty + 100)
        });
      });
      
      // Switch to POS tab
      if (typeof navigateToTab === 'function') {
        navigateToTab('pos');
      }
      
      if (typeof renderCart === 'function') {
        renderCart();
      }
      showToast('Items loaded into cart. Please checkout again.', 'info');
    }
  } catch (error) {
    console.error('Error editing transaction:', error);
  } finally {
    showLoading(false);
  }
}
