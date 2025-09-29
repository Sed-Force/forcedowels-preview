// /script-order.js  (non-overlapping tiers; single active; +/– steps 5,000)

(() => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const money = (n) => (n ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

  // Tier boundaries: [5,000 .. <20,000], [20,000 .. <160,000], [160,000 .. 960,000]
  const TIERS = [
    { min:  5000, ceiling: 20000,  ppu: 0.072  },
    { min: 20000, ceiling: 160000, ppu: 0.0675 },
    { min:160000, ceiling: 960000, ppu: 0.063  },
  ];

  const qtyInput = $('#qty-units') || $('#qty');
  const btnMinus = $('#qty-minus');
  const btnPlus  = $('#qty-plus');
  const pricePerUnitEl = $('#price-per-unit') || $('#ppu');
  const totalEl = $('#price-total') || $('#total');
  const addBtn  = $('#btn-add-to-cart');

  const STEP = 5000, MIN = 5000, MAX = 960000;

  const snapQty = (q) => {
    if (isNaN(q)) q = MIN;
    q = Math.round(q / STEP) * STEP;
    if (q < MIN) q = MIN;
    if (q > MAX) q = MAX;
    return q;
  };

  const tierIndexForQty = (q) => {
    if (q < TIERS[0].ceiling) return 0;        // 5k.. <20k
    if (q < TIERS[1].ceiling) return 1;        // 20k.. <160k
    return 2;                                   // 160k.. 960k
  };

  const tierForQty = (q) => TIERS[tierIndexForQty(q)];

  function setActiveTierByMin(min) {
    // Jump qty to at least this tier's min
    let q = snapQty(parseInt(qtyInput.value, 10));
    if (isNaN(q) || q < min) q = min;
    qtyInput.value = snapQty(q);

    render(); // will set exactly one .active based on qty
  }

  function render() {
    const q = snapQty(parseInt(qtyInput.value, 10));
    qtyInput.value = q;

    const idx = tierIndexForQty(q);
    const tier = TIERS[idx];

    // Ensure exactly one is active
    $$('.tier').forEach((btn, i) => btn.classList.toggle('active', i === idx));

    // Update prices
    pricePerUnitEl.textContent = money(tier.ppu).replace('.00', '');
    totalEl.textContent = money(q * tier.ppu);
  }

  // Tier clicks -> set to that tier's minimum and re-render
  $$('.tier').forEach(btn => {
    btn.addEventListener('click', () => {
      const min = parseInt(btn.dataset.min, 10);
      setActiveTierByMin(min);
    }, { passive: true });
  });

  // Quantity controls
  btnMinus?.addEventListener('click', () => {
    const cur = snapQty(parseInt(qtyInput.value, 10));
    qtyInput.value = snapQty(cur - STEP);
    render();
  });
  btnPlus?.addEventListener('click', () => {
    const cur = snapQty(parseInt(qtyInput.value, 10));
    qtyInput.value = snapQty(cur + STEP);
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
      if (existing) existing.units = Math.min(MAX, (existing.units || 0) + units);
      else cart.push({ type: 'bulk', sku: 'force-bulk', units });
      localStorage.setItem(key, JSON.stringify(cart));
    }
    window.location.href = '/cart.html';
  });

  // Init
  if (qtyInput && !qtyInput.value) qtyInput.value = 5000;
  render();
})();
