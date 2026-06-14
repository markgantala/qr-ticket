let products = [];
let categories = [];
let cart = [];
let currentOrderCode = null;
let currentDailyNumber = null;
let statusCheckInterval = null;

// ------------------------------
// LOAD DATA & RESTORE ORDER
// ------------------------------
async function loadData() {
    try {
        const [prodRes, catRes] = await Promise.all([
            fetch('/api/products'),
            fetch('/api/categories')
        ]);
        products = await prodRes.json();
        categories = await catRes.json();
        renderCategories();
        renderProducts(products);
        highlightActiveTab('all');

        // Restore pending order from localStorage
        const savedOrderCode = localStorage.getItem('qr_last_order_code');
        const savedDailyNumber = localStorage.getItem('qr_last_daily_number');
        if (savedOrderCode && savedDailyNumber) {
            currentOrderCode = savedOrderCode;
            currentDailyNumber = savedDailyNumber;
            await restoreOrderStatus(savedOrderCode, savedDailyNumber);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to load menu. Please refresh.');
    }
}

async function restoreOrderStatus(orderCode, dailyNumber) {
    try {
        const res = await fetch(`/api/orders/track/${orderCode}`);
        const data = await res.json();
        if (data.status === 'paid' && data.qr_code) {
            showOrderBox('paid', orderCode, dailyNumber, data.qr_code);
            if (statusCheckInterval) clearInterval(statusCheckInterval);
        } else if (data.status === 'pending_payment') {
            showOrderBox('pending', orderCode, dailyNumber);
            startPolling(orderCode, dailyNumber);
        } else if (data.status === 'completed') {
            showOrderBox('completed', orderCode, dailyNumber);
            if (statusCheckInterval) clearInterval(statusCheckInterval);
        } else {
            // order not found or error – clear storage
            localStorage.removeItem('qr_last_order_code');
            localStorage.removeItem('qr_last_daily_number');
        }
    } catch (err) {
        console.error('Restore failed:', err);
    }
}

function startPolling(orderCode, dailyNumber) {
    if (statusCheckInterval) clearInterval(statusCheckInterval);
    statusCheckInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/orders/track/${orderCode}`);
            const data = await res.json();
            if (data.status === 'paid' && data.qr_code) {
                clearInterval(statusCheckInterval);
                showOrderBox('paid', orderCode, dailyNumber, data.qr_code);
                const oldBox = document.getElementById('orderStatusBox');
                if (oldBox && oldBox.innerHTML.includes('Waiting')) oldBox.remove();
            } else if (data.status === 'completed') {
                clearInterval(statusCheckInterval);
                showOrderBox('completed', orderCode, dailyNumber);
            }
        } catch (err) {}
    }, 3000);
}

// Show floating box (waiting / QR / completed)
function showOrderBox(type, orderCode, dailyNumber, qrImage = null) {
    let existing = document.getElementById('orderStatusBox');
    if (existing) existing.remove();

    const box = document.createElement('div');
    box.id = 'orderStatusBox';
    let bgColor, borderColor, html;
    if (type === 'paid') {
        bgColor = 'white';
        borderColor = '#27ae60';
        html = `
            <div style="font-size:14px; font-weight:bold;">✅ Order #${dailyNumber}</div>
            <div style="font-size:12px; color:#666;">Code: ${orderCode}</div>
            <img src="${qrImage}" style="width:100px; margin:5px 0;">
            <button onclick="closeOrderBox()" style="background:#c0392b; padding:4px 12px;">✕</button>
        `;
    } else if (type === 'pending') {
        bgColor = '#fff3cd';
        borderColor = '#f39c12';
        html = `
            <div>⏳ Waiting for payment confirmation</div>
            <div><strong>Order #${dailyNumber}</strong><br><small>${orderCode}</small></div>
            <button onclick="closeOrderBox()" style="background:#666; padding:4px 12px;">Dismiss</button>
        `;
    } else { // completed
        bgColor = '#d4edda';
        borderColor = '#27ae60';
        html = `
            <div>✅ Order #${dailyNumber} completed!</div>
            <div><small>${orderCode}</small></div>
            <button onclick="closeOrderBox()" style="background:#27ae60; padding:4px 12px;">OK</button>
        `;
    }
    box.style.cssText = `position:fixed; bottom:140px; right:20px; background:${bgColor}; padding:15px; border-radius:16px; box-shadow:0 4px 12px rgba(0,0,0,0.15); text-align:center; z-index:998; border:2px solid ${borderColor};`;
    box.innerHTML = html;
    document.body.appendChild(box);
}

function closeOrderBox() {
    const box = document.getElementById('orderStatusBox');
    if (box) box.remove();
    localStorage.removeItem('qr_last_order_code');
    localStorage.removeItem('qr_last_daily_number');
    if (statusCheckInterval) clearInterval(statusCheckInterval);
    currentOrderCode = null;
    currentDailyNumber = null;
}

// ------------------------------
// RENDER CATEGORIES & PRODUCTS
// ------------------------------
function renderCategories() {
    const container = document.getElementById('categoryTabs');
    if (!container) return;
    let html = `<div class="category-tab" data-category="all" onclick="filterProducts('all')">All Items</div>`;
    categories.forEach(cat => {
        html += `<div class="category-tab" data-category="${cat.id}" onclick="filterProducts(${cat.id})">${cat.name}</div>`;
    });
    container.innerHTML = html;
}

function filterProducts(categoryId) {
    if (categoryId === 'all') {
        renderProducts(products);
    } else {
        const filtered = products.filter(p => p.category_id == categoryId);
        renderProducts(filtered);
    }
    highlightActiveTab(categoryId);
}

function highlightActiveTab(categoryId) {
    const tabs = document.querySelectorAll('.category-tab');
    tabs.forEach(tab => {
        const tabCategory = tab.getAttribute('data-category');
        if ((categoryId === 'all' && tabCategory === 'all') || (tabCategory == categoryId)) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
}

function renderProducts(productList) {
    const container = document.getElementById('products-container');
    if (!productList.length) {
        container.innerHTML = '<p style="text-align:center; padding:40px;">No products in this category.</p>';
        return;
    }
    container.innerHTML = productList.map(p => `
        <div class="product-card">
            <div class="product-image">
                <img src="${p.image_url || 'https://via.placeholder.com/300x200/CCCCCC/white?text=No+Image'}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/300x200/CCCCCC/white?text=No+Image'">
            </div>
            <div class="product-info">
                <h4>${escapeHtml(p.name)}</h4>
                <div class="price">₱${parseFloat(p.price).toFixed(2)}</div>
                <button class="add-to-cart" onclick="addToCart(${p.id}, '${escapeHtml(p.name)}', ${p.price})">Add to Cart</button>
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

// ------------------------------
// CART & QUANTITY CONTROLS
// ------------------------------
function addToCart(id, name, price) {
    const existing = cart.find(i => i.product_id === id);
    if (existing) existing.quantity++;
    else cart.push({ product_id: id, name, price, quantity: 1 });
    updateCartUI();

    // Simple animation (flash card)
    const cards = document.querySelectorAll('.product-card');
    for (let card of cards) {
        const btn = card.querySelector('.add-to-cart');
        if (btn && btn.getAttribute('onclick').includes(`addToCart(${id}`)) {
            card.classList.add('card-animation');
            setTimeout(() => card.classList.remove('card-animation'), 300);
            break;
        }
    }
    // Bounce cart button
    const cartBtn = document.querySelector('.cart-button-top');
    if (cartBtn) {
        cartBtn.classList.add('cart-bounce');
        setTimeout(() => cartBtn.classList.remove('cart-bounce'), 300);
    }
}

function updateCartUI() {
    const cartDiv = document.getElementById('cart-items');
    let total = 0;
    if (cart.length === 0) {
        cartDiv.innerHTML = '<p>Your cart is empty.</p>';
    } else {
        cartDiv.innerHTML = cart.map((item, idx) => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                    <div class="cart-item-price">₱${item.price.toFixed(2)}</div>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="decrementQuantity(${idx})">-</button>
                    <span class="cart-item-qty">${item.quantity}</span>
                    <button class="qty-btn" onclick="incrementQuantity(${idx})">+</button>
                    <button class="remove-btn" onclick="removeItem(${idx})">🗑️</button>
                </div>
            </div>
        `).join('');
        total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    }
    document.getElementById('cart-total').innerText = total.toFixed(2);
    document.getElementById('cartCount').innerText = cart.reduce((s,i) => s + i.quantity, 0);
}

function incrementQuantity(idx) {
    cart[idx].quantity++;
    updateCartUI();
}

function decrementQuantity(idx) {
    if (cart[idx].quantity > 1) cart[idx].quantity--;
    else cart.splice(idx, 1);
    updateCartUI();
}

function removeItem(idx) {
    cart.splice(idx, 1);
    updateCartUI();
}

function toggleCart() {
    document.getElementById('cartSidebar').classList.toggle('open');
}

// ------------------------------
// PLACE ORDER
// ------------------------------
async function placeOrder() {
    if (!cart.length) return alert('Cart is empty');
    
    const customer_name = document.getElementById('customerName').value;
    const payment_method = document.getElementById('paymentMethod').value;
    const total_amount = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    
    // Check if digital (but disabled in HTML) – just in case
    if (payment_method === 'digital') {
        alert('Digital payment is currently unavailable. Please select "Pay at counter".');
        return;
    }
    
    try {
        const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_name, items: cart, payment_method, total_amount })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('qr_last_order_code', data.order_code);
            localStorage.setItem('qr_last_daily_number', data.daily_number);
            currentOrderCode = data.order_code;
            currentDailyNumber = data.daily_number;

            let resultHtml = `<div style="text-align:center; margin-top:20px; padding:15px; background:#f0f9ff; border-radius:12px;">
                                <p><strong>✅ Order placed!</strong></p>
                                <p><strong>Order #${data.daily_number}</strong><br><small>Code: ${data.order_code}</small></p>`;
            if (data.qr_code) {
                resultHtml += `<img src="${data.qr_code}" style="width:150px; margin:10px 0;"><br>
                               <small>Show this QR to the owner.</small>`;
                showOrderBox('paid', data.order_code, data.daily_number, data.qr_code);
            } else {
                resultHtml += `<p style="color:#e67e22;">⏳ Waiting for payment confirmation.</p>
                               <small>QR will appear automatically after cashier confirms.</small>`;
                showOrderBox('pending', data.order_code, data.daily_number);
                startPolling(data.order_code, data.daily_number);
            }
            resultHtml += `<button onclick="closeCartAndReset()" style="margin-top:10px;">Close</button></div>`;
            document.getElementById('orderResult').innerHTML = resultHtml;
            cart = [];
            updateCartUI();
        } else {
            alert('Order failed: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('Place order error:', err);
        alert('Network error. Please try again.');
    }
}

function closeCartAndReset() {
    toggleCart();
    document.getElementById('orderResult').innerHTML = '';
}

// ------------------------------
// START
// ------------------------------
loadData();