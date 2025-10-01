// /script-order.js
// Tiered calculator + Add-to-Cart that always writes `units` for badge logic

(function () {
  const CART_KEY = 'fd_cart';

  // --- DOM ----
  const tiers = Array.from(document.querySelectorAll('.tier')); // buttons with data-min,data-max,data-price
  const qtyMinus = document.getElementById('qty-minus');
  const qtyPlus  = document.getElementById('qty-plus');
  const qtyInput = document.getElementById('qty-units'); // number input
  const ppuEl    = document.getElementById('price-per-unit');
  const totalEl  = document.getElementById('price-total');
  const addBtn   = document.getElementById('btn-add-to-cart');
  const kitBtn   = document.getElementById('starter-kit');
  const viewCartA = document.querySelector('.viewcart a');

  // Ensure "View Cart" goes to the real page
  if (viewCartA) viewCartA.href = '/cart.html';

  // --- Helpers ----
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fmtMoney = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
  const step = 5000;
  const MIN_UNITS = 5000;
  const MAX_UNITS = 960000;

  function parseTier(btn) {
    return {
      el: btn,
      min: Number(btn.getAttribute('data-min')) || MIN_UNITS,
      max: Number(btn.getAttribute('data-max')) || MAX_UNITS,
      price: Number(btn.getAttribute('data-price')) || 0
    };
  }

  function getAllTiers() {
    return tiers.map(parseTier).sort((a,b) => a.min - b.min);
  }

  function setActiveTierElement(el) {
    tiers.forEach(b => b.classList.toggle('active', b === el));
  }

  function currentUnits() {
    let u = Number(qtyInput?.value || MIN_UNITS);
    if (!Number.isFinite(u)) u = MIN_UNITS;
    // snap to nearest 5k increment inside bounds
    u = Math.round(u / step) * step;
    return clamp(u, MIN_UNITS, MAX_UNITS);
  }

  function pickTierForUnits(units) {
    const all = getAllTiers();
    // Find the tier whose [min,max] contains units; otherwise nearest allowed
    for (const t of all) {
      if (units >= t.min && units <= t.max) return t;
    }
    // If over max of all, choose the last; if under min, choose the first
    if (units < all[0].min) return all[0];
    return all[all.length - 1];
  }

  function repaintPrice() {
    const units = currentUnits();
    const tier = pickTierForUnits(units);
    if (ppuEl)   ppuEl.textContent   = `$${tier.price.toFixed(4)}`;
    if (totalEl) totalEl.textContent = fmtMoney(units * tier.price);
    // highlight the right tier button
    setActiveTierElement(tier.el);
  }

  function writeUnits(u) {
    if (!qtyInput) return;
    qtyInput.value = clamp(Math.round(u / step) * step, MIN_UNITS, MAX_UNITS);
    repaintPrice();
  }

  // --- Init quantity display on load ---
  if (qtyInput) {
    // normalize initial field
    writeUnits(Number(qtyInput.value || MIN_UNITS));
    qtyInput.addEventListener('change', () => writeUnits(Number(qtyInput.value || MIN_UNITS)));
  }

  if (qtyMinus) qtyMinus.addEventListener('click', () => writeUnits(currentUnits() - step));
  if (qtyPlus)  qtyPlus .addEventListener('click', () => writeUnits(currentUnits() + step));

  // Clicking a tier:
  tiers.forEach(btn => {
    btn.addEventListener('click', () => {
      const t = parseTier(btn);
      // When user clicks a tier, jump the units to at least that tier's min (and within that tier).
      // If current units are within the tier already, just repaint; if above, clamp down to its max.
      let u = currentUnits();
      if (u < t.min) u = t.min;
      if (u > t.max) u = t.max;
      writeUnits(u);
      setActiveTierElement(btn);
    });
  });

  // --- Cart storage ---
  function readCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    // Update the header badge in this tab (matches /script-badge.js expectations)
    try {
      const totalUnits = items.reduce((sum, it) => {
        const qty = Number.isFinite(it.qty) ? it.qty : 1;
        const u = Number.isFinite(it.units) ? it.units : (qty >= 1000 ? qty : 0);
        return sum + u * qty;
      }, 0);
      document.querySelectorAll('#cart-count').forEach(el => {
        el.textContent = totalUnits > 0 ? totalUnits.toLocaleString() : '';
        el.setAttribute('title', totalUnits > 0 ? `${totalUnits.toLocaleString()} dowels` : '');
      });
    } catch {}
  }

  // Merge strategy:
  // - BULK: keep a single line with sku 'bulk' and accumulate `units`
  // - KIT : keep single line with sku 'FD-KIT-300' and increment qty (each kit = 300 units)
  function addBulk(units, unitPrice) {
    const cart = readCart();
    const idx = cart.findIndex(it => it.sku === 'bulk');
    if (idx >= 0) {
      cart[idx].units = (Number(cart[idx].units) || 0) + units;
      // Keep latest per-unit price for display; cart page will re-tiers anyway.
      cart[idx].unitPrice = unitPrice;
    } else {
      cart.push({
        sku: 'bulk',
        name: `Force Dowels — Bulk — ${units.toLocaleString()} units`,
        units: units,               // <-- CRITICAL for the badge
        unitPrice: unitPrice,
        qty: 1                      // always 1 for bulk; we sum in `units`
      });
    }
    saveCart(cart);
  }

  function addKit() {
    const cart = readCart();
    const idx = cart.findIndex(it => it.sku === 'FD-KIT-300');
    if (idx >= 0) {
      cart[idx].qty = (Number(cart[idx].qty) || 1) + 1;
    } else {
      cart.push({
        sku: 'FD-KIT-300',
        name: 'Force Dowels — Starter Kit (300)',
        units: 300,                 // <-- CRITICAL for the badge
        unitPrice: 0.12,
        qty: 1
      });
    }
    saveCart(cart);
  }

  // --- Button handlers ---
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const units = currentUnits();
      const tier = pickTierForUnits(units);
      addBulk(units, tier.price);
      // Optionally flash a tiny confirmation (non-blocking)
      try {
        addBtn.disabled = true;
        const prev = addBtn.textContent;
        addBtn.textContent = 'Added';
        setTimeout(() => {
          addBtn.textContent = prev;
          addBtn.disabled = false;
        }, 900);
      } catch {}
    });
  }

  if (kitBtn) {
    kitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      addKit();
      // Subtle confirmation (does NOT navigate away)
      try {
        kitBtn.disabled = true;
        const prev = kitBtn.querySelector('strong')?.textContent || 'Added';
        const strong = kitBtn.querySelector('strong');
        if (strong) strong.textContent = 'Added';
        setTimeout(() => {
          if (strong) strong.textContent = prev;
          kitBtn.disabled = false;
        }, 900);
      } catch {}
    });
  }

  // initial paint
  repaintPrice();
})();
