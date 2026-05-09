// =============================================================================
// Point of Sale Module
// =============================================================================

let cart = [];

function renderPOSProducts() {
  const grid = document.getElementById('pos-product-grid');
  if (!grid) return;
  const search = (document.getElementById('pos-search') || {}).value || '';
  const filtered = allProducts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>No products found.</p></div>';
    return;
  }
  grid.innerHTML = filtered.map(p => `
    <button class="product-btn ${p.stock <= 0 ? 'out-of-stock' : ''} ${p.stock > 0 && p.stock < 5 ? 'low-stock-btn' : ''}"
      onclick="addToCart('${p.id}')" ${p.stock <= 0 ? 'disabled' : ''}>
      <span class="product-btn-name">${escapeHtml(p.name)}</span>
      <span class="product-btn-price">₱${p.price.toFixed(2)}</span>
      <span class="product-btn-stock">${p.stock <= 0 ? 'Out of Stock' : 'Stock: ' + p.stock}</span>
    </button>
  `).join('');
}

function addToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product || product.stock <= 0) return;

  const existing = cart.find(item => item.id === productId);
  if (existing) {
    if (existing.qty >= product.stock) {
      showToast('Not enough stock!', 'warning');
      return;
    }
    existing.qty++;
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, cost: product.cost || 0, category: product.category || 'Uncategorized', qty: 1, maxStock: product.stock });
  }
  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter(item => item.id !== productId);
  renderCart();
}

function updateCartQty(productId, newQty) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  const product = allProducts.find(p => p.id === productId);
  const max = product ? product.stock : item.maxStock;
  newQty = parseInt(newQty);
  if (isNaN(newQty) || newQty < 1) { removeFromCart(productId); renderCart(); return; }
  if (newQty > max) { showToast('Not enough stock!', 'warning'); newQty = max; }
  item.qty = newQty;
  renderCart();
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
}

function renderCart() {
  const tbody = document.getElementById('cart-body');
  const totalEl = document.getElementById('cart-total');
  const changeEl = document.getElementById('change-amount');
  if (!tbody) return;

  if (cart.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cart is empty</td></tr>';
    totalEl.textContent = '₱0.00';
    if (changeEl) changeEl.textContent = '₱0.00';
    return;
  }

  tbody.innerHTML = cart.map(item => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td class="price-cell">₱${item.price.toFixed(2)}</td>
      <td><input type="number" class="qty-input" value="${item.qty}" min="1" max="${item.maxStock}"
        onchange="updateCartQty('${item.id}', this.value)"></td>
      <td class="price-cell">₱${(item.price * item.qty).toFixed(2)}</td>
      <td><button class="btn btn-sm btn-delete" onclick="removeFromCart('${item.id}')">✕</button></td>
    </tr>
  `).join('');

  const total = getCartTotal();
  totalEl.textContent = '₱' + total.toFixed(2);
  calculateChange();
}

function calculateChange() {
  const total = getCartTotal();
  const paid = parseFloat(document.getElementById('amount-paid').value) || 0;
  const change = paid - total;
  const el = document.getElementById('change-amount');
  el.textContent = '₱' + Math.max(0, change).toFixed(2);
  el.classList.toggle('text-danger', change < 0);
}

async function completeSale() {
  if (cart.length === 0) { showToast('Cart is empty!', 'warning'); return; }
  const total = getCartTotal();
  const paid = parseFloat(document.getElementById('amount-paid').value) || 0;
  if (paid < total) { showToast('Amount paid is less than total!', 'error'); return; }

  const user = getCurrentUser();
  if (!user) { showToast('Not logged in!', 'error'); return; }

  try {
    showLoading(true);
    const batch = db.batch();

    // Deduct stock
    cart.forEach(item => {
      const ref = db.collection('products').doc(item.id);
      batch.update(ref, { stock: firebase.firestore.FieldValue.increment(-item.qty) });
    });

    // Save transaction
    const txRef = db.collection('transactions').doc();
    batch.set(txRef, {
      items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, cost: i.cost, category: i.category, qty: i.qty, subtotal: i.price * i.qty })),
      total: total,
      amountPaid: paid,
      change: paid - total,
      cashierId: user.uid,
      cashierName: user.name,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Update dailyStats
    const dateStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
    const dailyStatsRef = db.collection('dailyStats').doc(dateStr);
    const totalProfit = cart.reduce((sum, item) => sum + ((item.price - item.cost) * item.qty), 0);
    const hourStr = new Date().getHours().toString();
    
    const statsUpdate = {
      date: dateStr,
      totalSales: firebase.firestore.FieldValue.increment(total),
      totalProfit: firebase.firestore.FieldValue.increment(totalProfit),
      transactionCount: firebase.firestore.FieldValue.increment(1)
    };
    statsUpdate[`hourlySales.${hourStr}`] = firebase.firestore.FieldValue.increment(total);
    
    cart.forEach(item => {
      statsUpdate[`categorySales.${item.category}`] = firebase.firestore.FieldValue.increment(item.price * item.qty);
      statsUpdate[`productSales.${item.id}.name`] = item.name;
      statsUpdate[`productSales.${item.id}.qty`] = firebase.firestore.FieldValue.increment(item.qty);
      statsUpdate[`productSales.${item.id}.revenue`] = firebase.firestore.FieldValue.increment(item.price * item.qty);
    });

    batch.set(dailyStatsRef, statsUpdate, { merge: true });

    await batch.commit();
    showToast('Sale completed!', 'success');

    // Prepare receipt then print
    prepareReceipt(total, paid, paid - total);
    cart = [];
    document.getElementById('amount-paid').value = '';
    renderCart();

    // Print after a small delay to let DOM update
    setTimeout(() => { window.print(); }, 300);

  } catch (e) {
    console.error('Sale error:', e);
    showToast('Failed to complete sale. ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function prepareReceipt(total, paid, change) {
  const el = document.getElementById('receipt-content');
  const now = new Date();
  const user = getCurrentUser();
  let h = `
    <div class="receipt-header">
      <h2>Sari-Sari Store</h2>
      <p>${now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <p>${now.toLocaleTimeString('en-PH')}</p>
      <p>Cashier: ${user ? user.name : 'N/A'}</p>
    </div>
    <div class="receipt-divider">--------------------------------</div>
    <table class="receipt-table">
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
      <tbody>`;
  cart.forEach(item => {
    h += `<tr><td>${escapeHtml(item.name)}</td><td>${item.qty}</td><td>₱${item.price.toFixed(2)}</td><td>₱${(item.price * item.qty).toFixed(2)}</td></tr>`;
  });
  h += `</tbody></table>
    <div class="receipt-divider">--------------------------------</div>
    <div class="receipt-totals">
      <p><strong>Total: ₱${total.toFixed(2)}</strong></p>
      <p>Paid: ₱${paid.toFixed(2)}</p>
      <p>Change: ₱${change.toFixed(2)}</p>
    </div>
    <div class="receipt-footer"><p>Thank you! Come again!</p></div>`;
  el.innerHTML = h;
}

function cancelSale() {
  if (cart.length === 0) return;
  if (!confirm('Cancel this sale?')) return;
  cart = [];
  document.getElementById('amount-paid').value = '';
  renderCart();
  showToast('Sale cancelled.', 'info');
}
