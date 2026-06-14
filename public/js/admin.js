let currentEditProduct = null;

// Navigation
function showSection(section) {
    document.getElementById('ordersSection').style.display = 'none';
    document.getElementById('productsSection').style.display = 'none';
    document.getElementById('reportsSection').style.display = 'none';
    document.getElementById(section + 'Section').style.display = 'block';
    
    const btns = document.querySelectorAll('.nav-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    if (section === 'orders') btns[0].classList.add('active');
    if (section === 'products') btns[1].classList.add('active');
    if (section === 'reports') btns[2].classList.add('active');
    
    if (section === 'orders') fetchOrders();
    if (section === 'products') { loadCategories(); loadProducts(); }
    if (section === 'reports') loadReport();
}

async function checkAuth() {
    const res = await fetch('/api/auth/check', { credentials: 'include' });
    const data = await res.json();
    if (!data.isAdmin) location.href = '/login';
}

async function fetchOrders() {
    const res = await fetch('/api/orders', { credentials: 'include' });
    const orders = await res.json();
    const container = document.getElementById('orders-list');
    if (!orders.length) {
        container.innerHTML = '<p>No orders yet.</p>';
        return;
    }
    container.innerHTML = orders.map(order => `
        <div class="order-item">
            <div><strong>Order #${order.daily_number || 'N/A'}</strong> <span class="order-status status-${order.status}">${order.status}</span></div>
            <div>🧾 Code: ${order.order_code}</div>
            <div>💰 ₱${parseFloat(order.total_amount).toFixed(2)} | 👤 ${order.customer_name || 'Guest'}</div>
            <div>💳 ${order.payment_method === 'cash' ? 'Cash' : 'Digital'} | 📅 ${new Date(order.created_at).toLocaleString()}</div>
            <div><small>Items: ${order.items?.map(i => `${i.quantity}x ${i.product_name}`).join(', ') || 'None'}</small></div>
            <div class="order-actions">
                ${order.status === 'pending_payment' ? `
                    <button onclick="updateStatus(${order.id}, 'paid')" class="success">✅ Confirm Payment</button>
                    <button onclick="cancelOrder(${order.id})" class="danger">❌ Cancel Order</button>
                ` : ''}
                ${order.status === 'paid' ? `
                    <button onclick="updateStatus(${order.id}, 'completed')" class="info">✔️ Mark Completed</button>
                    <button onclick="cancelOrder(${order.id})" class="danger">❌ Cancel Order</button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

async function updateStatus(orderId, status) {
    await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        credentials: 'include'
    });
    fetchOrders();
    loadReport();
    loadProducts();
}

async function cancelOrder(orderId) {
    if (!confirm('Cancel this order? This cannot be undone.')) return;
    try {
        const res = await fetch(`/api/orders/${orderId}/cancel`, {
            method: 'PUT',
            credentials: 'include'
        });
        if (res.ok) {
            alert('Order cancelled');
            fetchOrders();      // refresh order list
            loadReport();       // update sales report
        } else {
            alert('Failed to cancel');
        }
    } catch (err) {
        alert('Error');
    }
}

async function loadCategories() {
    const res = await fetch('/api/categories', { credentials: 'include' });
    const cats = await res.json();
    const select = document.getElementById('prodCategory');
    const editSelect = document.getElementById('editCategory');
    if (select) select.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (editSelect) editSelect.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const listDiv = document.getElementById('categories-list');
    listDiv.innerHTML = cats.map(c => `
        <div class="category-item">
            <span>${c.name}</span>
            <button onclick="deleteCategory(${c.id})" class="danger">Delete</button>
        </div>
    `).join('');
}

async function loadProducts() {
    const res = await fetch('/api/products', { credentials: 'include' });
    const prods = await res.json();
    const container = document.getElementById('products-list');
    if (!prods.length) {
        container.innerHTML = '<p>No products. Add one above.</p>';
        return;
    }
    container.innerHTML = prods.map(p => `
        <div class="product-item">
            <img src="${p.image_url || 'https://via.placeholder.com/50'}" onerror="this.src='https://via.placeholder.com/50'">
            <div class="product-info">
                <strong>${escapeHtml(p.name)}</strong>
                <small>₱${parseFloat(p.price).toFixed(2)} | ${p.category_name || 'Uncategorized'} | 🔥 ${p.sales_count || 0} sold</small>
            </div>
            <div class="product-actions">
                <button onclick="openEditModal(${p.id})" class="info">✏️ Edit</button>
                <button onclick="deleteProduct(${p.id})" class="danger">🗑️</button>
            </div>
        </div>
    `).join('');
}

function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

async function createProduct() {
    const name = document.getElementById('prodName').value.trim();
    const price = parseFloat(document.getElementById('prodPrice').value);
    const category_id = parseInt(document.getElementById('prodCategory').value);
    const imageFile = document.getElementById('prodImage').files[0];
    if (!name || isNaN(price) || !category_id) return alert('Fill all fields');
    
    let image_base64 = null;
    if (imageFile) {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onload = async () => {
            await sendProduct(name, price, category_id, reader.result);
        };
        reader.onerror = () => alert('Failed to read image');
    } else {
        await sendProduct(name, price, category_id, null);
    }
}

async function sendProduct(name, price, category_id, image_base64) {
    const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, category_id, image_base64, available: true }),
        credentials: 'include'
    });
    if (res.ok) {
        alert('Product added!');
        document.getElementById('prodName').value = '';
        document.getElementById('prodPrice').value = '';
        document.getElementById('prodImage').value = '';
        document.getElementById('imagePreview').innerHTML = '';
        loadProducts();
    } else alert('Error adding product');
}

async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    await fetch(`/api/products/${id}`, { method: 'DELETE', credentials: 'include' });
    loadProducts();
}

async function openEditModal(id) {
    const res = await fetch('/api/products', { credentials: 'include' });
    const prods = await res.json();
    const product = prods.find(p => p.id === id);
    if (!product) return;
    currentEditProduct = product;
    document.getElementById('editProductId').value = product.id;
    document.getElementById('editName').value = product.name;
    document.getElementById('editPrice').value = product.price;
    document.getElementById('editCategory').value = product.category_id;
    document.getElementById('editImagePreview').innerHTML = product.image_url ? `<img src="${product.image_url}" style="max-width:100px;">` : '';
    document.getElementById('editModal').style.display = 'flex';
}

async function updateProduct() {
    const id = document.getElementById('editProductId').value;
    const name = document.getElementById('editName').value.trim();
    const price = parseFloat(document.getElementById('editPrice').value);
    const category_id = parseInt(document.getElementById('editCategory').value);
    const imageFile = document.getElementById('editImage').files[0];
    if (!name || isNaN(price) || !category_id) return alert('Fill all fields');
    
    let image_base64 = null;
    if (imageFile) {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onload = async () => {
            await updateProductRequest(id, name, price, category_id, reader.result);
        };
    } else {
        const existingImg = currentEditProduct.image_url;
        await updateProductRequest(id, name, price, category_id, existingImg);
    }
}

async function updateProductRequest(id, name, price, category_id, image_base64) {
    const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, category_id, image_base64, available: true }),
        credentials: 'include'
    });
    if (res.ok) {
        alert('Product updated!');
        closeEditModal();
        loadProducts();
    } else alert('Update failed');
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    document.getElementById('editImage').value = '';
}

async function createCategory() {
    const name = document.getElementById('newCategoryName').value.trim();
    if (!name) return alert('Enter category name');
    await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
        credentials: 'include'
    });
    document.getElementById('newCategoryName').value = '';
    loadCategories();
}

async function deleteCategory(id) {
    if (!confirm('Delete category? Products will become uncategorized.')) return;
    await fetch(`/api/categories/${id}`, { method: 'DELETE', credentials: 'include' });
    loadCategories();
    loadProducts();
}

async function loadReport() {
    try {
        const res = await fetch('/api/orders/report', { credentials: 'include' });
        const report = await res.json();
        const tbody = document.getElementById('report-body');
        
        if (!report || report.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3">No sales data yet.</td></tr>';
            return;
        }
        
        // Report already comes from backend grouped by day, sorted DESC (latest first)
        let html = '';
        let totalOrders = 0;
        let totalRevenue = 0;
        
        for (const row of report) {
            const date = new Date(row.day).toLocaleDateString(undefined, { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
            html += `<tr>
                        <td>${date}</td>
                        <td>${row.orders}</td>
                        <td>₱${parseFloat(row.revenue).toFixed(2)}</td>
                     </tr>`;
            totalOrders += row.orders;
            totalRevenue += parseFloat(row.revenue);
        }
        
        // Add a total row
        html += `<tr style="background:#f0f0f0; font-weight:bold;">
                    <td><strong>Total (last 7 days)</strong></td>
                    <td>${totalOrders}</td>
                    <td>₱${totalRevenue.toFixed(2)}</td>
                 </tr>`;
        tbody.innerHTML = html;
    } catch (err) {
        console.error('Load report error:', err);
        document.getElementById('report-body').innerHTML = '<tr><td colspan="3">Error loading report</td></tr>';
    }
}

// Image preview for add product
document.getElementById('prodImage')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = ev => document.getElementById('imagePreview').innerHTML = `<img src="${ev.target.result}" style="max-width:100px; border-radius:8px;">`;
        reader.readAsDataURL(file);
    } else {
        document.getElementById('imagePreview').innerHTML = '';
    }
});

document.getElementById('editImage')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = ev => document.getElementById('editImagePreview').innerHTML = `<img src="${ev.target.result}" style="max-width:100px; border-radius:8px;">`;
        reader.readAsDataURL(file);
    }
});

// Auto-refresh orders only if orders section visible
setInterval(() => {
    if (document.getElementById('ordersSection').style.display !== 'none') {
        fetchOrders();
    }
}, 5000);

checkAuth();
// Preload all data
fetchOrders();
loadCategories();
loadProducts();
loadReport();
// Start with orders visible
showSection('orders');