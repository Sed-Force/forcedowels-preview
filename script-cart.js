// /script-cart.js — client cart (SKUs only) + Stripe Checkout call

// -------------- Catalog shown on the site --------------
// Display prices are for UI only. Stripe charges from server-side price IDs.
const CATALOG = {
  'force-100': {
    name: 'Force Dowels — 5,000 Pack',
    display: { currency: 'USD', unitAmount: 36000 },   // $360.00
    img: '/images/dowel-group-photo.jpg'
  },
  'force-500': {
    name: 'Force Dowels — 25,000 Pack',
    display: { currency: 'USD', unitAmount: 168750 },  // $1,687.50
    img: '/images/dowel-still-photo.jpg'
  }
};

// -------------- Storage --------------
const STORE_KEY = 'fd:cart';
function loadCart() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
}
function saveCart(cart) { localStorage.setItem(STORE_KEY, JSON.stringify(cart || {})); }
function cartCount(cart) { return Object.values(cart).reduce((a,b)=>a+Number(b||0), 0); }

// -------------- Cart ops --------------
function addItem(sku, qty = 1) {
  if (!CATALOG[sku]) return;
  const cart = loadCart();
  cart[sku] = Math.max(1, Number(cart[sku] || 0) + Number(qty || 1));
  saveCart(cart); renderCart();
}
function setQty(sku, qty) {
  const cart = loadCart();
  const n = Math.max(0, Number(qty || 0));
  if (n === 0) delete cart[sku]; else cart[sku] = n;
  saveCart(cart); renderCart();
}
function removeItem(sku) { setQty(sku, 0); }

// -------------- Render helpers --------------
function fmtMoney(cents, currency='USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0)/100);
}

function renderCart() {
  const cart = loadCart();
  const container = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('cart-subtotal');
  const countEl = document.getElementById('cart-count');
  const checkoutBtn = document.getElementById('btn-checkout');

  // Header badge (if present)
  if (countEl) countEl.textContent = cartCount(cart);

  if (!container) return;

  const rows = [];
  let subtotal = 0;

  Object.entries(cart).forEach(([sku, qty]) => {
    const item = CATALOG[sku];
    if (!item) return;
    const u = item.display?.unitAmount || 0;
    const line = u * qty;
    subtotal += line;

    rows.push(`
      <tr>
        <td>
          <div class="cart-prod">
            <img src="${item.img}" alt="${item.name}">
            <div>
              <div class="cart-name">${item.name}</div>
              <div class="cart-price">${fmtMoney(u, item.display?.currency)}</div>
            </div>
          </div>
        </td>
        <td class="cart-qty">
          <button class="qty-btn" data-sku="${sku}" data-delta="-1" aria-label="Decrease">−</button>
          <input type="number" min="1" value="${qty}" data-sku="${sku}" class="qty-input">
          <button class="qty-btn" data-sku="${sku}" data-delta="1" aria-label="Increase">+</button>
          <button class="rm-btn" data-sku="${sku}" aria-label="Remove">Remove</button>
        </td>
        <td class="cart-line">${fmtMoney(line, item.display?.currency)}</td>
      </tr>
    `);
  });

  container.innerHTML = rows.length
    ? rows.join('')
    : `<tr><td colspan="3" class="cart-empty">Your cart is empty.</td></tr>`;

  if (subtotalEl) subtotalEl.textContent = fmtMoney(subtotal, 'USD');

  // Wire buttons
  container.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sku = btn.dataset.sku;
      const delta = Number(btn.dataset.delta || 0);
      const cart = loadCart();
      const current = Math.max(0, Number(cart[sku] || 0) + delta);
      setQty(sku, current || 1);
    });
  });
  container.querySelectorAll('.qty-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const sku = inp.dataset.sku;
      setQty(sku, Number(inp.value || 1));
    });
  });
  container.querySelectorAll('.rm-btn').forEach(btn => {
    btn.addEventListener('click', () => removeItem(btn.dataset.sku));
  });

  // Enable/disable checkout button
  if (checkoutBtn) checkoutBtn.disabled = Object.keys(cart).length === 0;
}

// -------------- Add-to-cart buttons (any page) --------------
function wireAddToCartButtons() {
  document.querySelectorAll('[data-add-sku]').forEach(btn => {
    btn.addEventListener('click', () => {
      addItem(btn.dataset.addSku, Number(btn.dataset.qty || 1));
    });
  });
}

// -------------- Checkout --------------
async function checkout() {
  const cart = loadCart();
  const items = [];

  Object.entries(cart).forEach(([sku, qty]) => {
    if (!CATALOG[sku]) return;
    items.push({ sku, quantity: qty });  // << send SKUs only
  });

  if (!items.length) return alert('Your cart is empty.');

  // Try to attach Clerk token (optional)
  let headers = { 'Content-Type': 'application/json' };
  try {
    const token = await window.Clerk?.session?.getToken({ skipCache: true });
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {}

  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify({ items })
  });
  const json = await res.json().catch(()=>({}));
  if (!res.ok || !json.url) {
    return alert(`Checkout error: ${json.error || res.statusText}`);
  }
  window.location = json.url;
}

// -------------- Boot --------------
window.addEventListener('load', () => {
  wireAddToCartButtons();
  renderCart();

  const btn = document.getElementById('btn-checkout');
  if (btn) btn.addEventListener('click', checkout);
});
