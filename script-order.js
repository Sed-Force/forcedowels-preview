// /script-order.js — binds the calculator (tiered pricing) and calls /api/checkout

const STEP = 5000;
const MIN_UNITS = 5000;
const MAX_UNITS = 960000;

// ID hooks expected on your order page
const elQty   = document.getElementById('qty-units');        // <input type="number">
const elMinus = document.getElementById('qty-minus');        // <button id="qty-minus">−</button>
const elPlus  = document.getElementById('qty-plus');         // <button id="qty-plus">+</button>
const elUnit  = document.getElementById('price-per-unit');   // <span id="price-per-unit"></span>
const elTotal = document.getElementById('price-total');      // <span id="price-total"></span>
const elAdd   = document.getElementById('btn-add-to-cart');  // <button id="btn-add-to-cart">Add to Cart</button>

function clampUnits(n) {
  n = Math.round(n / STEP) * STEP;
  if (n < MIN_UNITS) n = MIN_UNITS;
  if (n > MAX_UNITS) n = MAX_UNITS;
  return n;
}

async function refresh() {
  const units = clampUnits(Number(elQty.value || MIN_UNITS));
  elQty.value = units;

  try {
    const r = await fetch(`/api/pricing?units=${units}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Pricing error');

    // Display with proper formatting
    const unit = j.unitUSD;            // may be fractional cents
    const total = j.totalCents / 100;

    if (elUnit)  elUnit.textContent  = `$${unit.toFixed(4)}`;
    if (elTotal) elTotal.textContent = total.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    // Enable/disable add button
    if (elAdd) elAdd.disabled = false;
  } catch (e) {
    if (elUnit)  elUnit.textContent  = '—';
    if (elTotal) elTotal.textContent = '—';
    if (elAdd) elAdd.disabled = true;
  }
}

async function startCheckout() {
  const units = clampUnits(Number(elQty.value || MIN_UNITS));

  // Try to pass Clerk session (optional)
  let headers = { 'Content-Type': 'application/json' };
  try {
    const token = await window.Clerk?.session?.getToken({ skipCache: true });
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {}

  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify({ units })
  });
  const json = await res.json().catch(() => ({}));

  if (res.status === 401 && json?.error === 'auth_required') {
    // Prompt sign-in (Clerk)
    try {
      await window.Clerk?.openSignIn({ redirectUrl: window.location.href });
    } catch {
      alert('Please sign in to order more than 20,000 units.');
    }
    return;
  }
  if (!res.ok || !json?.url) {
    alert(`Checkout error: ${json?.error || res.statusText}`);
    return;
  }
  window.location = json.url;
}

// Wire events
window.addEventListener('load', async () => {
  if (elMinus) elMinus.addEventListener('click', () => { elQty.value = clampUnits(Number(elQty.value || MIN_UNITS) - STEP); refresh(); });
  if (elPlus)  elPlus.addEventListener('click',  () => { elQty.value = clampUnits(Number(elQty.value || MIN_UNITS) + STEP); refresh(); });
  if (elQty)   elQty.addEventListener('change', refresh);
  if (elAdd)   elAdd.addEventListener('click', startCheckout);

  // Initial state
  if (elQty && !elQty.value) elQty.value = MIN_UNITS;
  refresh();
});
