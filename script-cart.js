// /script-cart.js
(function () {
  const CART_KEY = 'fd_cart';
  const MIN = 5000, MAX = 960000, STEP = 5000;

  // SAME TIERS as order page
  function unitPriceFor(units) {
    if (units <= 20000) return 0.072;
    if (units <= 160000) return 0.0675;
    return 0.063;
  }
  const fmtMoney = n => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function readCart() {
    try { const a = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch { return []; }
  }
  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    // update header badge
    try {
      const totalUnits = items.reduce((s, it) => s + (Number(it.units)||0) * (Number(it.qty)||0), 0);
      document.querySelectorAll('#cart-count').forEach(el => {
        el.textContent = totalUnits > 0 ? totalUnits.toLocaleString() : '';
        el.setAttribute('title', totalUnits > 0 ? `${totalUnits.toLocaleString()} dowels` : '');
      });
    } catch {}
  }

  function normalizeUnits(n) {
    n = Number(n) || MIN;
    n = Math.round(n / STEP) * STEP;
    return clamp(n, MIN, MAX);
  }

  function render() {
    const body = document.getElementById('cart-body');
    const wrap = document.getElementById('cart-wrap');
    const empty = document.getElementById('cart-empty');
    const subtotalEl = document.getElementById('cart-subtotal');
    if (!body) return;

    let cart = readCart();

    if (!cart.length) {
      wrap.style.display = 'none';
      empty.style.display = '';
      subtotalEl.textContent = '$0.00';
      body.innerHTML = '';
      return;
    }
    empty.style.display = 'none';
    wrap.style.display = '';

    // Compute totals and rebuild rows
    body.innerHTML = '';
    let subtotal = 0;

    // Figure bulk units total (all bulk merged logically)
    let bulkIdx = cart.findIndex(it => it.sku === 'bulk');
    let kitIdx  = cart.findIndex(it => it.sku === 'FD-KIT-300');

    // BULK row (if present)
    if (bulkIdx >= 0) {
      const bulk = cart[bulkIdx];
      bulk.qty = 1; // always 1 line for bulk
      bulk.units = normalizeUnits(bulk.units);

      const ppu = unitPriceFor(bulk.units);
      const line = bulk.units * ppu;
      subtotal += line;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>Force Dowels — Bulk</strong><div class="muted">Tiered pricing applies automatically</div></td>
        <td class="num">
          <div class="qtywrap">
            <button class="step" data-act="bulk-dec" aria-label="decrease">–</button>
            <input class="bulk-units" type="number" step="${STEP}" min="${MIN}" max="${MAX}" value="${bulk.units}">
            <button class="step" data-act="bulk-inc" aria-label="increase">+</button>
            <span class="units">units</span>
          </div>
        </td>
        <td class="num"><span class="ppu">${ppu.toFixed(4)}</span></td>
        <td class="num"><span class="line">${fmtMoney(line)}</span></td>
        <td class="num"><button class="btn btn--ghost" data-act="remove-bulk">Remove</button></td>
      `;
      body.appendChild(tr);
    }

    // KIT row (if present)
    if (kitIdx >= 0) {
      const kit = cart[kitIdx];
      kit.units = 300;
      kit.qty = Math.max(1, Number(kit.qty) || 1);
      const kitTotal = kit.qty * 36.00; // fixed $36 each
      subtotal += kitTotal;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>Force Dowels — Starter Kit (300)</strong><div class="muted">300 units per kit</div></td>
        <td class="num">
          <div class="qtywrap">
            <button class="step" data-act="kit-dec" aria-label="decrease">–</button>
            <input class="kit-qty" type="number" min="1" step="1" value="${kit.qty}">
            <button class="step" data-act="kit-inc" aria-label="increase">+</button>
            <span class="units">kits</span>
          </div>
        </td>
        <td class="num"><span class="ppu">36.00</span></td>
        <td class="num"><span class="line">${fmtMoney(kitTotal)}</span></td>
        <td class="num"><button class="btn btn--ghost" data-act="remove-kit">Remove</button></td>
      `;
      body.appendChild(tr);
    }

    subtotalEl.textContent = fmtMoney(subtotal);

    // Wire up row controls
    body.querySelectorAll('[data-act="bulk-dec"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cart = readCart();
        const i = cart.findIndex(it => it.sku === 'bulk');
        if (i < 0) return;
        cart[i].units = normalizeUnits((Number(cart[i].units) || MIN) - STEP);
        saveCart(cart); render();
      });
    });
    body.querySelectorAll('[data-act="bulk-inc"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cart = readCart();
        const i = cart.findIndex(it => it.sku === 'bulk');
        if (i < 0) return;
        cart[i].units = normalizeUnits((Number(cart[i].units) || MIN) + STEP);
        saveCart(cart); render();
      });
    });
    body.querySelectorAll('.bulk-units').forEach(inp => {
      inp.addEventListener('change', () => {
        const cart = readCart();
        const i = cart.findIndex(it => it.sku === 'bulk');
        if (i < 0) return;
        cart[i].units = normalizeUnits(inp.value);
        saveCart(cart); render();
      });
    });
    body.querySelectorAll('[data-act="remove-bulk"]').forEach(btn => {
      btn.addEventListener('click', () => {
        let cart = readCart().filter(it => it.sku !== 'bulk');
        saveCart(cart); render();
      });
    });

    body.querySelectorAll('[data-act="kit-dec"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cart = readCart();
        const i = cart.findIndex(it => it.sku === 'FD-KIT-300');
        if (i < 0) return;
        cart[i].qty = Math.max(1, (Number(cart[i].qty) || 1) - 1);
        saveCart(cart); render();
      });
    });
    body.querySelectorAll('[data-act="kit-inc"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cart = readCart();
        const i = cart.findIndex(it => it.sku === 'FD-KIT-300');
        if (i < 0) return;
        cart[i].qty = (Number(cart[i].qty) || 1) + 1;
        saveCart(cart); render();
      });
    });
    body.querySelectorAll('.kit-qty').forEach(inp => {
      inp.addEventListener('change', () => {
        const cart = readCart();
        const i = cart.findIndex(it => it.sku === 'FD-KIT-300');
        if (i < 0) return;
        cart[i].qty = Math.max(1, Math.floor(Number(inp.value) || 1));
        saveCart(cart); render();
      });
    });
    body.querySelectorAll('[data-act="remove-kit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        let cart = readCart().filter(it => it.sku !== 'FD-KIT-300');
        saveCart(cart); render();
      });
    });
  }

  // Checkout
  const btnCheckout = document.getElementById('btn-checkout');
  if (btnCheckout) {
    btnCheckout.addEventListener('click', async () => {
      const items = readCart();
      if (!items.length) return;

      btnCheckout.disabled = true;
      const prev = btnCheckout.textContent;
      btnCheckout.textContent = 'Starting checkout…';

      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ items })
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || 'Checkout failed');
        }
        const data = await res.json();
        if (data && data.url) {
          window.location = data.url;
        } else {
          throw new Error('No checkout URL returned');
        }
      } catch (err) {
        alert('A server error occurred while starting checkout. Please try again.');
        console.error(err);
      } finally {
        btnCheckout.disabled = false;
        btnCheckout.textContent = prev;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', render);
})();

