// /script-order-cart.js (master)
// Single source of truth for adding kit/bulk from the order page and updating header badge.

(() => {
  const CART_KEY = 'fd_cart';

  const getCart = () => {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch { return []; }
  };
  const setCart = (arr) => {
    localStorage.setItem(CART_KEY, JSON.stringify(arr));
    updateBadge();
  };
  const updateBadge = () => {
    const badge = document.getElementById('cart-count');
    if (!badge) return;
    const items = getCart();
    let count = 0;
    for (const it of items) {
      if (it.type === 'bulk') count += Math.max(1, Math.round((it.units || 0) / 5000));
      if (it.type === 'kit') count += it.qty || 0;
    }
    badge.textContent = count ? String(count) : '';
  };

  function addBulk(units) {
    const cart = getCart();
    const existing = cart.find(i => i.type === 'bulk');
    if (existing) existing.units = Math.min(960000, (existing.units || 0) + units);
    else cart.push({ type: 'bulk', sku: 'force-bulk', units });
    setCart(cart);
  }

  function addKit() {
    const cart = getCart();
    const existing = cart.find(i => i.type === 'kit' && i.sku === 'FD-KIT-300');
    if (existing) existing.qty = (existing.qty || 1) + 1;
    else cart.push({ type: 'kit', sku: 'FD-KIT-300', name: 'Force Dowels Kit — 300 units', qty: 1, unitCount: 300, price: 36.00 });
    setCart(cart);
  }

  window.FD_CART = { addBulk, addKit, updateBadge };

  const kitBtn = document.getElementById('starter-kit');
  if (kitBtn && !kitBtn.dataset.bound) {
    kitBtn.dataset.bound = '1';
    kitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      addKit();
      window.location.href = '/cart.html';
    });
  }

  updateBadge();
})();
