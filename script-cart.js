// /script-cart.js

const CART_KEY = 'fd_cart';

// Read cart from localStorage
function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Write cart
function setCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items || []));
  updateBadge();
}

// Header badge
function updateBadge() {
  const el = document.getElementById('cart-count');
  if (!el) return;

  const items = getCart();
  let count = 0;
  for (const it of items) {
    // count meaningful quantities
    if (Number.isFinite(it?.qty)) count += it.qty;
    else if (Number.isFinite(it?.quantity)) count += it.quantity;
    else if (Number.isFinite(it?.units)) count += Math.max(1, Math.round(it.units / 5000)); // rough badge for units
    else count += 1;
  }
  el.textContent = count > 0 ? String(count) : '';
}

// Render cart table on /cart.html if present
function renderCart() {
  const container = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('cart-subtotal');
  const emptyWrap = document.getElementById('cart-empty');
  const checkoutBtn = document.getElementById('btn-checkout');
  if (!container || !subtotalEl) return;

  const items = getCart();

  // Empty state
  if (items.length === 0) {
    container.innerHTML = '';
    subtotalEl.textContent = '$0.00';
    if (emptyWrap) emptyWrap.style.display = '';
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }
  if (emptyWrap) emptyWrap.style.display = 'none';
  if (checkoutBtn) checkoutBtn.disabled = false;

  // VERY simple display (prices are authoritative at server). We still show a client subtotal
  let html = '';
  let subtotal = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const sku = String(it?.sku || '').toLowerCase();
    let label = it?.name || sku || 'Item';

    if (!it?.name && (sku === 'force-100' || sku === 'force-500')) {
      label = sku === 'force-100' ? 'Force Dowels — 5,000 units' : 'Force Dowels — 25,000 units';
    }
    if (!it?.name && sku === 'fd-kit-300') label = 'Force Dowels Kit — 300 units';

    // naive client subtotal (server will reprice tiers correctly)
    let line = 0;
    if (Number.isFinite(it?.units)) {
      // we don't know tier yet here; show $0.00 and let server compute
      line = 0;
    } else if (sku === 'force-100') {
      line = 36000 * (it?.qty || 1) / 100; // if you're using $360 for 5,000 units
    } else if (sku === 'force-500') {
      line = 168750 * (it?.qty || 1) / 100; // $1,687.50 for 25,000 units
    } else if (sku === 'fd-kit-300' || /kit/i.test(label)) {
      line = 36 * (it?.qty || 1);
    }

    subtotal += line;

    html += `
      <tr data-index="${i}">
        <td class="cart-name">${label}</td>
        <td class="cart-qty">
          ${Number.isFinite(it?.qty) || Number.isFinite(it?.quantity) ? `
            <input type="number" class="qty-input" min="1" step="1" value="${Number(it?.qty ?? it?.quantity ?? 1)}" />
          ` : Number.isFinite(it?.units) ? `
            <div class="units-wrap">
              <button class="u-step" data-delta="-5000" type="button">–</button>
              <input type="number" class="units-input" min="5000" step="5000" value="${it.units}" />
              <button class="u-step" data-delta="5000" type="button">+</button>
            </div>
          ` : `
            <span>1</span>
          `}
        </td>
        <td class="cart-remove"><button class="btn btn--ghost btn-remove" type="button">Remove</button></td>
      </tr>
    `;
  }

  container.innerHTML = html;
  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;

  // Bind qty changes
  container.querySelectorAll('.qty-input').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const row = e.target.closest('tr');
      const idx = Number(row.dataset.index);
      const items = getCart();
      const v = Math.max(1, parseInt(e.target.value || '1', 10));
      if (Number.isFinite(items[idx]?.qty)) items[idx].qty = v;
      else items[idx].quantity = v;
      setCart(items);
      renderCart();
    });
  });

  // Bind units +/-
  container.querySelectorAll('.u-step').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const idx = Number(row.dataset.index);
      const items = getCart();
      const delta = Number(e.currentTarget.getAttribute('data-delta'));
      const current = Number(items[idx]?.units || 5000);
      let next = current + delta;
      if (next < 5000) next = 5000;
      if (next > 960000) next = 960000;
      // snap to 5k steps
      next = Math.round(next / 5000) * 5000;
      items[idx].units = next;
      setCart(items);
      renderCart();
    });
  });

  // Bind units input direct edit
  container.querySelectorAll('.units-input').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const row = e.target.closest('tr');
      const idx = Number(row.dataset.index);
      const items = getCart();
      let v = parseInt(e.target.value || '5000', 10);
      if (!Number.isFinite(v)) v = 5000;
      if (v < 5000) v = 5000;
      if (v > 960000) v = 960000;
      v = Math.round(v / 5000) * 5000;
      items[idx].units = v;
      setCart(items);
      renderCart();
    });
  });

  // Remove
  container.querySelectorAll('.btn-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const idx = Number(row.dataset.index);
      const items = getCart();
      items.splice(idx, 1);
      setCart(items);
      renderCart();
    });
  });
}

// Normalize cart for API
function buildCheckoutPayload() {
  const items = getCart();
  const out = [];
  for (const it of items) {
    const obj = {};
    if (it?.sku) obj.sku = it.sku;
    if (it?.name) obj.name = it.name;
    if (Number.isFinite(it?.qty)) obj.qty = it.qty;
    if (Number.isFinite(it?.quantity)) obj.quantity = it.quantity;
    if (Number.isFinite(it?.units)) obj.units = it.units;
    out.push(obj);
  }
  return { cart: out };
}

// Checkout handler
async function wireCheckout() {
  const btn = document.getElementById('btn-checkout');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Starting…';

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildCheckoutPayload()),
      });

      if (!res.ok) {
        const t = await res.text();
        console.error('Checkout failed', t);
        alert('A server error has occurred.\nPlease try again in a moment.');
        return;
      }

      const data = await res.json();
      if (data?.url) {
        window.location = data.url;
      } else {
        alert('Checkout did not return a URL.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });
}

// Init on load (both header badge and cart page rendering)
window.addEventListener('DOMContentLoaded', () => {
  updateBadge();
  renderCart();
  wireCheckout();
});

