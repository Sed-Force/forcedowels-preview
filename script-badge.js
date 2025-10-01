// /script-badge.js
(function () {
  function readCart() {
    try { return JSON.parse(localStorage.getItem('fd_cart') || '[]'); }
    catch { return []; }
  }
  function updateBadge() {
    const items = readCart();
    const totalUnits = items.reduce((sum, it) => {
      const qty = Number(it.qty) || 0;
      const units = Number(it.units) || 0;
      return sum + (qty * units);
    }, 0);
    document.querySelectorAll('#cart-count').forEach(el => {
      el.textContent = totalUnits > 0 ? totalUnits.toLocaleString() : '';
      el.setAttribute('title', totalUnits > 0 ? `${totalUnits.toLocaleString()} dowels` : '');
    });
  }
  window.addEventListener('storage', (e) => { if (e.key === 'fd_cart') updateBadge(); });
  document.addEventListener('DOMContentLoaded', updateBadge);
})();

