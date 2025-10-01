// /script-badge.js
(function () {
  const KEY = 'fd_cart';

  function readCart() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  // We want the badge to show the number of line items (sum of their qty),
  // NOT the number of units (e.g., 5000).
  function calcCount() {
    const items = readCart();
    return items.reduce((sum, it) => sum + (parseInt(it.qty, 10) || 1), 0);
  }

  function paint() {
    const n = calcCount();
    // update all occurrences just in case your header appears on multiple fragments
    document.querySelectorAll('#cart-count').forEach(el => {
      el.textContent = n > 0 ? String(n) : '';
    });
  }

  // repaint when cart changes in THIS tab
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) paint();
  });

  // repaint on load
  document.addEventListener('DOMContentLoaded', paint);

  // paint immediately (for deferred script execution)
  paint();
})();
