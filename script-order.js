// /script-order.js  — tier click sets qty to that tier's MIN (works both directions)

(() => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const money = (n) => (n ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

  // Tiers: non-overlapping by definition via "ceiling"
  const TIERS = [
    { min:  5000, ceiling: 20000,  ppu: 0.072  },
    { min: 20000, ceiling: 160000, ppu: 0.0675 },
    { min:160000, ceiling: 960000, ppu: 0.063  },
  ];

  const STEP = 5000, MIN = 5000, MAX = 960000;

  const qtyInput = $('#qty-units') || $('#qty');
  const btnMinus = $('#qty-minus');
  const btnPlus  = $('#qty-plus');
  const pricePerUnitEl = $('#price-per-unit') || $('#ppu');
  const totalEl = $('#price-total') || $('#total');
  const addBtn  = $('#btn-add-to-cart');

  const snapQty = (q) => {
    if (isNaN(q)) q = MIN;
    q = Math.round(q / STEP) * STEP;
    if (q < MIN) q = MIN;
    if (q > MAX) q = MAX;
    return q;
  };

  const tierIndexForQty = (q) => {
    if (q < TIERS[0].ceiling) return 0;        // 5k .. <20k
    if (q < TIERS[1].ceiling) return 1;        // 20k .. <160k
    return 2;                                   // 160k .. 960k
  };
  const tierForQty = (q) => TIERS[tierIndexForQty(q)];

  function setTierToMin(min) {
    qtyInput.value = snapQty(min);  // always jump to the clicked tier's MIN
    render();
  }

  function render() {
    const q = snapQty(parseInt(qtyInput.value, 10));
    qtyInput.value = q;

    const t = tierForQty(q);
    // one active tier
    $$('.tier').forEach((btn, i) => btn.classList.toggle('active', i === tierIndexForQty(q)));

    // unit price as 4 decimals; total formatted as money
    pricePerUnitEl.textContent = `$${t.ppu.toFixed(4)}`;
    totalEl.textContent = money(q * t.ppu);
  }

  // Tier clicks → set to that tier's MIN (works up or down)
  $$('.tier').forEach(btn => {
    btn.addEventListener('click', () => {
      const min = parseInt(btn.dataset.min, 10);
      if (!isNaN(min)) setTierToMin(min);
    }, { passive: true });
  });

  // Quantity controls (± 5,000)
  btnMinus?.addEventListener('click', () => {
    qtyInput.value = snapQty(parseInt(qtyInput.value, 10) - STEP);
    render();
  });
  btnPlus?.addEventListener('click', () => {
    qtyInput.value = snapQty(parseInt(qtyInput.value, 10) + STEP);
    render();
  });
  qtyInput?.addEventListener('input', render);
  qtyInput?.addEventListener('blur', render);

  // Add bulk to cart then go to /cart.html
  addBtn?.addEventListener('click', () => {
    const q = snapQty(parseInt(qtyInput.value, 10));
    if (window.FD_CART?.addBulk) {
      window.FD_CART.addBulk(q);
    } else {
      const key = 'fd_cart';
      const cart = JSON.parse(localStorage.getItem(key) || '[]');
      const existing = cart.find(i => i.type === 'bulk');
      if (existing) existing.units = Math.min(MAX, (existing.units || 0) + q);
      else cart.push({ type: 'bulk', sku: 'force-bulk', units: q });
      localStorage.setItem(key, JSON.stringify(cart));
    }
    window.location.href = '/cart.html';
  });

  // Init
  if (qtyInput && !qtyInput.value) qtyInput.value = 5000;
  render();
})();
