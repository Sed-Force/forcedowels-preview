// ----- Cart model & helpers -------------------------------------------------
const CART_KEY = 'fd_cart';

// Format money
const fmt = (n) => n.toLocaleString(undefined, {style:'currency', currency:'USD', minimumFractionDigits:2});

// Enforce multiples of 5,000 (min 5,000, max 960,000)
function clampUnits(units) {
  let u = Math.max(5000, Math.min(960000, units|0));
  // snap to nearest 5k
  u = Math.round(u / 5000) * 5000;
  if (u < 5000) u = 5000;
  if (u > 960000) u = 960000;
  return u;
}

// Tiered unit price for bulk dowels
function unitPriceFor(units) {
  if (units <= 0) return 0;
  if (units <= 20000) return 0.072;        // 5k–20k
  if (units <= 160000) return 0.0675;      // >20k–160k
  return 0.063;                             // >160k–960k
}

// Read + normalize legacy entries into {bulkUnits, kitsQty}
function readCart() {
  const raw = localStorage.getItem(CART_KEY);
  let arr = [];
  try { arr = raw ? JSON.parse(raw) : []; } catch { arr = []; }

  let bulkUnits = 0;
  let kitsQty = 0;

  for (const it of arr) {
    if (!it) continue;

    // New format from script-order-addonly.js
    if (it.type === 'bulk' && typeof it.units === 'number') {
      bulkUnits += it.units|0;
      continue;
    }
    if (it.type === 'kit') {
      kitsQty += (it.qty ? it.qty|0 : 1);
      continue;
    }

    // Backward compat (older add-to-cart variants)
    if (it.sku === 'force-bulk' && typeof it.units === 'number') {
      bulkUnits += it.units|0;
      continue;
    }
    if (it.sku === 'FD-KIT-300') {
      kitsQty += (it.qty ? it.qty|0 : 1);
      continue;
    }
    if (it.sku === 'force-100') { // user previously mapped to 5,000 units
      bulkUnits += (it.qty ? it.qty|0 : 1) * 5000;
      continue;
    }
    if (it.sku === 'force-500') { // user previously mapped to 25,000 units
      bulkUnits += (it.qty ? it.qty|0 : 1) * 25000;
      continue;
    }
  }

  // clamp bulk to valid range and multiples
  if (bulkUnits > 0) bulkUnits = clampUnits(bulkUnits);
  if (kitsQty < 0) kitsQty = 0;

  return { bulkUnits, kitsQty };
}

// Persist as the simplified, new format
function writeCart({bulkUnits, kitsQty}) {
  const out = [];
  if (bulkUnits > 0) out.push({ type:'bulk', units: clampUnits(bulkUnits) });
  if (kitsQty > 0) out.push({ type:'kit', sku:'FD-KIT-300', qty: kitsQty|0 });
  localStorage.setItem(CART_KEY, JSON.stringify(out));
  // Update badge in header
  const badge = document.getElementById('cart-count');
  if (badge) {
    const bulkPacks = Math.max(0, Math.floor(bulkUnits/5000));
    const totalCount = bulkPacks + kitsQty;
    badge.textContent = totalCount > 0 ? String(totalCount) : '';
  }
}

// Compute subtotal using live tiers
function computeSubtotal({bulkUnits, kitsQty}) {
  const kitPrice = 36.00;
  const bulkTotal = bulkUnits > 0 ? unitPriceFor(bulkUnits) * bulkUnits : 0;
  const kitsTotal = (kitsQty|0) * kitPrice;
  return { bulkTotal, kitsTotal, subtotal: bulkTotal + kitsTotal, unitPrice: unitPriceFor(bulkUnits) };
}

// Util: create element
const el = (tag, attrs={}, ...children) => {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
};

// ----- Render ---------------------------------------------------------------
function renderCart() {
  const state = readCart();
  const { bulkUnits, kitsQty } = state;
  const { bulkTotal, kitsTotal, subtotal, unitPrice } = computeSubtotal(state);

  const itemsWrap = document.getElementById('cart-items');
  const emptyEl = document.getElementById('cart-empty');
  const itemsCount = document.getElementById('items-count');
  const btnCheckout = document.getElementById('btn-checkout');
  const sumSubtotal = document.getElementById('sum-subtotal');

  itemsWrap.innerHTML = '';

  const rows = [];

  // Bulk row (only if present)
  if (bulkUnits > 0) {
    const qtyInput = el('input', {
      type:'number', min:'5000', max:'960000', step:'5000', value:String(bulkUnits), 'aria-label':'Bulk units'
    });

    const row = el('div', { class:'cart-row' },
      el('div', {},
        el('div', { class:'item-title' }, 'Force Dowels — Bulk'),
        el('div', { class:'item-meta' }, `Tiered pricing applies automatically`)
      ),
      el('div', { class:'qty-control' }, qtyInput),
      el('div', { class:'price' }, `${fmt(unitPrice)}/unit`),
      el('button', { class:'remove', title:'Remove bulk' }, '×')
    );

    // line total (on its own row-like display below)
    const line = el('div', { class:'cart-row', style:'grid-template-columns: 1fr 140px 120px 36px; padding-top:0;' },
      el('div', { class:'muted' }, 'Line total'),
      el('div', {}), // spacer
      el('div', { class:'total', id:'bulk-line-total' }, fmt(bulkTotal)),
      el('div', {})
    );

    // events
    qtyInput.addEventListener('change', () => {
      const u = clampUnits(parseInt(qtyInput.value || '0',10));
      const newState = readCart();
      newState.bulkUnits = u;
      writeCart(newState);

      // Recompute & refresh the price cells live
      const { bulkTotal:bt, unitPrice:up } = computeSubtotal(newState);
      row.querySelector('.price').textContent = `${fmt(up)}/unit`;
      document.getElementById('bulk-line-total').textContent = fmt(bt);

      // Update summary
      const s = computeSubtotal(newState);
      sumSubtotal.textContent = fmt(s.subtotal);
      btnCheckout.disabled = s.subtotal <= 0;

      // Update count label
      const count = Math.max(0, Math.floor(newState.bulkUnits/5000)) + (newState.kitsQty|0);
      itemsCount.textContent = `${count} item${count===1?'':'s'}`;
    });

    row.querySelector('.remove').addEventListener('click', () => {
      const newState = readCart();
      newState.bulkUnits = 0;
      writeCart(newState);
      renderCart();
    });

    rows.push(row, line);
  }

  // Kit row (only if present)
  if (kitsQty > 0) {
    const qtyInput = el('input', {
      type:'number', min:'1', step:'1', value:String(kitsQty), 'aria-label':'Starter kits'
    });

    const row = el('div', { class:'cart-row' },
      el('div', {},
        el('div', { class:'item-title' }, 'Force Dowels Kit — 300 units'),
        el('div', { class:'item-meta' }, '$36.00 each')
      ),
      el('div', { class:'qty-control' }, qtyInput),
      el('div', { class:'price' }, fmt(36.00)),
      el('button', { class:'remove', title:'Remove kit' }, '×')
    );

    const line = el('div', { class:'cart-row', style:'grid-template-columns: 1fr 140px 120px 36px; padding-top:0;' },
      el('div', { class:'muted' }, 'Line total'),
      el('div', {}),
      el('div', { class:'total', id:'kit-line-total' }, fmt(kitsTotal)),
      el('div', {})
    );

    qtyInput.addEventListener('change', () => {
      let q = parseInt(qtyInput.value || '0',10);
      if (q < 1) q = 1;
      const newState = readCart();
      newState.kitsQty = q;
      writeCart(newState);

      const { kitsTotal:kt } = computeSubtotal(newState);
      document.getElementById('kit-line-total').textContent = fmt(kt);

      const s = computeSubtotal(newState);
      sumSubtotal.textContent = fmt(s.subtotal);
      btnCheckout.disabled = s.subtotal <= 0;

      const count = Math.max(0, Math.floor(newState.bulkUnits/5000)) + (newState.kitsQty|0);
      itemsCount.textContent = `${count} item${count===1?'':'s'}`;
    });

    row.querySelector('.remove').addEventListener('click', () => {
      const newState = readCart();
      newState.kitsQty = 0;
      writeCart(newState);
      renderCart();
    });

    rows.push(row, line);
  }

  // Empty state vs rows
  if (rows.length === 0) {
    emptyEl.style.display = '';
    btnCheckout.disabled = true;
    sumSubtotal.textContent = '$0.00';
    itemsWrap.innerHTML = '';
  } else {
    emptyEl.style.display = 'none';
    for (const r of rows) itemsWrap.appendChild(r);
    sumSubtotal.textContent = fmt(subtotal);
    btnCheckout.disabled = subtotal <= 0;
  }

  // Items count label
  const count = Math.max(0, Math.floor(bulkUnits/5000)) + (kitsQty|0);
  itemsCount.textContent = `${count} item${count===1?'':'s'}`;
}

// ----- Checkout -------------------------------------------------------------
async function goCheckout() {
  const state = readCart();
  const { subtotal } = computeSubtotal(state);
  if (subtotal <= 0) return;

  // Hit your existing server route. It must accept this payload.
  // Server will create a Stripe Checkout Session using price_data (dynamic)
  // for bulk and a fixed price for the kit.
  const payload = {
    items: [
      ...(state.bulkUnits > 0 ? [{ type:'bulk', units: state.bulkUnits }] : []),
      ...(state.kitsQty > 0 ? [{ type:'kit', sku:'FD-KIT-300', qty: state.kitsQty }] : []),
    ],
    successUrl: `${window.location.origin}/success.html`,
    cancelUrl: `${window.location.origin}/cart.html`,
  };

  try {
    const res = await fetch('/api/checkout', {
      method:'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Checkout failed');
    const data = await res.json();
    if (data && data.url) {
      window.location = data.url; // Stripe hosted checkout
    } else {
      throw new Error('Missing redirect URL');
    }
  } catch (err) {
    alert('Sorry—unable to start checkout. Please try again.');
    // Optionally log: console.error(err);
  }
}

// ----- Clear cart -----------------------------------------------------------
function clearCart() {
  localStorage.removeItem(CART_KEY);
  const badge = document.getElementById('cart-count');
  if (badge) badge.textContent = '';
  renderCart();
}

// ----- Init -----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Render once
  renderCart();

  // Buttons
  const btnCheckout = document.getElementById('btn-checkout');
  const btnClear = document.getElementById('btn-clear');
  if (btnCheckout) btnCheckout.addEventListener('click', goCheckout);
  if (btnClear) btnClear.addEventListener('click', clearCart);
});
