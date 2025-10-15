// /script-badge.js
// Unified cart badge calculation: shows total dowel units
(function () {
  function readCart() {
    try { return JSON.parse(localStorage.getItem('fd_cart') || '[]'); }
    catch { return []; }
  }
  function updateBadge() {
    const items = readCart();
    const totalUnits = items.reduce((sum, it) => {
      // Bulk items: use 'units' property (or fallback to 'qty' for old data)
      if (it.type === 'bulk') {
        return sum + (Number(it.units) || Number(it.qty) || 0);
      }
      // Kit items: each kit has 300 dowels
      if (it.type === 'kit') {
        return sum + (Number(it.qty) || 0) * 300;
      }
      return sum;
    }, 0);
    document.querySelectorAll('#cart-count').forEach(el => {
      el.textContent = totalUnits > 0 ? totalUnits.toLocaleString() : '';
      el.setAttribute('title', totalUnits > 0 ? `${totalUnits.toLocaleString()} dowels` : '');
    });
  }
  // Listen for storage events from other tabs
  window.addEventListener('storage', (e) => { if (e.key === 'fd_cart') updateBadge(); });
  // Listen for custom cart update events from same page
  window.addEventListener('fd_cart_updated', updateBadge);
  document.addEventListener('DOMContentLoaded', updateBadge);
})();

