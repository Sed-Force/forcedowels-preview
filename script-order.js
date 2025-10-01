// /script-order.js  (MASTER)
(function () {
  const FD_CART_KEY = 'fd_cart';

  // --- helpers ---
  function getCart() {
    try {
      const raw = localStorage.getItem(FD_CART_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      localStorage.removeItem(FD_CART_KEY);
      return [];
    }
  }
  function saveCart(items) {
    localStorage.setItem(FD_CART_KEY, JSON.stringify(items || []));
    updateBadge();
  }
  function updateBadge() {
    const el = document.getElementById('cart-count');
    if (!el) return;
    const items = getCart();
    const totalQty = items.reduce((s, it) => s + (+it.qty || 0), 0);
    el.textContent = totalQty > 0 ? String(totalQty) : '';
  }
  function addBulkToCart(units) {
    const items = getCart();
    // Each click = one new line item, qty starts at 1 (do NOT merge)
    items.push({
      id: `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'bulk',
      name: 'Force Dowels — Bulk',
      units: Math.max(5000, Math.min(960000, Math.round(units / 5000) * 5000)), // snap to 5k
      qty: 1
    });
    saveCart(items);
  }
  function addKit() {
    const items = getCart();
    items.push({
      id: `kit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'kit',
      sku: 'FD-KIT-300',
      name: 'Force Dowels Kit — 300 units',
      units: 300,
      price: 36.00,
      qty: 1
    });
    saveCart(items);
  }

  // --- UI wiring for order page ---
  const qtyInput = document.getElementById('qty-units');   // input[type=number]
  const minusBtn = document.getElementById('qty-minus');
  const plusBtn  = document.getElementById('qty-plus');
  const ppuEl    = document.getElementById('price-per-unit');
  const totalEl  = document.getElementById('price-total');
  const addBtn   = document.getElementById('btn-add-to-cart');
  const kitBtn   = document.getElementById('starter-kit');
  const tierButtons = Array.from(document.querySelectorAll('.tiers .tier'));

  function ppuFor(totalUnits) {
    // Tiered PPU is displayed here for UX; real price is computed server-side too
    if (totalUnits >= 160000) return 0.0630;
    if (totalUnits >= 20000)  return 0.0675;
    return 0.0720; // 5k–20k
  }
  function clampUnits(u) {
    u = Math.round(+u || 5000);
    if (u < 5000) u = 5000;
    if (u > 960000) u = 960000;
    // snap to 5k increments
    const rem = u % 5000;
    if (rem) u = u - rem + (rem >= 2500 ? 5000 : 0);
    if (u < 5000) u = 5000;
    return u;
  }
  function refreshPricePreview() {
    if (!qtyInput || !ppuEl || !totalEl) return;
    const units = clampUnits(qtyInput.value);
    qtyInput.value = units;
    const ppu = ppuFor(units);
    ppuEl.textContent = '$' + ppu.toFixed(4);
    totalEl.textContent = '$' + (units * ppu).toFixed(2);
  }

  if (minusBtn && qtyInput) {
    minusBtn.addEventListener('click', () => {
      const u = clampUnits((+qtyInput.value || 5000) - 5000);
      qtyInput.value = u;
      refreshPricePreview();
    });
  }
  if (plusBtn && qtyInput) {
    plusBtn.addEventListener('click', () => {
      const u = clampUnits((+qtyInput.value || 5000) + 5000);
      qtyInput.value = u;
      refreshPricePreview();
    });
  }
  if (qtyInput) {
    qtyInput.addEventListener('change', refreshPricePreview);
    refreshPricePreview();
  }

  // Tier buttons: select one at a time and set the minimum units for that tier
  if (tierButtons.length) {
    tierButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        // de-select others
        tierButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // set quantity to that tier's min
        const min = +btn.dataset.min || 5000;
        qtyInput.value = clampUnits(min);
        refreshPricePreview();
      });
    });
  }

  if (addBtn && qtyInput) {
    addBtn.addEventListener('click', () => {
      const units = clampUnits(qtyInput.value);
      addBulkToCart(units);
      // Optional: toast
      try { alert('Added to cart.'); } catch {}
    });
  }

  if (kitBtn) {
    kitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      addKit();
      try { alert('Starter kit added to cart.'); } catch {}
    });
  }

  // initial badge
  updateBadge();
})();
