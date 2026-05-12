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

// Barcode Scanner Support
let barcodeBuffer = '';
let lastKeyTime = Date.now();

document.addEventListener('keydown', (e) => {
  // Only listen for barcode if we are in POS tab and not in an input field
  if (currentTab !== 'pos') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const currentTime = Date.now();
  
  // Scanners usually send keys very fast. If > 100ms between keys, it's likely manual typing.
  if (currentTime - lastKeyTime > 100) {
    barcodeBuffer = '';
  }
  
  if (e.key === 'Enter') {
    if (barcodeBuffer.length > 2) {
      handleBarcodeScan(barcodeBuffer);
    }
    barcodeBuffer = '';
  } else if (e.key.length === 1) {
    barcodeBuffer += e.key;
  }
  
  lastKeyTime = currentTime;
});

let scanContext = 'pos';

function handleBarcodeScan(barcode, source = 'scanner') {
  if (scanContext === 'products') {
    const bcInput = document.getElementById('product-barcode');
    if (bcInput) bcInput.value = barcode;
    lookupGlobalProduct(barcode, 'products');
    return;
  }

  const product = allProducts.find(p => p.barcode === barcode);
  if (product) {
    if (source === 'camera') {
      if (document.getElementById('section-utang').classList.contains('hidden')) {
        addToCart(product.id);
      } else {
        if (typeof addUtangToCart === 'function') addUtangToCart(product.id);
      }
    } else {
      addToCart(product.id);
    }
    showToast(`Added: ${product.name}`, 'success');
  } else {
    // If not found in local DB, try Open Food Facts API
    lookupGlobalProduct(barcode, 'pos');
  }
}

async function lookupGlobalProduct(barcode, context = 'pos') {
  try {
    showLoading(true);
    // Mandatory User-Agent for Open Food Facts
    const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=product_name,brands,categories`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'PetleanPOS/1.0 (contact@example.com)' }
    });
    const data = await response.json();

    if (data.status === 1 && data.product) {
      const p = data.product;
      const name = p.product_name || 'Unknown Product';
      const brands = p.brands ? ` (${p.brands})` : '';
      const fullName = name + brands;
      const category = p.categories ? p.categories.split(',')[0] : 'Uncategorized';
      
      if (context === 'products') {
        const nameInput = document.getElementById('product-name');
        const catInput = document.getElementById('product-category');
        if (nameInput) nameInput.value = fullName;
        if (catInput) catInput.value = category;
        showToast('Product details found!', 'success');
      } else {
        showQuickAddModal(barcode, fullName, category);
      }
    } else {
      if (context === 'pos') {
        showToast('Product not found globally. Please enter details manually.', 'info');
        showQuickAddModal(barcode, '', '');
      } else {
        showToast('Product not found globally. Please enter details manually.', 'info');
      }
    }
  } catch (e) {
    console.error('API Error:', e);
    showToast('Failed to lookup barcode online.', 'error');
  } finally {
    showLoading(false);
  }
}

async function startCameraScan(target = 'pos') {
  scanContext = target;
  // 1. Check if we are on a native platform
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
    }
  } catch (e) {
    console.error('API Error:', e);
    showToast('Failed to lookup barcode online.', 'error');
  } finally {
    showLoading(false);
  }
}

function showQuickAddModal(barcode, name, category) {
  let h = `
    <div class="modal-header">
      <h3>New Product Found</h3>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body">
      <p class="mb-3">This product isn't in your inventory yet. Would you like to add it?</p>
      <form id="quick-add-form" onsubmit="handleQuickAdd(event)">
        <div class="form-group">
          <label>Barcode</label>
          <input type="text" id="qa-barcode" class="form-input" value="${barcode}" readonly>
        </div>
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="qa-name" class="form-input" value="${escapeHtml(name)}" required>
        </div>
        <div class="form-group">
          <label>Category</label>
          <input type="text" id="qa-category" class="form-input" value="${escapeHtml(category)}" required>
        </div>
        <div class="product-form-grid">
          <div class="form-group">
            <label>Cost (₱)</label>
            <input type="number" id="qa-cost" class="form-input" placeholder="0.00" step="0.01" value="0">
          </div>
          <div class="form-group">
            <label>Price (₱) *</label>
            <input type="number" id="qa-price" class="form-input" placeholder="0.00" step="0.01" required autofocus>
          </div>
        </div>
        <div class="form-group">
          <label>Initial Stock *</label>
          <input type="number" id="qa-stock" class="form-input" value="10" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block mt-3">Add to Inventory & Cart</button>
      </form>
    </div>
  `;
  document.getElementById('modal-content').innerHTML = h;
  document.getElementById('modal-overlay').classList.remove('hidden');
  
  // Focus price input for speed
  setTimeout(() => document.getElementById('qa-price').focus(), 100);
}

async function handleQuickAdd(e) {
  e.preventDefault();
  const data = {
    barcode: document.getElementById('qa-barcode').value,
    name: document.getElementById('qa-name').value,
    category: document.getElementById('qa-category').value,
    cost: document.getElementById('qa-cost').value,
    price: document.getElementById('qa-price').value,
    stock: document.getElementById('qa-stock').value
  };

  try {
    showLoading(true);
    const docRef = await db.collection('products').add({
      name: data.name.trim(),
      barcode: data.barcode,
      category: data.category.trim(),
      cost: Number(data.cost),
      price: Number(data.price),
      stock: Number(data.stock),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showToast('Product added!', 'success');
    closeModal();
    
    // Add to cart immediately after adding to DB
    addToCart(docRef.id);
  } catch (err) {
    showToast('Failed to add product.', 'error');
  } finally {
    showLoading(false);
  }
}

async function startCameraScan(target = 'pos') {
  // 1. Check if we are on a native platform
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

  if (isNative && Capacitor.isPluginAvailable('BarcodeScanner')) {
    // --- Native Path (ML Kit) ---
    const { BarcodeScanner } = Capacitor.Plugins;
    try {
      const status = await BarcodeScanner.checkPermissions();
      if (status.camera !== 'granted') {
        const requestStatus = await BarcodeScanner.requestPermissions();
        if (requestStatus.camera !== 'granted') {
          showToast('Camera permission denied.', 'error');
          return;
        }
      }

      document.body.classList.add('barcode-scanner-active');
      const overlay = document.createElement('div');
      overlay.id = 'camera-scan-overlay';
      overlay.className = 'barcode-scanner-overlay';
      overlay.innerHTML = `
        <div class="scan-region"></div>
        <div class="scan-controls">
          <button class="btn btn-danger" id="cancel-scan-btn">✕ Stop Scanning</button>
        </div>
      `;
      document.body.appendChild(overlay);

      document.getElementById('cancel-scan-btn').onclick = async () => {
        await BarcodeScanner.stopScan();
        stopCameraUI();
      };

      const result = await BarcodeScanner.startScan();
      if (result.hasContent) {
        handleBarcodeScan(result.content, 'camera');
      }
    } catch (e) {
      console.error('Native scan error:', e);
      showToast('Failed to start native camera.', 'error');
    } finally {
      stopCameraUI();
    }
  } else {
    // --- Web Path (Html5-QRCode) ---
    startWebCameraScan();
  }
}

let html5QrCode = null;

async function startWebCameraScan() {
  if (typeof Html5Qrcode === 'undefined') {
    showToast("Scanner library not loaded. Check internet.", "error");
    return;
  }

  // Check for secure context (HTTPS)
  if (!window.isSecureContext) {
    showToast("Camera requires HTTPS connection.", "error");
    return;
  }

  const container = document.getElementById('web-scanner-container');
  if (!container) return;
  
  container.classList.remove('hidden');
  
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader");
  }

  // Responsive QR Box
  const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
    let minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    let qrboxSize = Math.floor(minEdge * 0.7);
    return { width: qrboxSize, height: qrboxSize };
  };

  const config = { 
    fps: 15, 
    qrbox: qrboxFunction,
    aspectRatio: 1.0
  };

  try {
    // Try environment camera (back camera)
    await html5QrCode.start(
      { facingMode: "environment" }, 
      config,
      (decodedText) => {
        handleBarcodeScan(decodedText, 'camera');
        stopWebCameraScan();
      }
    );
  } catch (err) {
    console.error("Web scanner error:", err);
    let msg = "Camera Error: " + err;
    
    if (err.includes("NotAllowedError") || err.name === 'NotAllowedError') {
      msg = "Camera permission denied. Please allow it in browser settings.";
    } else if (err.includes("OverconstrainedError") || err.name === 'OverconstrainedError') {
      msg = "Back camera not available. Try another browser.";
    } else if (err.includes("NotFoundError") || err.name === 'NotFoundError') {
      msg = "No camera found on this device.";
    }
    
    showToast(msg, "error");
    container.classList.add('hidden');
  }
}

async function stopWebCameraScan() {
  const container = document.getElementById('web-scanner-container');
  if (html5QrCode && html5QrCode.isScanning) {
    await html5QrCode.stop();
  }
  if (container) container.classList.add('hidden');
}

function stopCameraUI() {
  document.body.classList.remove('barcode-scanner-active');
  const overlay = document.getElementById('camera-scan-overlay');
  if (overlay) overlay.remove();
}

function openCashDrawer() {
  const user = getCurrentUser();
  if (!user) return;
  
  console.log('Opening cash drawer...');
  showToast('Cash drawer opened.', 'info');
  
  // In a real environment with ESC/POS, you'd send: \x1B\x70\x00\x19\xFA
  // For web-based printing, the drawer often opens automatically on window.print()
  // if configured in the printer driver.
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
      const catKey = sanitizeKey(item.category || 'Uncategorized');
      const prodId = sanitizeKey(item.id);
      statsUpdate[`categorySales.${catKey}`] = firebase.firestore.FieldValue.increment(item.price * item.qty);
      statsUpdate[`productSales.${prodId}.name`] = item.name;
      statsUpdate[`productSales.${prodId}.qty`] = firebase.firestore.FieldValue.increment(item.qty);
      statsUpdate[`productSales.${prodId}.revenue`] = firebase.firestore.FieldValue.increment(item.price * item.qty);
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
      <h2>Petlean Store</h2>
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
