// /script-order.js  (master)
// Drives tier selector, quantity controls (+/- 5,000), and price display.
// Also adds bulk units to cart then navigates to /cart.html.

(() => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const money = (n) => (n ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

  const TIERS = [
    { min: 5000,   max: 20000,  ppu: 0.072  },
    { min: 20000,  max: 160000, ppu: 0.0675 },
    { min: 160000, max: 960000, ppu: 0.063  },
  ];

  const qtyInput = $('#qty-units') || $('#qty');
  const btnMinus = $('#qty-minus');
  const btnPlus  = $('#qty-plus');
  const pricePerUnitEl = $('#price-per-unit') || $('#ppu');
  const totalEl = $('#price-total') || $('#total');
  const addBtn  = $('#btn-add-to-cart');

  let currentTier = TIERS[0];

  const snapQty = (q) => {
    const STEP = 5000, MIN = 5000, MAX = 960000;
    if (isNaN(q)) q = MIN;
    q = Math.round(q / STEP) * STEP;
    if (q < MIN) q = MIN;
    if (q > MAX) q = MAX;
    return q;
  };

  const tierForQty = (q) => {
    for (const t of TIERS) if (q >= t.min && q <= t.max) return t;
    return TIERS[TIERS.length - 1];
  };

  function setActiveTierByMin(min) {
    $$('.tier').forEach(b => b.classList.remove('active'));
    const btn = $(`.tier[data-min="${min}"]`);
    if (btn) btn.classList.add('active');

    let q = parseInt(qtyInput.value, 10);
    if (isNaN(q) || q < min) q = min;
    qtyInput.value = snapQty(q);
    currentTier = tierForQty(q);
    render();
  }

  function render() {
    const q = snapQty(parseInt(qtyInput.value, 10));
    qtyInput.value = q;

    currentTier = tierForQty(q);
    $$('.tier').forEach(b => {
      const min = parseInt(b.dataset.min, 10);
      const max = parseInt(b.dataset.max, 10);
      b.classList.toggle('active', q >= min && q <= max);
    });

    pricePerUnitEl.textContent = money(currentTier.ppu).replace('.00', '');
    totalEl.textContent = money(q * currentTier.ppu);
  }

  $$('.tier').forEach(btn => {
    btn.addEventListener('click', () => {
      const min = parseInt(btn.dataset.min, 10);
      setActiveTierByMin(min);
    }, { passive: true });
  });

  btnMinus?.addEventListener('click', () => {
    const cur = snapQty(parseInt(qtyInput.value, 10));
    qtyInput.value = snapQty(cur - 5000);
    render();
  });
  btnPlus?.addEventListener('click', () => {
    const cur = snapQty(parseInt(qtyInput.value, 10));
    qtyInput.value = snapQty(cur + 5000);
    render();
  });

  qtyInput?.addEventListener('input', render);
  qtyInput?.addEventListener('blur', render);

  // Add bulk to cart and go to /cart.html
  addBtn?.addEventListener('click', () => {
    const units = snapQty(parseInt(qtyInput.value, 10));
    if (window.FD_CART?.addBulk) {
      window.FD_CART.addBulk(units);
    } else {
      const key = 'fd_cart';
      const cart = JSON.parse(localStorage.getItem(key) || '[]');
      const existing = cart.find(i => i.type === 'bulk');
      if (existing) existing.units = Math.min(960000, (existing.units || 0) + units);
      else cart.push({ type: 'bulk', sku: 'force-bulk', units });
      localStorage.setItem(key, JSON.stringify(cart));
    }
    window.location.href = '/cart.html';
  });

  if (qtyInput && !qtyInput.value) qtyInput.value = 5000;
  render();
})();

