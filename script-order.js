// /script-order.js  v20
(() => {
  const TIERS = [
    { min: 5000,   max: 20000,  ppu: 0.072,  requiresAuth: false },
    { min: 20000,  max: 160000, ppu: 0.0675, requiresAuth: true  },
    { min: 160000, max: 960000, ppu: 0.063,  requiresAuth: true  },
  ];
  const KIT_UNIT_CENTS = 3600;

  const $qtyMinus = document.getElementById('qty-minus');
  const $qtyPlus  = document.getElementById('qty-plus');
  const $qtyInput = document.getElementById('qty-units');
  const $ppu      = document.getElementById('price-per-unit');
  const $total    = document.getElementById('price-total');
  const $add      = document.getElementById('btn-add-to-cart');
  const $kitBtn   = document.getElementById('starter-kit');
  const $badge    = document.getElementById('cart-count');

  function money(n) {
    return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }
  function ppuForUnits(units) {
    const u = Number(units) || 0;
    return (TIERS.find(t => u >= t.min && u <= t.max)?.ppu) ?? 0;
  }

  function loadCart() {
    try { return JSON.parse(localStorage.getItem('fd_cart') || '[]'); }
    catch { return []; }
  }
  function saveCart(cart) {
    localStorage.setItem('fd_cart', JSON.stringify(cart));
    updateBadge(cart);
  }
  function updateBadge(cart = loadCart()) {
    const count = cart.reduce((n, it) => {
      if (it.type === 'kit') return n + (Number(it.qty) || 0);
      if (it.type === 'bulk') return n + 1;
      return n;
    }, 0);
    if ($badge) $badge.textContent = count > 0 ? String(count) : '';
  }

  function normalizeUnits(v) {
    let u = Number(v) || 5000;
    u = Math.round(u / 5000) * 5000;
    if (u < 5000) u = 5000;
    if (u > 960000) u = 960000;
    return u;
  }

  function recalc() {
    const units = normalizeUnits($qtyInput.value);
    $qtyInput.value = units;
    const unitPrice = ppuForUnits(units);
    $ppu.textContent = money(unitPrice);
    $total.textContent = money((units * unitPrice));
  }

  function addBulkToCart() {
    const units = normalizeUnits($qtyInput.value);
    const cart = loadCart();

    // One bulk line – merge into existing if present
    const ix = cart.findIndex(it => it.type === 'bulk');
    if (ix >= 0) {
      cart[ix].units = units;
    } else {
      cart.push({ type: 'bulk', units });
    }

    saveCart(cart);
    // Scroll to cart link (or redirect if you prefer)
    window.location.href = '/cart.html';
  }

  function addKitToCart() {
    const cart = loadCart();
    const ix = cart.findIndex(it => it.type === 'kit');
    if (ix >= 0) {
      cart[ix].qty = (Number(cart[ix].qty) || 0) + 1;
    } else {
      cart.push({ type: 'kit', qty: 1, unitCents: KIT_UNIT_CENTS });
    }
    saveCart(cart);
    window.location.href = '/cart.html';
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateBadge();
    if ($qtyMinus) $qtyMinus.addEventListener('click', () => { $qtyInput.value = normalizeUnits(($qtyInput.value || 5000) - 5000); recalc(); });
    if ($qtyPlus)  $qtyPlus.addEventListener('click',  () => { $qtyInput.value = normalizeUnits(($qtyInput.value || 5000) + 5000); recalc(); });
    if ($qtyInput) $qtyInput.addEventListener('change', recalc);
    recalc();

    if ($add)    $add.addEventListener('click', addBulkToCart);
    if ($kitBtn) $kitBtn.addEventListener('click', addKitToCart);

    // Any "View Cart" anchor should go to the page:
    document.querySelectorAll('a[href="#cart"]').forEach(a => a.setAttribute('href', '/cart.html'));
  });
})();
