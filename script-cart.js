// /script-cart.js  v43
(() => {
  const TIERS = [
    { min: 5000,   max: 20000,  ppu: 0.072,  requiresAuth: false },
    { min: 20000,  max: 160000, ppu: 0.0675, requiresAuth: true  },
    { min: 160000, max: 960000, ppu: 0.063,  requiresAuth: true  },
  ];
  const KIT_UNIT_CENTS = 3600; // $36.00

  const $items = document.getElementById('cart-items');
  const $empty = document.getElementById('cart-empty');
  const $subtotal = document.getElementById('sum-subtotal');
  const $badge = document.getElementById('cart-count');
  const $btnCheckout = document.getElementById('btn-checkout');
  const $btnClear = document.getElementById('btn-clear');

  // ---------- storage helpers ----------
  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem('fd_cart') || '[]');
    } catch { return []; }
  }
  function saveCart(cart) {
    localStorage.setItem('fd_cart', JSON.stringify(cart));
    updateBadge(cart);
  }
  function updateBadge(cart = loadCart()) {
    const count = cart.reduce((n, it) => {
      if (it.type === 'kit') return n + (Number(it.qty) || 0);
      if (it.type === 'bulk') return n + 1; // bulk counts as one line
      return n;
    }, 0);
    if ($badge) $badge.textContent = count > 0 ? String(count) : '';
  }

  // ---------- pricing ----------
  function ppuForUnits(units) {
    const u = Number(units) || 0;
    return (TIERS.find(t => u >= t.min && u <= t.max)?.ppu) ?? 0;
  }
  function money(n) {
    return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  // ---------- render ----------
  function render() {
    const cart = loadCart();
    updateBadge(cart);

    if (!cart.length) {
      $empty.hidden = false;
      $items.innerHTML = '';
      $subtotal.textContent = '$0.00';
      return;
    }
    $empty.hidden = true;

    let html = '';
    let subtotalCents = 0;

    for (let i = 0; i < cart.length; i++) {
      const it = cart[i];

      if (it.type === 'bulk') {
        // enforce step & bounds
        let units = Number(it.units) || 5000;
        if (units < 5000) units = 5000;
        if (units > 960000) units = 960000;
        // snap to 5k
        units = Math.round(units / 5000) * 5000;

        const ppu = ppuForUnits(units);
        const totalCents = Math.round(units * ppu * 100);
        subtotalCents += totalCents;

        html += `
          <div class="cart-line" data-index="${i}" data-type="bulk">
            <div class="line-left">
              <div class="line-title">Force Dowels — Bulk</div>
              <div class="line-meta">
                <span>Price Tier: ${money(ppu)}/unit</span>
              </div>
            </div>
            <div class="line-qty">
              <button class="qty-minus" type="button" aria-label="decrease">–</button>
              <input class="qty-input" type="number" step="5000" min="5000" max="960000" value="${units}">
              <span class="units">units</span>
              <button class="qty-plus" type="button" aria-label="increase">+</button>
            </div>
            <div class="line-total">${money(totalCents / 100)}</div>
            <button class="line-remove" type="button" aria-label="Remove">✕</button>
          </div>
        `;
      }

      if (it.type === 'kit') {
        const qty = Math.max(0, Number(it.qty) || 0);
        const unitCents = Number(it.unitCents ?? KIT_UNIT_CENTS);
        const lineCents = unitCents * qty;
        subtotalCents += lineCents;

        html += `
          <div class="cart-line" data-index="${i}" data-type="kit">
            <div class="line-left">
              <div class="line-title">Force Dowels Kit — 300 units</div>
              <div class="line-meta"><span>${money(unitCents/100)} each</span></div>
            </div>
            <div class="line-qty">
              <button class="qty-minus" type="button" aria-label="decrease">–</button>
              <input class="qty-input" type="number" step="1" min="0" value="${qty}">
              <button class="qty-plus" type="button" aria-label="increase">+</button>
            </div>
            <div class="line-total">${money(lineCents / 100)}</div>
            <button class="line-remove" type="button" aria-label="Remove">✕</button>
          </div>
        `;
      }
    }

    $items.innerHTML = html;
    $subtotal.textContent = money(subtotalCents / 100);

    bindLineEvents();
  }

  function bindLineEvents() {
    $items.querySelectorAll('.cart-line').forEach(line => {
      const idx = Number(line.dataset.index);
      const type = line.dataset.type;
      const $minus = line.querySelector('.qty-minus');
      const $plus = line.querySelector('.qty-plus');
      const $input = line.querySelector('.qty-input');
      const $remove = line.querySelector('.line-remove');

      if ($minus) $minus.addEventListener('click', () => adjust(idx, type, -1));
      if ($plus)  $plus.addEventListener('click', () => adjust(idx, type, +1));
      if ($input) $input.addEventListener('change', (e) => directSet(idx, type, e.target.value));
      if ($remove) $remove.addEventListener('click', () => removeLine(idx));
    });
  }

  function adjust(index, type, delta) {
    const cart = loadCart();
    const it = cart[index];
    if (!it) return;

    if (type === 'bulk') {
      let units = Number(it.units) || 5000;
      units += (delta * 5000);
      if (units < 5000) units = 5000;
      if (units > 960000) units = 960000;
      it.units = units;
    } else if (type === 'kit') {
      let qty = Number(it.qty) || 0;
      qty += delta;
      if (qty < 0) qty = 0;
      it.qty = qty;
    }

    saveCart(cart);
    render();
  }

  function directSet(index, type, val) {
    const cart = loadCart();
    const it = cart[index];
    if (!it) return;

    if (type === 'bulk') {
      let units = Number(val) || 5000;
      // snap to 5k
      units = Math.round(units / 5000) * 5000;
      if (units < 5000) units = 5000;
      if (units > 960000) units = 960000;
      it.units = units;
    } else if (type === 'kit') {
      let qty = Math.max(0, Number(val) || 0);
      it.qty = qty;
    }

    saveCart(cart);
    render();
  }

  function removeLine(index) {
    const cart = loadCart();
    cart.splice(index, 1);
    saveCart(cart);
    render();
  }

  // ---------- checkout ----------
  async function checkout() {
    try {
      $btnCheckout.disabled = true;

      const cart = loadCart();
      if (!cart.length) {
        alert('Your cart is empty.');
        return;
      }

      // Build payload to match /api/checkout
      let bulkUnits = 0;
      let kitQty = 0;

      cart.forEach(it => {
        if (it.type === 'bulk') bulkUnits += Number(it.units) || 0;
        if (it.type === 'kit') kitQty += Number(it.qty) || 0;
      });

      let bulkCents = 0;
      let bulkUnitPrice = 0;
      if (bulkUnits > 0) {
        bulkUnitPrice = ppuForUnits(bulkUnits);
        bulkCents = Math.round(bulkUnits * bulkUnitPrice * 100);
      }

      const payload = {
        bulk: bulkUnits > 0 ? {
          units: bulkUnits,
          unitPrice: bulkUnitPrice,
          amountCents: bulkCents
        } : null,
        kit: kitQty > 0 ? {
          qty: kitQty,
          unitCents: KIT_UNIT_CENTS,
          amountCents: KIT_UNIT_CENTS * kitQty
        } : null
      };

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        const msg = data?.error || 'A server error has occurred';
        throw new Error(msg);
      }

      window.location = data.url;
    } catch (err) {
      console.error(err);
      alert(`${err.message || err}`);
    } finally {
      $btnCheckout.disabled = false;
    }
  }

  // ---------- clear ----------
  function clearCart() {
    localStorage.removeItem('fd_cart');
    updateBadge([]);
    render();
  }

  // ---------- init ----------
  document.addEventListener('DOMContentLoaded', () => {
    render();
    if ($btnCheckout) $btnCheckout.addEventListener('click', checkout);
    if ($btnClear) $btnClear.addEventListener('click', clearCart);
  });
})();
