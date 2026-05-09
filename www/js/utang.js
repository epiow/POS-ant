// =============================================================================
// Utang (Credit) Management Module
// =============================================================================

let allCustomers = [];
let customersListener = null;
let utangCart = [];
let utangTransactionsCache = [];

function initUtang() {
  if (customersListener) customersListener();
  customersListener = db.collection('customers').orderBy('name')
    .onSnapshot((snapshot) => {
      allCustomers = [];
      snapshot.forEach(doc => { allCustomers.push({ id: doc.id, ...doc.data() }); });
      renderCustomerList();
      renderUtangDashboard();
      updateCustomerDropdown();
    }, (error) => {
      console.error('Error loading customers:', error);
    });
}

function showUtangView(view) {
  document.querySelectorAll('.utang-view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`utang-view-${view}`).classList.remove('hidden');
  
  if (view === 'create') {
    renderUtangPOSProducts();
    updateCustomerDropdown();
  } else if (view === 'history') {
    loadUtangHistory();
  }
}

// ---------- Customer Management ----------

function renderCustomerList() {
  const el = document.getElementById('customer-list');
  if (!el) return;
  if (allCustomers.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No customers found.</p></div>';
    return;
  }
  
  let h = '<div class="table-responsive"><table class="data-table"><thead><tr><th>Name / Contact</th><th>Balance</th><th>Credit Limit</th><th>Actions</th></tr></thead><tbody>';
  allCustomers.forEach(c => {
    const isOverdue = false; // Advanced: requires checking transactions, keep simple for now
    const overLimit = c.currentBalance >= c.creditLimit;
    
    h += `<tr>
      <td>
        <div class="customer-name-cell">
          ${escapeHtml(c.name)}
          ${overLimit ? '<span class="badge badge-warning">Near Limit</span>' : ''}
        </div>
        <div class="text-muted">${escapeHtml(c.contact || 'No contact')}</div>
      </td>
      <td class="customer-balance ${c.currentBalance > 0 ? 'text-danger' : ''}">₱${(c.currentBalance || 0).toFixed(2)}</td>
      <td>₱${(c.creditLimit || 500).toFixed(2)}</td>
      <td class="actions-cell">
        ${c.currentBalance > 0 ? `<button class="btn btn-sm btn-success" onclick="payCustomerUtang('${c.id}')">Pay</button>` : ''}
        <button class="btn btn-sm btn-edit" onclick="openCustomerModal('${c.id}')">Edit</button>
      </td>
    </tr>`;
  });
  h += '</tbody></table></div>';
  el.innerHTML = h;
}

function renderUtangDashboard() {
  const totalEl = document.getElementById('utang-dash-total');
  const countEl = document.getElementById('utang-dash-count');
  if (!totalEl || !countEl) return;
  
  let totalOutstanding = 0;
  let count = 0;
  allCustomers.forEach(c => {
    if (c.currentBalance > 0) {
      totalOutstanding += c.currentBalance;
      count++;
    }
  });
  
  totalEl.textContent = '₱' + totalOutstanding.toFixed(2);
  countEl.textContent = count;
}

function openCustomerModal(id = null) {
  let customer = id ? allCustomers.find(c => c.id === id) : null;
  const isAdmin = getCurrentUser()?.role === 'admin';
  
  let h = `
    <div class="modal-header">
      <h3>${customer ? 'Edit Customer' : 'Add Customer'}</h3>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body">
      <form id="customer-form" onsubmit="saveCustomer(event, '${id || ''}')">
        <div class="form-group">
          <label>Name *</label>
          <input type="text" id="cust-name" class="form-input" value="${customer ? escapeHtml(customer.name) : ''}" required>
        </div>
        <div class="form-group">
          <label>Contact Number</label>
          <input type="text" id="cust-contact" class="form-input" value="${customer?.contact ? escapeHtml(customer.contact) : ''}">
        </div>
        <div class="form-group">
          <label>Address</label>
          <input type="text" id="cust-address" class="form-input" value="${customer?.address ? escapeHtml(customer.address) : ''}">
        </div>
        <div class="form-group">
          <label>Credit Limit (₱) ${!isAdmin ? '(Admin only)' : '*'}</label>
          <input type="number" id="cust-limit" class="form-input" value="${customer?.creditLimit || 500}" min="0" step="1" ${!isAdmin ? 'disabled' : 'required'}>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;">
          <button type="submit" class="btn btn-primary flex-1">Save Customer</button>
          ${customer && customer.currentBalance === 0 && isAdmin ? `<button type="button" class="btn btn-danger flex-1" onclick="deleteCustomer('${id}')">Delete</button>` : ''}
        </div>
      </form>
    </div>
  `;
  document.getElementById('modal-content').innerHTML = h;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

async function saveCustomer(e, id) {
  e.preventDefault();
  const data = {
    name: document.getElementById('cust-name').value.trim(),
    contact: document.getElementById('cust-contact').value.trim(),
    address: document.getElementById('cust-address').value.trim()
  };
  
  if (!data.name) return;
  
  const limitInput = document.getElementById('cust-limit');
  if (!limitInput.disabled) {
    data.creditLimit = Number(limitInput.value) || 500;
  }

  try {
    showLoading(true);
    if (id) {
      await db.collection('customers').doc(id).update(data);
      showToast('Customer updated', 'success');
    } else {
      data.currentBalance = 0;
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('customers').add(data);
      showToast('Customer added', 'success');
    }
    closeModal();
  } catch (err) {
    showToast('Failed to save customer', 'error');
    console.error(err);
  } finally {
    showLoading(false);
  }
}

async function deleteCustomer(id) {
  if (!confirm('Are you sure you want to delete this customer?')) return;
  try {
    showLoading(true);
    await db.collection('customers').doc(id).delete();
    showToast('Customer deleted', 'success');
    closeModal();
  } catch (e) {
    showToast('Failed to delete', 'error');
  } finally {
    showLoading(false);
  }
}

function updateCustomerDropdown() {
  const select = document.getElementById('utang-customer-select');
  const limitSpan = document.getElementById('utang-customer-limit');
  if (!select) return;
  
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Choose Customer --</option>' + 
    allCustomers.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (Bal: ₱${(c.currentBalance || 0).toFixed(2)})</option>`).join('');
  
  select.value = currentVal;
  
  select.onchange = () => {
    const c = allCustomers.find(x => x.id === select.value);
    if (c) {
      const avail = c.creditLimit - (c.currentBalance || 0);
      limitSpan.innerHTML = `Credit Limit: ₱${c.creditLimit.toFixed(2)} | <span class="${avail <= 0 ? 'text-danger' : 'text-success'}">Available: ₱${avail.toFixed(2)}</span>`;
    } else {
      limitSpan.innerHTML = '';
    }
  };
}

function payCustomerUtang(customerId) {
  showUtangView('history');
  document.getElementById('utang-history-filter').value = 'outstanding';
  loadUtangHistory(customerId);
}

// ---------- Create Utang POS ----------

function renderUtangPOSProducts() {
  const grid = document.getElementById('utang-pos-product-grid');
  if (!grid) return;
  const search = (document.getElementById('utang-pos-search') || {}).value || '';
  const filtered = allProducts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>No products found.</p></div>';
    return;
  }
  grid.innerHTML = filtered.map(p => `
    <button class="product-btn ${p.stock <= 0 ? 'out-of-stock' : ''}"
      onclick="addUtangToCart('${p.id}')" ${p.stock <= 0 ? 'disabled' : ''}>
      <span class="product-btn-name">${escapeHtml(p.name)}</span>
      <span class="product-btn-price">₱${p.price.toFixed(2)}</span>
      <span class="product-btn-stock">${p.stock <= 0 ? 'Out of Stock' : 'Stock: ' + p.stock}</span>
    </button>
  `).join('');
  
  // Attach search listener once
  const searchInput = document.getElementById('utang-pos-search');
  if (searchInput && !searchInput.oninput) {
    searchInput.oninput = renderUtangPOSProducts;
  }
}

function addUtangToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product || product.stock <= 0) return;

  const existing = utangCart.find(item => item.id === productId);
  if (existing) {
    if (existing.qty >= product.stock) { showToast('Not enough stock!', 'warning'); return; }
    existing.qty++;
  } else {
    utangCart.push({ id: product.id, name: product.name, price: product.price, cost: product.cost || 0, category: product.category, qty: 1, maxStock: product.stock });
  }
  renderUtangCart();
}

function updateUtangCartQty(productId, newQty) {
  const item = utangCart.find(i => i.id === productId);
  if (!item) return;
  const product = allProducts.find(p => p.id === productId);
  const max = product ? product.stock : item.maxStock;
  newQty = parseInt(newQty);
  if (isNaN(newQty) || newQty < 1) { 
    utangCart = utangCart.filter(i => i.id !== productId); 
  } else {
    if (newQty > max) { showToast('Not enough stock!', 'warning'); newQty = max; }
    item.qty = newQty;
  }
  renderUtangCart();
}

function clearUtangCart() {
  utangCart = [];
  renderUtangCart();
}

function renderUtangCart() {
  const tbody = document.getElementById('utang-cart-body');
  const totalEl = document.getElementById('utang-cart-total');
  if (!tbody) return;

  if (utangCart.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cart is empty</td></tr>';
    totalEl.textContent = '₱0.00';
    return;
  }

  tbody.innerHTML = utangCart.map(item => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td class="price-cell">₱${item.price.toFixed(2)}</td>
      <td><input type="number" class="qty-input" value="${item.qty}" min="1" max="${item.maxStock}"
        onchange="updateUtangCartQty('${item.id}', this.value)"></td>
      <td class="price-cell">₱${(item.price * item.qty).toFixed(2)}</td>
      <td><button class="btn btn-sm btn-delete" onclick="updateUtangCartQty('${item.id}', 0)">✕</button></td>
    </tr>
  `).join('');

  const total = utangCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  totalEl.textContent = '₱' + total.toFixed(2);
}

async function saveUtangTransaction() {
  if (utangCart.length === 0) { showToast('Cart is empty', 'warning'); return; }
  
  const customerId = document.getElementById('utang-customer-select').value;
  if (!customerId) { showToast('Please select a customer', 'warning'); return; }
  
  const customer = allCustomers.find(c => c.id === customerId);
  if (!customer) return;
  
  const total = utangCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const newBalance = (customer.currentBalance || 0) + total;
  
  if (newBalance > customer.creditLimit) {
    showToast(`Transaction exceeds credit limit! (Limit: ₱${customer.creditLimit.toFixed(2)})`, 'error');
    return;
  }
  
  const user = getCurrentUser();
  if (!user) return;
  
  try {
    showLoading(true);
    const batch = db.batch();
    
    // Deduct stock
    utangCart.forEach(item => {
      const pRef = db.collection('products').doc(item.id);
      batch.update(pRef, { stock: firebase.firestore.FieldValue.increment(-item.qty) });
    });
    
    // Create utangTransaction
    const txRef = db.collection('utangTransactions').doc();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7); // Default 7 days
    
    batch.set(txRef, {
      customerId: customer.id,
      customerName: customer.name,
      items: utangCart.map(i => ({ id: i.id, name: i.name, price: i.price, cost: i.cost, qty: i.qty, subtotal: i.price * i.qty })),
      total: total,
      remainingBalance: total,
      status: 'outstanding',
      date: firebase.firestore.FieldValue.serverTimestamp(),
      dueDate: firebase.firestore.Timestamp.fromDate(dueDate),
      cashierId: user.uid,
      cashierName: user.name
    });
    
    // Update customer balance
    const custRef = db.collection('customers').doc(customer.id);
    batch.update(custRef, { currentBalance: firebase.firestore.FieldValue.increment(total) });
    
    await batch.commit();
    showToast('Utang recorded successfully!', 'success');
    
    clearUtangCart();
    document.getElementById('utang-customer-select').value = '';
    document.getElementById('utang-customer-limit').innerHTML = '';
    
  } catch (err) {
    console.error(err);
    showToast('Failed to save utang.', 'error');
  } finally {
    showLoading(false);
  }
}

// ---------- Utang History & Payments ----------

async function loadUtangHistory(forceCustomerId = null) {
  try {
    showLoading(true);
    let query = db.collection('utangTransactions').orderBy('date', 'desc');
    
    if (forceCustomerId) {
      query = query.where('customerId', '==', forceCustomerId);
    } else {
      const filter = document.getElementById('utang-history-filter').value;
      if (filter === 'outstanding') {
        query = query.where('status', 'in', ['outstanding', 'partial']);
      } else if (filter === 'paid') {
        query = query.where('status', '==', 'paid');
      }
    }
    
    const snapshot = await query.limit(100).get();
    utangTransactionsCache = [];
    snapshot.forEach(doc => { utangTransactionsCache.push({ id: doc.id, ...doc.data() }); });
    
    renderUtangHistory();
  } catch (e) {
    console.error(e);
    showToast('Failed to load history', 'error');
  } finally {
    showLoading(false);
  }
}

function renderUtangHistory() {
  const el = document.getElementById('utang-history-list');
  if (!el) return;
  
  if (utangTransactionsCache.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No utang records found.</p></div>';
    return;
  }
  
  let h = '<div class="table-responsive"><table class="data-table"><thead><tr><th>Date</th><th>Customer</th><th>Total</th><th>Remaining</th><th>Status</th></tr></thead><tbody>';
  
  utangTransactionsCache.forEach(tx => {
    const date = tx.date ? tx.date.toDate() : new Date();
    const dateStr = date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    
    let statusBadge = '';
    if (tx.status === 'paid') statusBadge = '<span class="badge badge-success">Paid</span>';
    else if (tx.status === 'partial') statusBadge = '<span class="badge badge-warning">Partial</span>';
    else statusBadge = '<span class="badge badge-danger">Outstanding</span>';
    
    h += `<tr class="clickable-row" onclick="showUtangTransactionDetail('${tx.id}')">
      <td>${dateStr}</td>
      <td class="font-weight-600">${escapeHtml(tx.customerName || 'Unknown')}</td>
      <td class="price-cell">₱${(tx.total || 0).toFixed(2)}</td>
      <td class="price-cell text-danger">₱${(tx.remainingBalance || 0).toFixed(2)}</td>
      <td>${statusBadge}</td>
    </tr>`;
  });
  
  h += '</tbody></table></div>';
  el.innerHTML = h;
}

function showUtangTransactionDetail(txId) {
  const tx = utangTransactionsCache.find(t => t.id === txId);
  if (!tx) return;
  
  const date = tx.date ? tx.date.toDate() : new Date();
  
  let h = `
    <div class="modal-header">
      <h3>Utang Details</h3>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body">
      <div class="tx-meta">
        <p><strong>Customer:</strong> ${escapeHtml(tx.customerName)}</p>
        <p><strong>Date:</strong> ${date.toLocaleString('en-PH')}</p>
        <p><strong>Cashier:</strong> ${escapeHtml(tx.cashierName || 'N/A')}</p>
      </div>
      
      <table class="data-table mb-3">
        <thead><tr><th>Item</th><th>Qty</th><th>Subtotal</th></tr></thead>
        <tbody>
  `;
  (tx.items || []).forEach(i => {
    h += `<tr><td>${escapeHtml(i.name)}</td><td>${i.qty}</td><td>₱${i.subtotal.toFixed(2)}</td></tr>`;
  });
  h += `</tbody></table>`;
  
  h += `
    <div class="tx-totals">
      <p><strong>Total Utang:</strong> ₱${(tx.total || 0).toFixed(2)}</p>
      <p><strong>Remaining Balance:</strong> <span class="text-danger">₱${(tx.remainingBalance || 0).toFixed(2)}</span></p>
    </div>
  `;
  
  if (tx.status !== 'paid' && tx.remainingBalance > 0) {
    h += `
      <div class="card mt-3" style="background:var(--gray-50); box-shadow:none; border:1px solid var(--gray-200);">
        <h4 style="margin-bottom:12px;">Make a Payment</h4>
        <div style="display:flex;gap:10px;align-items:center;">
          <input type="number" id="utang-payment-amount" class="form-input" placeholder="Amount (₱)" max="${tx.remainingBalance}" step="0.01" min="0.01">
          <button class="btn btn-success" onclick="processUtangPayment('${tx.id}')">Submit Payment</button>
        </div>
      </div>
    `;
  }
  
  h += `</div>`;
  
  document.getElementById('modal-content').innerHTML = h;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

async function processUtangPayment(txId) {
  const tx = utangTransactionsCache.find(t => t.id === txId);
  if (!tx) return;
  
  const inputEl = document.getElementById('utang-payment-amount');
  const amountStr = inputEl.value;
  const amount = parseFloat(amountStr);
  
  if (isNaN(amount) || amount <= 0) { showToast('Invalid payment amount.', 'warning'); return; }
  if (amount > tx.remainingBalance) { showToast('Payment exceeds remaining balance.', 'warning'); return; }
  
  const user = getCurrentUser();
  if (!user) return;
  
  try {
    showLoading(true);
    const batch = db.batch();
    
    const newRemaining = tx.remainingBalance - amount;
    const newStatus = newRemaining <= 0 ? 'paid' : 'partial';
    
    // Update Transaction
    const txRef = db.collection('utangTransactions').doc(txId);
    batch.update(txRef, {
      remainingBalance: newRemaining,
      status: newStatus
    });
    
    // Record Payment
    const payRef = db.collection('utangPayments').doc();
    batch.set(payRef, {
      utangTransactionId: txId,
      customerId: tx.customerId,
      amountPaid: amount,
      date: firebase.firestore.FieldValue.serverTimestamp(),
      cashierId: user.uid,
      cashierName: user.name,
      remainingAfterPayment: newRemaining
    });
    
    // Update Customer Balance
    const custRef = db.collection('customers').doc(tx.customerId);
    batch.update(custRef, { currentBalance: firebase.firestore.FieldValue.increment(-amount) });
    
    await batch.commit();
    showToast('Payment recorded successfully.', 'success');
    closeModal();
    loadUtangHistory();
    
  } catch (err) {
    console.error(err);
    showToast('Failed to process payment.', 'error');
  } finally {
    showLoading(false);
  }
}
