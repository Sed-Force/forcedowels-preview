// /script-cart.js (master)
// Renders cart, enforces tier pricing on BULK, handles qty changes and checkout.

(() => {
  const CART_KEY = 'fd_cart';
  const $ = (s, c=document) => c.querySelector(s);
  const $$ = (s, c=document) => Array.from(c.querySelectorAll(s));
  const money = (n) => (n ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

  const TIERS = [
    { min: 5000,   max: 20000,  ppu: 0.072  },
    { min: 20000,  max: 160000, ppu: 0.0675 },
    { min: 160000, max: 960000, ppu: 0.063  },
  ];

  const clampUnits = (u) => Math.max(5000, Math.min(960000, Math.round(u/5000)*5000));
  const ppuForUnits = (u) => {
    for (const t of TIERS) if (u >= t.min && u <= t.max) return t.ppu;
    return TIERS[TIERS.length-1].ppu;
  };

  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch { return []; }
  }
  function setCart(arr) {
    localStorage.setItem(CART_KEY, JSON.stringify(arr));
    updateBadge();
  }
  function updateBadge() {
    const badge = $('#cart-count');
    if (!badge) return;
    const items = getCart();
    let count = 0;
    for (const it of items) {
      if (it.type === 'bulk') count += Math.max(1, Math.round((it.units || 0) / 5000));
      if (it.type === 'kit') count += it.qty || 0;
    }
    badge.textContent = count ? String(count) : '';
  }

  function mergeBulk(cart) {
    const bulkItems = cart.filter(i => i.type === 'bulk');
    if (bulkItems.length <= 1) return cart;
    const totalUnits = bulkItems.reduce((s, i) => s + (i.units || 0), 0);
    const others = cart.filter(i => i.type !== 'bulk');
    return [...others, { type: 'bulk', sku:'force-bulk', units: totalUnits }];
  }

  function recalcAndRender() {
    let cart = mergeBulk(getCart());
    const body = $('#cart-body');
    const empty = $('#cart-empty');
    const summary = $('#cart-summary');
    const subtotalEl = $('#cart-subtotal');
    const errorEl = $('#cart-error');

    body.innerHTML = '';
    errorEl.hidden = true;

    if (!cart.length) {
      empty.hidden = false;
      summary.hidden = true;
      setCart([]); // also clears badge
      return;
    }
    empty.hidden = true;
    summary.hidden = false;

    // Compute tier ppu for bulk (based on total bulk units)
    const bulk = cart.find(i => i.type === 'bulk');
    const bulkUnits = bulk?.units || 0;
    const bulkPpu = bulkUnits ? ppuForUnits(bulkUnits) : 0;

    // Build rows
    let subtotal = 0;

    if (bulk) {
      const lineTotal = bulkUnits * bulkPpu;
      subtotal += lineTotal;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-item">
          <div class="item-title"><strong>Force Dowels — Bulk</strong></div>
          <div class="muted">${bulkUnits.toLocaleString()} units @ ${money(bulkPpu).replace('.00','')}/unit</div>
        </td>
        <td class="td-qty">
          <div class="qtywrap">
            <button class="step step-bulk" data-delta="-5000" type="button" aria-label="decrease">–</button>
            <input class="qty-input qty-bulk" type="number" min="5000" max="960000" step="5000" value="${bulkUnits}">
            <button class="step step-bulk" data-delta="5000" type="button" aria-label="increase">+</button>
          </div>
        </td>
        <td class="td-price">${money(bulkPpu).replace('.00','')}</td>
        <td class="td-total">${money(lineTotal)}</td>
        <td class="td-act"><button class="link danger" id="remove-bulk" type="button">Remove</button></td>
      `;
      body.appendChild(tr);
    }

    cart.filter(i => i.type === 'kit').forEach(kit => {
      const qty = kit.qty || 1;
      const unitPrice = 36.00;
      const lineTotal = qty * unitPrice;
      subtotal += lineTotal;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-item">
          <div class="item-title"><strong>Force Dowels Kit — 300 units</strong></div>
          <div class="muted">SKU ${kit.sku}</div>
        </td>
        <td class="td-qty">
          <div class="qtywrap">
            <button class="step step-kit" data-sku="${kit.sku}" data-delta="-1" type="button" aria-label="decrease">–</button>
            <input class="qty-input qty-kit" data-sku="${kit.sku}" type="number" min="1" step="1" value="${qty}">
            <button class="step step-kit" data-sku="${kit.sku}" data-delta="1" type="button" aria-label="increase">+</button>
          </div>
        </td>
        <td class="td-price">${money(unitPrice)}</td>
        <td class="td-total">${money(lineTotal)}</td>
        <td class="td-act"><button class="link danger remove-kit" data-sku="${kit.sku}" type="button">Remove</button></td>
      `;
      body.appendChild(tr);
    });

    subtotalEl.textContent = money(subtotal);

    // Bind events
    $$('.step-bulk').forEach(btn => {
      btn.addEventListener('click', () => {
        let cartNow = getCart();
        const b = cartNow.find(i => i.type === 'bulk');
        if (!b) return;
        b.units = clampUnits((b.units || 5000) + parseInt(btn.dataset.delta, 10));
        setCart(mergeBulk(cartNow));
        recalcAndRender();
      });
    });
    const bulkInput = $('.qty-bulk');
    bulkInput?.addEventListener('change', () => {
      let cartNow = getCart();
      const b = cartNow.find(i => i.type === 'bulk');
      if (!b) return;
      b.units = clampUnits(parseInt(bulkInput.value, 10));
      setCart(mergeBulk(cartNow));
      recalcAndRender();
    });
    $('#remove-bulk')?.addEventListener('click', () => {
      setCart(getCart().filter(i => i.type !== 'bulk'));
      recalcAndRender();
    });

    $$('.step-kit').forEach(btn => {
      btn.addEventListener('click', () => {
        const sku = btn.dataset.sku;
        let cartNow = getCart();
        const k = cartNow.find(i => i.type === 'kit' && i.sku === sku);
        if (!k) return;
        k.qty = Math.max(1, (k.qty || 1) + parseInt(btn.dataset.delta, 10));
        setCart(cartNow);
        recalcAndRender();
      });
    });
    $$('.qty-kit').forEach(inp => {
      inp.addEventListener('change', () => {
        const sku = inp.dataset.sku;
        let cartNow = getCart();
        const k = cartNow.find(i => i.type === 'kit' && i.sku === sku);
        if (!k) return;
        k.qty = Math.max(1, parseInt(inp.value, 10) || 1);
        setCart(cartNow);
        recalcAndRender();
      });
    });
    $$('.remove-kit').forEach(btn => {
      btn.addEventListener('click', () => {
        const sku = btn.dataset.sku;
        setCart(getCart().filter(i => !(i.type === 'kit' && i.sku === sku)));
        recalcAndRender();
      });
    });

    $('#btn-checkout').onclick = async () => {
      const payload = getCart();
      if (!payload.length) return;
      $('#btn-checkout').disabled = true;
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payload })
        });
        if (!res.ok) throw new Error('Checkout failed');
        const data = await res.json();
        if (data.url) window.location.href = data.url;
        else throw new Error('No URL from server');
      } catch (e) {
        const err = $('#cart-error');
        err.textContent = 'A server error has occurred. Please try again.';
        err.hidden = false;
      } finally {
        $('#btn-checkout').disabled = false;
      }
    };
  }

  // init
  updateBadge();
  recalcAndRender();
})();

