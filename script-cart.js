/* v48 – Cart page: render, qty edits, subtotal, checkout (Remove btn polished) */
(function () {
  'use strict';

  const FD_CART_KEY = 'fd_cart';
  const STEP = 5000;
  const MIN_QTY = 5000;
  const MAX_QTY = 960000;

  const $ = (sel, root = document) => root.querySelector(sel);

  function pricePerUnit(qty) {
    if (qty >= 160000) return 0.0630;
    if (qty > 20000)   return 0.0675;
    return 0.0720;
  }
  function clampToStep(val) {
    let n = Math.round(Number(val) / STEP) * STEP;
    if (!isFinite(n) || n < MIN_QTY) n = MIN_QTY;
    if (n > MAX_QTY) n = MAX_QTY;
    return n;
  }

  function loadCart() {
    try { const raw = localStorage.getItem(FD_CART_KEY); return raw ? JSON.parse(raw) : []; }
    catch { return []; }
  }
  function saveCart(items) {
    localStorage.setItem(FD_CART_KEY, JSON.stringify(items));
    updateHeaderBadge(items);
  }
  function updateHeaderBadge(items = loadCart()) {
    const units = items.reduce((sum, it) =>
      sum + (it.type === 'bulk' ? (it.qty||0) : (it.qty||0)*300), 0);
    const badge = $('#cart-count'); if (!badge) return;
    badge.textContent = units > 0 ? units.toLocaleString() : '';
  }

  const itemsRoot   = $('#cart-items');
  const subtotalEl  = $('#cart-subtotal');
  const clearBtn    = $('#btn-clear');
  const mergeBtn    = $('#btn-merge');
  const checkoutBtn = $('#btn-checkout');

  function removeBtnHTML(){
    return `
      <button class="remove-btn" type="button" aria-label="Remove item">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor"
          d="M9 3h6a1 1 0 0 1 1 1v1h4v2h-1v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7H4V5h4V4a1 1 0 0 1 1-1Zm1 4v10h2V7h-2Zm4 0v10h2V7h-2Z"/></svg>
        <span>Remove</span>
      </button>`;
  }

  function render() {
    const cart = loadCart();
    updateHeaderBadge(cart);

    if (!cart.length) {
      itemsRoot.innerHTML = `
        <div class="cart-empty">
          <p>Your cart is empty.</p>
          <a class="btn btn--accent" href="/order.html">Start Order</a>
        </div>`;
      subtotalEl.textContent = '$0.00';
      return;
    }

    const rows = cart.map((it, idx) => {
      if (it.type === 'bulk') {
        const qty = Number(it.qty) || 0;
        const ppu = pricePerUnit(qty);
        const line = qty * ppu;
        return `
        <div class="row cart-item" data-index="${idx}" data-type="bulk">
          <div class="col item-col">
            <div class="item-title">Force Dowels — Bulk</div>
            <div class="muted">Tiered pricing applies automatically</div>
          </div>
          <div class="col qty-col">
            <div class="qtywrap">
              <button class="step minus" type="button" aria-label="decrease">–</button>
              <input class="qty-input" type="number" step="${STEP}" min="${MIN_QTY}" max="${MAX_QTY}" value="${qty}">
              <button class="step plus" type="button" aria-label="increase">+</button>
              <span class="units">units</span>
            </div>
          </div>
          <div class="col price-col">$${ppu.toFixed(4)}</div>
          <div class="col total-col">
            <div>$${line.toFixed(2)}</div>
            ${removeBtnHTML()}
          </div>
        </div>`;
      } else {
        const q = Number(it.qty) || 1;
        const unit = Number(it.price || 36);
        const line = unit * q;
        return `
        <div class="row cart-item" data-index="${idx}" data-type="kit">
          <div class="col item-col">
            <div class="item-title">${it.title || 'Force Dowels — Starter Kit (300)'}</div>
            <div class="muted">300 units per kit</div>
          </div>
          <div class="col qty-col">
            <div class="qtywrap">
              <button class="step minus" type="button" aria-label="decrease">–</button>
              <input class="qty-input" type="number" step="1" min="1" value="${q}">
              <button class="step plus" type="button" aria-label="increase">+</button>
              <span class="units">kits</span>
            </div>
          </div>
          <div class="col price-col">$${unit.toFixed(2)}</div>
          <div class="col total-col">
            <div>$${line.toFixed(2)}</div>
            ${removeBtnHTML()}
          </div>
        </div>`;
      }
    }).join('');

    itemsRoot.innerHTML = rows;

    // subtotal
    const subtotal = cart.reduce((sum, it) => {
      if (it.type === 'bulk') return sum + (it.qty || 0) * pricePerUnit(it.qty || 0);
      return sum + (Number(it.price || 36) * (it.qty || 0));
    }, 0);
    subtotalEl.textContent = `$${subtotal.toFixed(2)}`;

    // events
    itemsRoot.querySelectorAll('.cart-item').forEach(row => {
      const i = Number(row.dataset.index);
      const type = row.dataset.type;
      const minus = row.querySelector('.minus');
      const plus  = row.querySelector('.plus');
      const input = row.querySelector('.qty-input');
      const remove = row.querySelector('.remove-btn');

      function apply(newVal) {
        let cart = loadCart();
        if (type === 'bulk') {
          cart[i].qty = clampToStep(newVal);
        } else {
          const v = Math.max(1, Math.round(Number(newVal) || 1));
          cart[i].qty = v;
        }
        saveCart(cart);
        render();
      }

      minus.addEventListener('click', () => {
        if (type === 'bulk') apply((Number(input.value) || MIN_QTY) - STEP);
        else                apply((Number(input.value) || 1) - 1);
      });
      plus.addEventListener('click', () => {
        if (type === 'bulk') apply((Number(input.value) || MIN_QTY) + STEP);
        else                apply((Number(input.value) || 1) + 1);
      });
      input.addEventListener('change', () => apply(input.value));
      remove.addEventListener('click', () => {
        let cart = loadCart();
        cart.splice(i, 1);
        saveCart(cart);
        render();
      });
    });
  }

  clearBtn?.addEventListener('click', () => {
    localStorage.removeItem(FD_CART_KEY);
    render();
  });

  mergeBtn?.addEventListener('click', () => {
    let cart = loadCart();
    const bulkTotal = cart.filter(i => i.type === 'bulk').reduce((s, i) => s + (i.qty || 0), 0);
    const kitTotal  = cart.filter(i => i.type === 'kit' ).reduce((s, i) => s + (i.qty || 0), 0);
    const merged = [];
    if (bulkTotal > 0) merged.push({ type: 'bulk', qty: clampToStep(bulkTotal) });
    if (kitTotal  > 0) merged.push({ type: 'kit', qty: kitTotal, price: 36, title: 'Force Dowels — Starter Kit (300)' });
    saveCart(merged);
    render();
  });

  checkoutBtn?.addEventListener('click', async () => {
    const cart = loadCart(); if (!cart.length) return;
    checkoutBtn.disabled = true;
    const original = checkoutBtn.textContent;
    checkoutBtn.textContent = 'Starting…';
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart })
      });
      if (!res.ok) throw new Error('Checkout failed');
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
      else throw new Error('Missing checkout URL');
    } catch (err) {
      alert('A server error occurred starting checkout. Please try again.');
      console.error(err);
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = original;
    }
  });

  render();
})();
