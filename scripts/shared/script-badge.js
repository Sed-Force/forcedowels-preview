// /script-badge.js
// Unified cart badge sync: keeps every #cart-count on the page showing the
// current cart's total dowel units, loaded on every page (not just
// cart/checkout/order, which already update their own local badge as a
// side effect of cart actions there — this is what makes the count show
// up on pages that have no cart logic of their own, e.g. the homepage).
(function () {
  function readCart() {
    try { return JSON.parse(localStorage.getItem('fd_cart') || '[]'); }
    catch { return []; }
  }
  function kitUnits(sizeId) {
    // Matches script-cart.js / script-order.js: use the real per-size kit
    // count from the shared catalog when it's loaded, falling back to the
    // current uniform 300 if products.js isn't present on this page.
    const catalog = window.FDProducts;
    if (catalog && typeof catalog.kitUnits === 'function') {
      try { return catalog.kitUnits(sizeId) || 300; } catch { return 300; }
    }
    return 300;
  }
  function updateBadge() {
    const items = readCart();
    const totalUnits = items.reduce((sum, it) => {
      // Bulk items: use 'units' property (or fallback to 'qty' for old data)
      if (it.type === 'bulk') {
        return sum + (Number(it.units) || Number(it.qty) || 0);
      }
      // Kit items: per-size unit count from the catalog
      if (it.type === 'kit') {
        return sum + (Number(it.qty) || 0) * kitUnits(it.sizeId);
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
