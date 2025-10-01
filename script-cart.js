/* MASTER: /public/script-cart.js
   Force Dowels — Cart page logic
   - localStorage key: 'fd_cart'
   - Supports items:
       { type: 'bulk',  units: <int> }
       { type: 'kit',   qty:   <int> }  // Starter Kit (300)
*/

(function () {
  // ---------- Config ----------
  const STORAGE_KEY = 'fd_cart';

  // Bulk constants
  const BULK_MIN = 5000;
  const BULK_MAX = 960000;
  const BULK_STEP = 5000;

  // Pricing (server uses the same)
  function unitPriceCentsFor(units) {
    if (units >= 160000) return Math.round(0.063 * 100);   // $0.0630
    if (units >= 20000)  return Math.round(0.0675 * 100);  // $0.0675
    return Math.round(0.072 * 100);                        // $0.0720
  }

  // ---------- DOM helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const cartBody     = $('#cart-body') || $('#cart-items') || $('#cart-table tbody');
  const subtotalEl   = $('#summary-subtotal') || $('#cart-subtotal') || $('#summary .subtotal') || $('#summaryTotal');
  const btnClear     = $('#btn-clear');
  const btnCons      = $('#btn-consolidate');
  const btnMore      = $('#btn-add-more');
  const btnCheckout  = $('#btn-checkout') || $('.btn-checkout') || $('[data-checkout]');
  const badgeEl      = $('#cart-count');

  // ---------- Storage ----------
  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      // Sanity / normalize
      return arr
        .filter(Boolean)
        .map((it) => {
          if (it.type === 'bulk') {
            let u = Number(it.units || 0);
            if (!Number.isFinite(u) || u < BULK_MIN) u = BULK_MIN;
            if (u > BULK_MAX) u = BULK_MAX;
            // snap to step
            u = Math.round(u / BULK_STEP) * BULK_STEP;
            if (u < BULK_MIN) u = BULK_MIN;
            return { type: 'bulk', units: u };
          }
          if (it.type === 'kit') {
            let q = Number(it.qty || 0);
            if (!Number.isFinite(q) || q < 1) q = 1;
            return { type: 'kit', qty: q };
          }
          // lenient: support older schemas
          if ('units' in it) return { type: 'bulk', units: Number(it.units) || BULK_MIN };
          if ('qty' in it)   return { type: 'kit', qty: Math.max(1, Number(it.qty) || 1) };
          return null;
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateBadge(items);
  }

  function updateBadge(items) {
    if (!badgeEl) return;
    // Show total units + kits as a simple count (units for bulk + kits for kit)
    let total = 0;
    for (const it of items) {
      if (it.type === 'bulk') total += it.units;
      else if (it.type === 'kit') total += it.qty;
    }
    badgeEl.textContent = total > 0 ? String(total) : '';
    badgeEl.style.display = total > 0 ? 'inline-block' : 'none';
  }

  // ---------- Money ----------
  const fmtMoney = (n) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  // ---------- Totals ----------
  function computeSubtotal(items) {
    let cents = 0;
    for (const it of items) {
      if (it.type === 'bulk') {
        const unitCents = unitPriceCentsFor(it.units);
        cents += unitCents * it.units;
      } else if (it.type === 'kit') {
        cents += 3600 * it.qty; // $36.00 per kit
      }
    }
    return cents / 100;
  }

  // ---------- Render ----------
  function render() {
    const items = loadCart();

    // Empty state
    if (!items.length) {
      if (cartBody) {
        cartBody.innerHTML = `
          <tr><td colspan="4" class="muted" style="padding:20px 0;">Your cart is empty.</td></tr>
        `;
      }
      if (subtotalEl) subtotalEl.textContent = fmtMoney(0);
      updateBadge(items);
      return;
    }

    if (!cartBody) {
      // No container: still update totals/badge
      if (subtotalEl) subtotalEl.textContent = fmtMoney(computeSubtotal(items));
      updateBadge(items);
      return;
    }

    // Build rows
    cartBody.innerHTML = '';
    items.forEach((it, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.index = String(idx);

      if (it.type === 'bulk') {
        const unitCents = unitPriceCentsFor(it.units);
        const lineTotal = (unitCents * it.units) / 100;

        tr.innerHTML = `
          <td class="col-item">
            <div class="item-title"><strong>Force Dowels — Bulk</strong></div>
            <div class="muted">Tiered pricing applies automatically</div>
          </td>

          <td class="col-qty">
            <div class="qtywrap">
              <button class="step btn-dec" type="button" aria-label="decrease">–</button>
              <input class="qty-input" type="number" inputmode="numeric"
                     min="${BULK_MIN}" max="${BULK_MAX}" step="${BULK_STEP}"
                     value="${it.units}">
              <button class="step btn-inc" type="button" aria-label="increase">+</button>
              <span class="units-label">units</span>
            </div>
          </td>

          <td class="col-unitprice">
            <span class="unit-price">${fmtMoney(unitCents / 100)}</span>
          </td>

          <td class="col-total">
            <span class="line-total">${fmtMoney(lineTotal)}</span>
            <button class="btn-remove" type="button" aria-label="Remove item">Remove</button>
          </td>
        `;
      } else if (it.type === 'kit') {
        const lineTotal = 36.0 * it.qty;

        tr.innerHTML = `
          <td class="col-item">
            <div class="item-title"><strong>Force Dowels — Starter Kit (300)</strong></div>
            <div class="muted">300 units per kit</div>
          </td>

          <td class="col-qty">
            <div class="qtywrap">
              <button class="step btn-dec" type="button" aria-label="decrease">–</button>
              <input class="qty-input" type="number" inputmode="numeric"
                     min="1" step="1" value="${it.qty}">
              <button class="step btn-inc" type="button" aria-label="increase">+</button>
              <span class="units-label">kits</span>
            </div>
          </td>

          <td class="col-unitprice">
            <span class="unit-price">$36.00</span>
          </td>

          <td class="col-total">
            <span class="line-total">${fmtMoney(lineTotal)}</span>
            <button class="btn-remove" type="button" aria-label="Remove item">Remove</button>
          </td>
        `;
      }

      cartBody.appendChild(tr);
    });

    // Bind row events (increment/decrement/input/remove)
    bindRowEvents();

    // Update summary
    if (subtotalEl) subtotalEl.textContent = fmtMoney(computeSubtotal(items));
    updateBadge(items);
  }

  function bindRowEvents() {
    $$('.btn-dec', cartBody).forEach((btn) =>
      btn.addEventListener('click', onStep.bind(null, -1))
    );
    $$('.btn-inc', cartBody).forEach((btn) =>
      btn.addEventListener('click', onStep.bind(null, +1))
    );
    $$('.qty-input', cartBody).forEach((inp) =>
      inp.addEventListener('change', onManualChange)
    );
    $$('.btn-remove', cartBody).forEach((btn) =>
      btn.addEventListener('click', onRemove)
    );
  }

  function onStep(delta, ev) {
    const tr = ev.currentTarget.closest('tr');
    if (!tr) return;
    const idx = Number(tr.dataset.index);
    const items = loadCart();
    const item = items[idx];
    if (!item) return;

    if (item.type === 'bulk') {
      let next = (item.units || BULK_MIN) + delta * BULK_STEP;
      if (next < BULK_MIN) next = BULK_MIN;
      if (next > BULK_MAX) next = BULK_MAX;
      item.units = next;
    } else if (item.type === 'kit') {
      let next = (item.qty || 1) + delta * 1;
      if (next < 1) next = 1;
      item.qty = next;
    }

    saveCart(items);
    render();
  }

  function onManualChange(ev) {
    const tr = ev.currentTarget.closest('tr');
    if (!tr) return;
    const idx = Number(tr.dataset.index);
    const items = loadCart();
    const item = items[idx];
    if (!item) return;

    let v = Number(ev.currentTarget.value || 0);

    if (item.type === 'bulk') {
      if (!Number.isFinite(v)) v = BULK_MIN;
      // snap to step
      v = Math.round(v / BULK_STEP) * BULK_STEP;
      if (v < BULK_MIN) v = BULK_MIN;
      if (v > BULK_MAX) v = BULK_MAX;
      item.units = v;
    } else if (item.type === 'kit') {
      if (!Number.isFinite(v) || v < 1) v = 1;
      item.qty = v;
    }

    saveCart(items);
    render();
  }

  function onRemove(ev) {
    const tr = ev.currentTarget.closest('tr');
    if (!tr) return;
    const idx = Number(tr.dataset.index);
    const items = loadCart();
    items.splice(idx, 1);
    saveCart(items);
    render();
  }

  // ---------- Toolbar buttons ----------
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (!confirm('Clear your cart?')) return;
      saveCart([]);
      render();
    });
  }

  if (btnCons) {
    btnCons.addEventListener('click', () => {
      const items = loadCart();
      let bulkUnits = 0;
      let kits = 0;

      for (const it of items) {
        if (it.type === 'bulk') bulkUnits += Number(it.units || 0);
        else if (it.type === 'kit') kits += Number(it.qty || 0);
      }

      const merged = [];
      if (bulkUnits > 0) {
        // snap consolidated to step, bounded
        let u = Math.min(BULK_MAX, Math.max(BULK_MIN, Math.round(bulkUnits / BULK_STEP) * BULK_STEP));
        merged.push({ type: 'bulk', units: u });
      }
      if (kits > 0) merged.push({ type: 'kit', qty: kits });

      saveCart(merged);
      render();
    });
  }

  if (btnMore) {
    btnMore.addEventListener('click', () => {
      window.location.href = '/order.html';
    });
  }

  // ---------- Checkout (robust) ----------
  if (btnCheckout) {
    btnCheckout.addEventListener('click', async () => {
      try {
        btnCheckout.disabled = true;
        const prev = btnCheckout.textContent;
        btnCheckout.textContent = 'Loading…';

        const items = loadCart();
        if (items.length === 0) {
          alert('Your cart is empty.');
          btnCheckout.disabled = false;
          btnCheckout.textContent = prev;
          return;
        }

        const res = await fetchWithTimeout('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }), // email can be added if you collect it here
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('Checkout failed', err);
          alert('A server error occurred creating your checkout. Please try again.');
          return;
        }

        const data = await res.json();
        if (!data?.url) {
          console.error('No session url', data);
          alert('Could not start checkout. Please try again.');
          return;
        }

        window.location.assign(data.url);
      } catch (e) {
        console.error(e);
        if (e.name === 'AbortError') {
          alert('Network timeout creating checkout. Please try again.');
        } else {
          alert('Network error creating checkout. Please try again.');
        }
      } finally {
        btnCheckout.disabled = false;
      }
    });
  }

  async function fetchWithTimeout(url, opts = {}, ms = 15000) {
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), ms);
    try {
      return await fetch(url, { ...opts, signal: ctl.signal });
    } finally {
      clearTimeout(id);
    }
  }

  // ---------- Init ----------
  render();
})();
