// /script-badge.js  — show TOTAL UNITS in the header badge
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

  // Compute total units across all line items.
  // Expected schema: each item has { units, qty }. Fallbacks included for older shapes.
  function calcTotalUnits() {
    const items = readCart();
    let total = 0;

    for (const it of items) {
      const qty = Number.isFinite(it?.qty) ? it.qty : 1;

      // Preferred: explicit units on the item
      if (Number.isFinite(it?.units)) {
        total += it.units * qty;
        continue;
      }

      // Fallbacks for older/legacy shapes (defensive only):
      // Starter kit known size
      if ((it?.sku || '').toUpperCase().includes('KIT') || it?.name?.toLowerCase().includes('kit')) {
        total += 300 * qty; // your kit size
        continue;
      }

      // If an old item mistakenly stored units in qty (e.g., 5000), use that as units:
      if (qty >= 1000) {
        total += qty;
        continue;
      }

      // Otherwise treat as 0 units (unknown)
    }

    return total;
  }

  function paint() {
    const totalUnits = calcTotalUnits();
    document.querySelectorAll('#cart-count').forEach(el => {
      el.textContent = totalUnits > 0 ? totalUnits.toLocaleString() : '';
      // Optional: add a title tooltip so “what is this number?” is clear
      el.setAttribute('title', totalUnits > 0 ? `${totalUnits.toLocaleString()} dowels` : '');
    });
  }

  // repaint when cart changes in THIS tab
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) paint();
  });

  // repaint on load
  document.addEventListener('DOMContentLoaded', paint);
  paint();
})();

