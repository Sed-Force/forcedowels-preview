/* /script-order.js  (MASTER) */

(function () {
  // --- DOM ---
  const tierBtns = Array.from(document.querySelectorAll('.tier'));
  const qtyInput = document.getElementById('qty-units');
  const minusBtn = document.getElementById('qty-minus');
  const plusBtn  = document.getElementById('qty-plus');
  const ppuEl    = document.getElementById('price-per-unit');
  const totalEl  = document.getElementById('price-total');
  const addBtn   = document.getElementById('btn-add-to-cart');
  const kitBtn   = document.getElementById('starter-kit');

  if (!qtyInput || !ppuEl || !totalEl || tierBtns.length === 0) return;

  const STEP = 5000;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const fmtMoney = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

  // Pull tiers from the DOM (sorted by min ascending)
  let tiers = tierBtns.map(b => ({
    el: b,
    min: Number(b.dataset.min),
    max: Number(b.dataset.max),
    price: Number(b.dataset.price),
  })).sort((a, b) => a.min - b.min);

  function tierForQty(qty) {
    for (const t of tiers) {
      if (qty >= t.min && qty <= t.max) return t;
    }
    return tiers[tiers.length - 1];
  }

  function setActiveTier(tier) {
    tiers.forEach(t => t.el.classList.toggle('active', t === tier));
  }

  function setQtyToTierMin(tier) {
    qtyInput.value = tier.min;
  }

  const GLOBAL_MIN = tiers[0].min;
  const GLOBAL_MAX = tiers[tiers.length - 1].max;

  function coerceQty(q) {
    if (!Number.isFinite(q)) q = GLOBAL_MIN;
    q = Math.round(q / STEP) * STEP;     // snap to 5k
    q = clamp(q, GLOBAL_MIN, GLOBAL_MAX); // clamp
    return q;
  }

  function recalc() {
    let qty = coerceQty(Number(qtyInput.value));
    qtyInput.value = qty;

    const t = tierForQty(qty);
    setActiveTier(t);

    ppuEl.textContent = `$${t.price.toFixed(4)}`;
    totalEl.textContent = fmtMoney(qty * t.price);
  }

  // Clicking a tier: select only that tier, set qty to its MIN, recalc.
  tierBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const t = tiers.find(x => x.el === btn);
      if (!t) return;
      setActiveTier(t);
      setQtyToTierMin(t);
      recalc();
    });
  });

  minusBtn?.addEventListener('click', () => {
    let q = Number(qtyInput.value) || GLOBAL_MIN;
    q = coerceQty(q - STEP);
    qtyInput.value = q;
    recalc();
  });

  plusBtn?.addEventListener('click', () => {
    let q = Number(qtyInput.value) || GLOBAL_MIN;
    q = coerceQty(q + STEP);
    qtyInput.value = q;
    recalc();
  });

  qtyInput.addEventListener('input', () => recalc());

  // Add-to-cart (bulk)
  addBtn?.addEventListener('click', () => {
    const qty = Number(qtyInput.value) || GLOBAL_MIN;
    const applicableTier = tierForQty(qty);

    const item = {
      type: 'bulk',
      name: 'Force Dowels — Bulk',
      units: qty,
      unitPrice: applicableTier.price,
      sku: 'force-bulk',
    };

    const cart = JSON.parse(localStorage.getItem('fd_cart') || '[]');
    cart.push(item);
    localStorage.setItem('fd_cart', JSON.stringify(cart));

    updateBadge();
    addBtn.classList.add('pulse');
    setTimeout(() => addBtn.classList.remove('pulse'), 700);
  });

  // Add Starter Kit (just add; no auto-nav)
  const kitBtnEl = document.getElementById('starter-kit');
  if (kitBtnEl) {
    kitBtnEl.addEventListener('click', () => {
      const item = {
        type: 'kit',
        name: 'Force Dowels Kit — 300 units',
        units: 300,
        unitPrice: 0.12,
        price: 36.00,
        sku: 'FD-KIT-300'
      };
      const cart = JSON.parse(localStorage.getItem('fd_cart') || '[]');
      cart.push(item);
      localStorage.setItem('fd_cart', JSON.stringify(cart));
      updateBadge();
      kitBtnEl.classList.add('pulse');
      setTimeout(() => kitBtnEl.classList.remove('pulse'), 700);
    });
  }

  function updateBadge() {
    try {
      const n = JSON.parse(localStorage.getItem('fd_cart') || '[]')
        .reduce((sum, it) => sum + (Number(it.units) || 0), 0);
      const badge = document.getElementById('cart-count');
      if (!badge) return;
      if (n > 0) { badge.textContent = n.toLocaleString(); badge.style.display = 'inline-block'; }
      else { badge.textContent = ''; badge.style.display = 'none'; }
    } catch {}
  }

  // init
  const initial = tiers.find(t => t.el.classList.contains('active')) || tiers[0];
  setActiveTier(initial);
  setQtyToTierMin(initial);
  recalc();
  updateBadge();
})();
