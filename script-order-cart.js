// /script-order-cart.js
// Add-to-cart logic for the Order page (bulk tiers + starter kit).
// Uses the same localStorage cart schema as /script-cart.js

(function () {
  const CART_KEY = 'fd_cart';

  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch { return []; }
  }
  function setCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    updateMiniCount(items);
  }
  function addItem(item) {
    const c = getCart();
    c.push(item);
    setCart(c);
  }
  function updateMiniCount(items = getCart()) {
    const el = document.getElementById('cart-count');
    if (!el) return;
    const qty = items.reduce((s,i)=>s+Number(i.qty||0),0);
    el.textContent = qty > 0 ? qty : '';
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateMiniCount();

    // BULK add (5,000-unit packs -> one "force-100" pack per 5k)
    const addBulkBtn = document.getElementById('add-bulk');
    const qtyInput   = document.getElementById('qty');   // numeric, step 5000
    const ppuLabel   = document.getElementById('ppu');   // text like "$0.072"

    if (addBulkBtn && qtyInput && ppuLabel) {
      addBulkBtn.addEventListener('click', () => {
        const units = Math.max(5000, parseInt(qtyInput.value || '5000', 10));
        const perUnit = parseFloat(String(ppuLabel.textContent || '').replace(/[^0-9.]/g, '')) || 0;

        // Convert total units into number of 5k "packs"
        const packCount = Math.max(1, Math.round(units / 5000));

        addItem({
          sku: 'force-100',                // maps to STRIPE_PRICE_FORCE_100
          name: 'Force Dowels — Bulk',
          qty: packCount,
          unitPrice: perUnit * 5000,       // used only for on-site subtotal displays
          meta: `Tier: 5,000–20,000 • ${units.toLocaleString()} units @ $${perUnit.toFixed(3)}/unit`
        });

        // Optional quick confirmation
        try { alert('Added to cart.'); } catch {}
      });
    }

    // STARTER KIT add (optional)
    const kitBtn = document.getElementById('starter-kit');
    if (kitBtn) {
      kitBtn.addEventListener('click', () => {
        const sku   = kitBtn.dataset.sku  || 'FD-KIT-300';
        const name  = kitBtn.dataset.name || 'Force Dowels Kit — 300 units';
        const price = parseFloat(kitBtn.dataset.price || '36.00');

        addItem({
          sku,
          name,
          qty: 1,
          unitPrice: price,
          meta: 'Starter kit'
        });

        try { alert('Added to cart.'); } catch {}
      });
    }
  });
})();
