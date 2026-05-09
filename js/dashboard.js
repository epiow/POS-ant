// =============================================================================
// Dashboard Module (Admin Only)
// =============================================================================

async function loadDashboard() {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') return;

  try {
    showLoading(true);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // Fetch today's transactions
    const snapshot = await db.collection('transactions')
      .where('timestamp', '>=', todayStart)
      .where('timestamp', '<', todayEnd)
      .get();

    let totalSales = 0;
    let txCount = 0;
    const productSales = {};

    snapshot.forEach(doc => {
      const data = doc.data();
      totalSales += data.total || 0;
      txCount++;
      (data.items || []).forEach(item => {
        if (productSales[item.name]) {
          productSales[item.name] += item.qty;
        } else {
          productSales[item.name] = item.qty;
        }
      });
    });

    // Render stats cards
    document.getElementById('dash-total-sales').textContent = '₱' + totalSales.toFixed(2);
    document.getElementById('dash-tx-count').textContent = txCount;

    // Top 5 products
    const sorted = Object.entries(productSales).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topEl = document.getElementById('dash-top-products');
    if (sorted.length === 0) {
      topEl.innerHTML = '<p class="text-muted">No sales today yet.</p>';
    } else {
      const maxQty = sorted[0][1];
      topEl.innerHTML = sorted.map(([name, qty], i) => `
        <div class="top-product-item">
          <div class="top-product-rank">#${i + 1}</div>
          <div class="top-product-info">
            <span class="top-product-name">${escapeHtml(name)}</span>
            <div class="top-product-bar-bg">
              <div class="top-product-bar" style="width: ${(qty / maxQty * 100)}%"></div>
            </div>
          </div>
          <div class="top-product-qty">${qty} sold</div>
        </div>
      `).join('');
    }

    renderLowStockDashboard();
  } catch (e) {
    console.error('Dashboard error:', e);
    showToast('Failed to load dashboard.', 'error');
  } finally {
    showLoading(false);
  }
}

function renderLowStockDashboard() {
  const el = document.getElementById('dash-low-stock');
  if (!el) return;
  const lowStock = allProducts.filter(p => p.stock < 5);
  if (lowStock.length === 0) {
    el.innerHTML = '<p class="text-muted">All products are well-stocked.</p>';
    return;
  }
  el.innerHTML = lowStock.map(p => `
    <div class="low-stock-item">
      <span class="low-stock-name">${escapeHtml(p.name)}</span>
      <span class="low-stock-count ${p.stock === 0 ? 'out' : ''}">${p.stock === 0 ? 'OUT OF STOCK' : p.stock + ' left'}</span>
    </div>
  `).join('');
}
