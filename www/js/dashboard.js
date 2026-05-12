// =============================================================================
// Dashboard Module (Admin Only)
// =============================================================================

async function loadDashboard() {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') return;

  try {
    showLoading(true);
    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    
    // Fetch last 7 days of dailyStats
    const statsSnapshot = await db.collection('dailyStats')
      .orderBy('date', 'desc')
      .limit(7)
      .get();
      
    const dailyStats = [];
    statsSnapshot.forEach(doc => dailyStats.push(doc.data()));
    
    const todayStats = dailyStats.find(d => d.date === todayStr) || {
      totalSales: 0, totalProfit: 0, transactionCount: 0, 
      hourlySales: {}, categorySales: {}, productSales: {}
    };

    // 1 & 2. Sales, Profit, ATV
    const sales = todayStats.totalSales || 0;
    const profit = todayStats.totalProfit || 0;
    const txCount = todayStats.transactionCount || 0;
    const atv = txCount > 0 ? (sales / txCount) : 0;
    
    document.getElementById('dash-total-sales').textContent = '₱' + sales.toFixed(2);
    document.getElementById('dash-total-profit').textContent = '₱' + profit.toFixed(2);
    document.getElementById('dash-atv').textContent = '₱' + atv.toFixed(2);

    // 3. Peak Hour
    let peakHourStr = '—';
    if (todayStats.hourlySales && Object.keys(todayStats.hourlySales).length > 0) {
      const topHour = Object.entries(todayStats.hourlySales).sort((a,b) => b[1] - a[1])[0][0];
      const h = parseInt(topHour);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      peakHourStr = `${h12}:00 ${ampm} - ${h12}:59 ${ampm}`;
    }
    document.getElementById('dash-peak-hour').textContent = peakHourStr;

    // 4. Top Category
    let topCatStr = '—';
    if (todayStats.categorySales && Object.keys(todayStats.categorySales).length > 0) {
      const topCat = Object.entries(todayStats.categorySales).sort((a,b) => b[1] - a[1])[0];
      topCatStr = `${topCat[0]} (₱${topCat[1].toFixed(2)})`;
    }
    document.getElementById('dash-top-category').textContent = topCatStr;

    // 5. Top 5 Best Sellers
    const topEl = document.getElementById('dash-top-products');
    if (!todayStats.productSales || Object.keys(todayStats.productSales).length === 0) {
      topEl.innerHTML = '<p class="text-muted">No sales today yet.</p>';
    } else {
      const productsArr = Object.values(todayStats.productSales).sort((a,b) => b.qty - a.qty).slice(0, 5);
      const maxQty = productsArr[0].qty;
      topEl.innerHTML = productsArr.map((p, i) => `
        <div class="top-product-item">
          <div class="top-product-rank">#${i + 1}</div>
          <div class="top-product-info">
            <span class="top-product-name">${escapeHtml(p.name)}</span>
            <div class="top-product-bar-bg">
              <div class="top-product-bar" style="width: ${(p.qty / maxQty * 100)}%"></div>
            </div>
          </div>
          <div class="top-product-qty">${p.qty} sold</div>
        </div>
      `).join('');
    }

    // 6. Total Inventory Value
    const invValue = allProducts.reduce((sum, p) => sum + ((p.stock || 0) * (p.price || 0)), 0);
    document.getElementById('dash-inventory-value').textContent = '₱' + invValue.toFixed(2);

    // 7. Sales Trend (Last 7 Days)
    renderSalesTrend(dailyStats);

    // 8. Low Stock & Reorders
    renderLowStockWithReorders(dailyStats);

    // 9. Utang Stats
    renderUtangDashboardStats();

  } catch (e) {
    console.error('Dashboard error:', e);
    showToast('Failed to load dashboard.', 'error');
  } finally {
    showLoading(false);
  }
}

function renderSalesTrend(dailyStats) {
  const container = document.getElementById('dash-sales-trend');
  const past7Days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    past7Days.push(d.toLocaleDateString('en-CA'));
  }
  
  const trendData = past7Days.map(dateStr => {
    const stat = dailyStats.find(d => d.date === dateStr);
    return {
      date: dateStr,
      sales: stat ? stat.totalSales : 0,
      label: dateStr.substring(5).replace('-', '/') // MM/DD
    };
  });
  
  const maxSales = Math.max(...trendData.map(d => d.sales), 100); // minimum scale 100
  
  container.innerHTML = trendData.map(d => {
    const height = (d.sales / maxSales * 100).toFixed(1);
    return `
      <div class="trend-bar-wrapper" title="${d.label}: ₱${d.sales.toFixed(2)}">
        <div class="trend-label" style="margin-bottom:2px">₱${d.sales >= 1000 ? (d.sales/1000).toFixed(1)+'k' : d.sales}</div>
        <div class="trend-bar" style="height: ${height}%"></div>
        <div class="trend-label">${d.label}</div>
      </div>
    `;
  }).join('');
}

function renderLowStockWithReorders(dailyStats) {
  const el = document.getElementById('dash-low-stock');
  if (!el) return;
  
  const lowStock = allProducts.filter(p => p.stock < 5);
  if (lowStock.length === 0) {
    el.innerHTML = '<p class="text-muted">All products are well-stocked.</p>';
    return;
  }
  
  // Calculate average daily sales over the retrieved dailyStats (up to 7 days)
  const daysCount = Math.max(dailyStats.length, 1);
  
  el.innerHTML = lowStock.map(p => {
    let totalQtySold = 0;
    const prodId = sanitizeKey(p.id);
    dailyStats.forEach(stat => {
      if (stat.productSales && stat.productSales[prodId]) {
        totalQtySold += stat.productSales[prodId].qty;
      }
    });
    
    const avgDaily = totalQtySold / daysCount;
    let suggestedReorder = Math.ceil(avgDaily * 2);
    if (suggestedReorder < 10) suggestedReorder = 10; // default minimum reorder
    
    return `
      <div class="low-stock-item" style="flex-direction:column; align-items:flex-start; gap:4px">
        <div style="display:flex; justify-content:space-between; width:100%">
          <span class="low-stock-name font-weight-600">${escapeHtml(p.name)}</span>
          <span class="low-stock-count ${p.stock === 0 ? 'out' : ''}">${p.stock === 0 ? 'OUT OF STOCK' : p.stock + ' left'}</span>
        </div>
        <div class="text-muted" style="font-size:12px">
          💡 Suggested Reorder: <span style="font-weight:700; color:var(--primary)">${suggestedReorder} pcs</span>
        </div>
      </div>
    `;
  }).join('');
}

async function renderUtangDashboardStats() {
  if (typeof allCustomers === 'undefined') return;
  
  let totalUtang = 0;
  allCustomers.forEach(c => {
    if (c.currentBalance > 0) totalUtang += c.currentBalance;
  });
  
  document.getElementById('dash-total-utang').textContent = '₱' + totalUtang.toFixed(2);
  
  try {
    const snapshot = await db.collection('utangTransactions')
      .where('status', 'in', ['outstanding', 'partial'])
      .get();
      
    let overdueCount = 0;
    const now = new Date();
    // Use Set to count unique customers
    const overdueCusts = new Set();
    
    snapshot.forEach(doc => {
      const tx = doc.data();
      if (tx.dueDate && tx.dueDate.toDate() < now) {
        overdueCusts.add(tx.customerId);
      }
    });
    
    document.getElementById('dash-overdue-customers').textContent = overdueCusts.size;
  } catch(e) {
    console.error('Error fetching overdue utangs:', e);
  }
}

