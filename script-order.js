// /script-order.js
// Tiered calc + Add-to-Cart (writes consistent shape to localStorage 'fd_cart')

(function () {
  const CART_KEY = 'fd_cart';
  const MIN = 5000, MAX = 960000, STEP = 5000;

  // Tiers (must exactly match cart/checkout)
  function unitPriceFor(units) {
    if (units <= 20000) return 0.072;
    if (units <= 160000) return 0.0675;
    return 0.063;
  }

  // DOM
  const tiers = Array.from(document.querySelectorAll('.tier'));
  const qtyMinus = document.getElementById('qty-minus');
  const qtyPlus  = document.getElementById('qty-plus');
  const qtyInput = document.getElementById('qty-units');
  const ppuEl    = document.getElementById('price-per-unit');
  const totalEl  = document.getElementById('price-total');
  const addBtn   = document.getElementById('btn-add-to-cart');
  const kitBtn   = document.getElementById('starter-kit');
  const viewCartA = document.querySelector('.viewcart a');

  if (viewCartA) viewCartA.href = '/cart.html';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fmtMoney = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

  function normalizeUnits(n) {
    n = Number(n) || MIN;
    n = Math.round(n / STEP) * STEP;
    return clamp(n, MIN, MAX);
  }

  function setActiveTier(units) {
    const up = unitPriceFor(units);
    tiers.forEach(btn => {
      const price = Number(btn.dataset.price || '0');
      btn.classList.toggle('active', Math.abs(price - up) < 1e-9);
    });
  }

  function repaint() {
    const units = normalizeUnits(qtyInput.value);
    const up = unitPriceFor(units);
    if (ppuEl)   ppuEl.textContent   = `$${up.toFixed(4)}`;
    if (totalEl) totalEl.textContent = fmtMoney(units * up);
    setActiveTier(units);
  }

  if (qtyInput) {
    qtyInput.value = normalizeUnits(qtyInput.value);
    qtyInput.addEventListener('change', repaint);
  }
  if (qtyMinus) qtyMinus.addEventListener('click', () => { qtyInput.value = normalizeUnits(qtyInput.value - STEP); repaint(); });
  if (qtyPlus)  qtyPlus .addEventListener('click', () => { qtyInput.value = normalizeUnits(qtyInput.value + STEP); repaint(); });

  // Click a tier button = jump units to that tier’s minimum (or clamp down)
  tiers.forEach(btn => {
    btn.addEventListener('click', () => {
      const min = Number(btn.dataset.min || MIN);
      const max = Number(btn.dataset.max || MAX);
      let u = normalizeUnits(qtyInput.value);
      if (u < min) u = min;
      if (u > max) u = max;
      qtyInput.value = u;
      repaint();
    });
  });

  // Cart helpers
  function readCart() {
    try { const a = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch { return []; }
  }
  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    // ping badge
    try {
      const ev = new Event('storage'); ev.key = CART_KEY; window.dispatchEvent(ev);
    } catch {}
  }

  // Merge rules:
  // - BULK: keep single line with sku 'bulk', accumulate `units` (qty stays 1)
  // - KIT : sku 'FD-KIT-300', qty += 1 (each kit is 300 units @ $0.12 → $36)
  function addBulk(units) {
    const cart = readCart();
    const i = cart.findIndex(it => it.sku === 'bulk');
    if (i >= 0) {
      cart[i].units = (Number(cart[i].units) || 0) + units;
      cart[i].qty = 1;
      cart[i].name = `Force Dowels — Bulk`;
    } else {
      cart.push({ sku: 'bulk', name: 'Force Dowels — Bulk', units, qty: 1 });
    }
    saveCart(cart);
  }

  function addKit() {
    const cart = readCart();
    const i = cart.findIndex(it => it.sku === 'FD-KIT-300');
    if (i >= 0) cart[i].qty = (Number(cart[i].qty) || 1) + 1;
    else cart.push({ sku: 'FD-KIT-300', name: 'Force Dowels — Starter Kit (300)', units: 300, qty: 1 });
    saveCart(cart);
  }

  if (addBtn) addBtn.addEventListener('click', () => {
    const units = normalizeUnits(qtyInput.value);
    addBulk(units);
    // quick confirmation
    const prev = addBtn.textContent; addBtn.disabled = true; addBtn.textContent = 'Added';
    setTimeout(() => { addBtn.disabled = false; addBtn.textContent = prev; }, 900);
  });

  if (kitBtn) kitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    addKit();
    const strong = kitBtn.querySelector('strong');
    const prev = strong ? strong.textContent : ''; if (strong) strong.textContent = 'Added';
    setTimeout(() => { if (strong) strong.textContent = prev; }, 900);
  });

  repaint();
})();
