// =============================================================================
// Product Management Module (Admin Only)
// =============================================================================

let allProducts = [];
let productsListener = null;
let editingProductId = null;

function initProducts() {
  if (productsListener) productsListener();
  productsListener = db.collection('products').orderBy('name')
    .onSnapshot((snapshot) => {
      allProducts = [];
      snapshot.forEach(doc => { allProducts.push({ id: doc.id, ...doc.data() }); });
      renderProductList();
      renderPOSProducts();
      if (typeof renderLowStockDashboard === 'function') renderLowStockDashboard();
    }, (error) => {
      console.error('Error loading products:', error);
      showToast('Failed to load products.', 'error');
    });
}

async function addProduct(data) {
  try {
    showLoading(true);
    await db.collection('products').add({
      name: data.name.trim(), price: Number(data.price), cost: Number(data.cost || 0),
      stock: Number(data.stock), category: data.category.trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Product added!', 'success');
    resetProductForm();
  } catch (e) { showToast('Failed to add product. ' + e.message, 'error'); }
  finally { showLoading(false); }
}

async function updateProduct(id, data) {
  try {
    showLoading(true);
    await db.collection('products').doc(id).update({
      name: data.name.trim(), price: Number(data.price), cost: Number(data.cost || 0),
      stock: Number(data.stock), category: data.category.trim()
    });
    showToast('Product updated!', 'success');
    resetProductForm();
  } catch (e) { showToast('Failed to update product. ' + e.message, 'error'); }
  finally { showLoading(false); }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  try {
    showLoading(true);
    await db.collection('products').doc(id).delete();
    showToast('Product deleted.', 'success');
  } catch (e) { showToast('Failed to delete. ' + e.message, 'error'); }
  finally { showLoading(false); }
}

function renderProductList() {
  const el = document.getElementById('product-list');
  if (!el) return;
  if (allProducts.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No products yet. Add your first product above!</p></div>';
    return;
  }
  let h = '<div class="table-responsive"><table class="data-table"><thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead><tbody>';
  allProducts.forEach(p => {
    const low = p.stock < 5;
    h += `<tr class="${low ? 'low-stock-row' : ''}">
      <td><span>${escapeHtml(p.name)}</span>${low ? ' <span class="low-stock-badge">LOW</span>' : ''}</td>
      <td><span class="category-tag">${escapeHtml(p.category)}</span></td>
      <td class="price-cell">₱${p.price.toFixed(2)}</td>
      <td class="stock-cell ${low ? 'text-danger' : ''}">${p.stock}</td>
      <td class="actions-cell">
        <button class="btn btn-sm btn-edit" onclick="editProduct('${p.id}')">Edit</button>
        <button class="btn btn-sm btn-delete" onclick="deleteProduct('${p.id}')">Delete</button>
      </td></tr>`;
  });
  h += '</tbody></table></div>';
  el.innerHTML = h;
}

function editProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  editingProductId = id;
  document.getElementById('product-name').value = p.name;
  document.getElementById('product-price').value = p.price;
  document.getElementById('product-cost').value = p.cost !== undefined ? p.cost : 0;
  document.getElementById('product-stock').value = p.stock;
  document.getElementById('product-category').value = p.category;
  document.getElementById('product-form-title').textContent = 'Edit Product';
  document.getElementById('product-submit-btn').textContent = 'Update Product';
  document.getElementById('product-cancel-btn').classList.remove('hidden');
  document.getElementById('product-form').scrollIntoView({ behavior: 'smooth' });
}

function resetProductForm() {
  editingProductId = null;
  document.getElementById('product-form').reset();
  document.getElementById('product-form-title').textContent = 'Add New Product';
  document.getElementById('product-submit-btn').textContent = 'Add Product';
  document.getElementById('product-cancel-btn').classList.add('hidden');
}

function handleProductFormSubmit(e) {
  e.preventDefault();
  const data = {
    name: document.getElementById('product-name').value,
    price: document.getElementById('product-price').value,
    cost: document.getElementById('product-cost').value,
    stock: document.getElementById('product-stock').value,
    category: document.getElementById('product-category').value
  };
  if (!data.name || !data.price || !data.category || data.cost === '') { showToast('Fill in all fields.', 'error'); return; }
  if (Number(data.price) <= 0) { showToast('Price must be > 0.', 'error'); return; }
  if (Number(data.cost) < 0) { showToast('Cost cannot be negative.', 'error'); return; }
  if (Number(data.stock) < 0) { showToast('Stock cannot be negative.', 'error'); return; }
  editingProductId ? updateProduct(editingProductId, data) : addProduct(data);
}

function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
