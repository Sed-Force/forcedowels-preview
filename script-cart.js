/* Force Dowels — Cart page logic with tiered pricing */
(function () {
  const LS_KEY = 'fd_cart';
  const STEP = 5000;
  const LIMIT_MIN = 5000;
  const LIMIT_MAX = 960000;

  // Pricing (USD)
  const PRICES = {
    kitPrice: 36.00,          // per kit (300 units)
    tiers: [
      { min: 160000, ppu: 0.0630 },
      { min: 20000,  ppu: 0.0675 },
      { min: 5000,   ppu: 0.0720 },
    ]
  };

  const $items = document.getElementById('cart-items');
  const $subtotal = document.getElementById('order-subtotal');
  const $checkout = document.getElementById('btn-checkout');

  const money = n => (n || 0).toLocaleString('en-US', {style: 'currency', currency: 'USD'});

  function load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch { return []; }
  }
  function save(items) {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
    updateBadge(items);
  }
  function updateBadge(items) {
    const badge = document.getElementById('cart-count');
    if (badge) {
      const count = items.reduce((n,i)=> n + (i.type==='kit' ? i.qty : (i.type==='bulk' && i.units ? 1 : 0)), 0);
      badge.textContent = count ? String(count) : '';
    }
  }

  const clampUnits = u => {
    u = Math.round((+u||0)/STEP)*STEP;
    u = Math.max(0, Math.min(LIMIT_MAX, u));
    // enforce minimum if present at all
    if (u > 0 && u < LIMIT_MIN) u = LIMIT_MIN;
    return u;
  };

  function pricePerUnit(units) {
    if (!units || units < LIMIT_MIN) return 0;
    for (const t of PRICES.tiers) {
      if (units >= t.min) return t.ppu;
    }
    return PRICES.tiers[PRICES.tiers.length - 1].ppu;
  }

  function calc(items) {
    const bulk = items.find(i => i.type==='bulk');
    const kit  = items.find(i => i.type==='kit');

    const units = bulk?.units || 0;
    const ppu = pricePerUnit(units);
    const bulkTotal = units * ppu;

    const kitQty = kit?.qty || 0;
    const kitTotal = kitQty * PRICES.kitPrice;

    return {
      units, ppu, bulkTotal,
      kitQty, kitTotal,
      subtotal: bulkTotal + kitTotal
    };
  }

  function rowBulk(units, ppu, bulkTotal) {
    return `
      <div class="cart-row" data-type="bulk">
        <div class="item-title">
          <strong>Force Dowels — Bulk</strong>
          <div class="muted">${units ? units.toLocaleString() : 0} units</div>
        </div>

        <div class="qty">
          <button class="step" data-act="minus" aria-label="decrease">–</button>
          <input class="qty-input" data-kind="bulk" type="number" step="${STEP}" min="${LIMIT_MIN}" max="${LIMIT_MAX}" value="${units||LIMIT_MIN}">
          <button class="step" data-act="plus" aria-label="increase">+</button>
        </div>

        <div class="price">
          <div class="muted">Price/Unit</div>
          <strong>${ppu ? money(ppu) : '$0.0000'}</strong>
        </div>

        <div class="total">
          <div class="muted">Line Total</div>
          <strong>${money(bulkTotal)}</strong>
        </div>

        <button class="remove" data-act="remove-bulk" aria-label="Remove">🗑</button>
      </div>
    `;
  }

  function rowKit(qty) {
    return `
      <div class="cart-row" data-type="kit">
        <div class="item-title">
          <strong>Force Dowels Kit — 300 units</strong>
          <div class="muted">$${PRICES.kitPrice.toFixed(2)} each</div>
        </div>

        <div class="qty">
          <button class="step" data-act="kit-minus" aria-label="decrease">–</button>
          <input class="qty-input" data-kind="kit" type="number" min="1" step="1" value="${qty||1}">
          <button class="step" data-act="kit-plus" aria-label="increase">+</button>
        </div>

        <div class="price">
          <div class="muted">Qty</div>
          <strong>${qty||1}</strong>
        </div>

        <div class="total">
          <div class="muted">Line Total</div>
          <strong>${money((qty||1)*PRICES.kitPrice)}</strong>
        </div>

        <button class="remove" data-act="remove-kit" aria-label="Remove">🗑</button>
      </div>
    `;
  }

  function render() {
    const items = load();
    updateBadge(items);

    if (!items.length) {
      $items.innerHTML = `
        <div class="empty">
          <p>Your cart is empty.</p>
          <a class="btn btn--accent" href="/order.html">Add Items</a>
        </div>`;
      $subtotal.textContent = '$0.00';
      $checkout.disabled = true;
      return;
    }

    const { units, ppu, bulkTotal, kitQty, kitTotal, subtotal } = calc(items);

    let html = '';
    if (items.some(i => i.type==='bulk')) html += rowBulk(units, ppu, bulkTotal);
    if (items.some(i => i.type==='kit'))  html += rowKit(kitQty);

    $items.innerHTML = html;
    $subtotal.textContent = money(subtotal);
    $checkout.disabled = subtotal <= 0;
  }

  function ensureLines() {
    // guarantee at most one bulk + one kit row
    const items = load();
    let bulkUnits = 0, kitQty = 0;
    items.forEach(i => {
      if (i.type === 'bulk') bulkUnits += (i.units||0);
      if (i.type === 'kit')  kitQty   += (i.qty||0);
    });
    const merged = [];
    if (bulkUnits) merged.push({ type:'bulk', units: clampUnits(bulkUnits) });
    if (kitQty)   merged.push({ type:'kit',  qty: Math.max(1, kitQty|0) });
    save(merged);
  }

  // Event delegation for clicks/changes
  document.addEventListener('click', (e) => {
    if (!$items.contains(e.target) && !document.getElementById('btn-merge')?.contains(e.target)
        && !document.getElementById('btn-clear')?.contains(e.target)
        && e.target.id !== 'btn-checkout') return;

    const items = load();

    // Clear
    if (e.target.id === 'btn-clear') {
      save([]);
      render();
      return;
    }

    // Consolidate
    if (e.target.id === 'btn-merge') {
      ensureLines();
      render();
      return;
    }

    // Checkout
    if (e.target.id === 'btn-checkout') {
      const { units, kitQty, subtotal } = (function(){
        const s = calc(load());
        return { units: s.units, kitQty: s.kitQty, subtotal: s.subtotal };
      })();

      if (subtotal <= 0) return;

      // Hand off to Stripe through your backend
      fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          source: 'cart',
          bulk_units: units || 0,
          kit_qty: kitQty || 0,
        })
      }).then(r => r.json())
        .then(data => {
          if (data && data.url) window.location = data.url;
          else alert('Checkout error. Please try again.');
        })
        .catch(() => alert('Network error. Please try again.'));
      return;
    }

    // Inside rows
    const row = e.target.closest('.cart-row');
    if (!row) return;

    const items2 = load();
    const bulk = items2.find(i => i.type==='bulk');
    const kit  = items2.find(i => i.type==='kit');

    const act = e.target.getAttribute('data-act');

    if (row.dataset.type === 'bulk') {
      if (!bulk) { render(); return; }

      if (act === 'remove-bulk') {
        save(items2.filter(i => i !== bulk));
        render();
        return;
      }
      if (act === 'minus') {
        bulk.units = clampUnits((bulk.units||LIMIT_MIN) - STEP);
        if (!bulk.units) {
          save(items2.filter(i => i !== bulk));
        } else {
          save(items2);
        }
        render();
        return;
      }
      if (act === 'plus') {
        bulk.units = clampUnits((bulk.units||0) + STEP);
        save(items2);
        render();
        return;
      }
    }

    if (row.dataset.type === 'kit') {
      if (!kit) { render(); return; }

      if (act === 'remove-kit') {
        save(items2.filter(i => i !== kit));
        render();
        return;
      }
      if (act === 'kit-minus') {
        kit.qty = Math.max(1, (kit.qty||1) - 1);
        save(items2);
        render();
        return;
      }
      if (act === 'kit-plus') {
        kit.qty = Math.max(1, (kit.qty||1) + 1);
        save(items2);
        render();
        return;
      }
    }
  });

  // Direct input changes (bulk units / kit qty)
  document.addEventListener('change', (e) => {
    if (!e.target.classList.contains('qty-input')) return;

    const items = load();
    const kind = e.target.getAttribute('data-kind');

    if (kind === 'bulk') {
      let v = clampUnits(parseInt(e.target.value, 10));
      if (!v) v = LIMIT_MIN;
      const bulk = items.find(i => i.type==='bulk') || (items.push({type:'bulk', units:v}), items[items.length-1]);
      bulk.units = v;
      save(items);
      render();
      return;
    }

    if (kind === 'kit') {
      let v = Math.max(1, parseInt(e.target.value, 10) || 1);
      const kit = items.find(i => i.type==='kit') || (items.push({type:'kit', qty:v}), items[items.length-1]);
      kit.qty = v;
      save(items);
      render();
      return;
    }
  });

  // First render (and ensure consolidated model)
  ensureLines();
  render();
})();

