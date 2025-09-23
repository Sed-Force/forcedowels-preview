// /script-order.js — ties the right-side calculator to /api/pricing + /api/checkout

const STEP = 5000, MIN_UNITS = 5000, MAX_UNITS = 960000;

// IDs from your order.html
const elQty   = document.getElementById('qty-units') || document.getElementById('qty'); // support either id
const elMinus = document.getElementById('qty-minus');
const elPlus  = document.getElementById('qty-plus');
const elUnit  = document.getElementById('price-per-unit') || document.getElementById('ppu');
const elTotal = document.getElementById('price-total') || document.getElementById('total');
const elAdd   = document.getElementById('btn-add-to-cart') || document.getElementById('add-bulk');

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
    if (elUnit)  elUnit.textContent  = `$${j.unitUSD.toFixed(4)}`;
    if (elTotal) elTotal.textContent = (j.totalCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    if (elAdd) elAdd.disabled = false;
  } catch {
    if (elUnit)  elUnit.textContent  = '—';
    if (elTotal) elTotal.textContent = '—';
    if (elAdd) elAdd.disabled = true;
  }
}

async function checkoutTiered() {
  const units = clampUnits(Number(elQty.value || MIN_UNITS));
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
    try {
      await window.Clerk?.openSignIn({ redirectUrl: window.location.href });
    } catch { alert('Please sign in to order more than 20,000 units.'); }
    return;
  }
  if (!res.ok || !json?.url) {
alert(`Checkout error: ${json?.error || res.statusText}${json?.detail ? ' — ' + json.detail : ''}`);
    return;
  }
  window.location = json.url;
}

window.addEventListener('load', () => {
  if (elMinus) elMinus.addEventListener('click', () => { elQty.value = clampUnits(Number(elQty.value || MIN_UNITS) - STEP); refresh(); });
  if (elPlus)  elPlus.addEventListener('click',  () => { elQty.value = clampUnits(Number(elQty.value || MIN_UNITS) + STEP); refresh(); });
  if (elQty)   elQty.addEventListener('change', refresh);
  if (elAdd)   elAdd.addEventListener('click', checkoutTiered);

  if (elQty && !elQty.value) elQty.value = MIN_UNITS;
  refresh();
});
