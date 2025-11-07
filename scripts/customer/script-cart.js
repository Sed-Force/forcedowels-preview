/* MASTER: /public/script-cart.js
   Force Dowels — Cart page logic (precise pricing)
   - localStorage key: 'fd_cart'
   - Items:
       { type: 'bulk', units: <int> }
       { type: 'kit',  qty:   <int> }  // Starter Kit (300)
*/

(function () {
  // ---------- Config ----------
  const STORAGE_KEY = 'fd_cart';

  // Bulk constraints
  const BULK_MIN = 5000;
  const BULK_MAX = 960000;
  const BULK_STEP = 5000;

  // Precise per-unit pricing (dollars)
  function unitPriceFor(units) {
    if (units >= 160000) return 0.0630;   // $0.0630
    if (units >= 20000)  return 0.0675;   // $0.0675
    return 0.0720;                        // $0.0720
  }

  // ---------- DOM helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const cartBody    = $('#cart-body') || $('#cart-items') || $('#cart-table tbody');
  const subtotalEl  = $('#cart-subtotal') || $('#summary-subtotal') || $('#summaryTotal');
  const badgeEl     = $('#cart-count');

  const btnClear    = $('#btn-clear');
  const btnCons     = $('#btn-consolidate');
  const btnMore     = $('#btn-add-more');
  const btnCheckout = $('#btn-checkout');

  // ---------- Storage ----------
  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return arr
        .filter(Boolean)
        .map((it) => {
          if (it.type === 'bulk') {
            let u = Number(it.units || 0);
            // Only process if we have a valid positive number
            if (!Number.isFinite(u) || u <= 0) {
              return null; // Skip invalid items
            }
            // Clamp to valid range
            if (u > BULK_MAX) u = BULK_MAX;
            // Round to nearest step
            u = Math.round(u / BULK_STEP) * BULK_STEP;
            // After rounding, ensure it's still valid
            if (u < BULK_MIN) u = BULK_MIN;
            return { type: 'bulk', units: u };
          }
          if (it.type === 'kit') {
            let q = Number(it.qty || 0);
            if (!Number.isFinite(q) || q < 1) q = 1;
            return { type: 'kit', qty: q };
          }
          if (it.type === 'test') {
            return { type: 'test', qty: 1 };
          }
          // Handle legacy format
          if ('units' in it) {
            const u = Number(it.units);
            if (u > 0) return { type: 'bulk', units: u };
          }
          if ('qty' in it) {
            const q = Number(it.qty);
            if (q > 0) return { type: 'kit', qty: Math.max(1, q) };
          }
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
    let total = 0;
    for (const it of items) {
      if (it.type === 'bulk') total += it.units; // total dowel units
      else if (it.type === 'kit') total += it.qty * 300; // kits have 300 dowels each
      else if (it.type === 'test') total += 1; // test order
    }
    badgeEl.textContent = total > 0 ? total.toLocaleString() : '';
    badgeEl.style.display = total > 0 ? 'inline-block' : 'none';
  }

  // ---------- Money helpers ----------
  const fmtMoney = (n) =>
    (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  const fmtUnit = (d) =>
    (Number(d) || 0).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  // ---------- Totals with precise rounding ----------
  function lineTotalCentsForBulk(units) {
    const price = unitPriceFor(units);           // dollars per unit (e.g. 0.0720)
    return Math.round(units * price * 100);      // round only after multiply → cents
  }

  function computeSubtotal(items) {
    let cents = 0;
    for (const it of items) {
      if (it.type === 'bulk') {
        cents += lineTotalCentsForBulk(it.units);
      } else if (it.type === 'kit') {
        cents += Math.round(36.00 * 100) * it.qty; // $36.00 per kit
      } else if (it.type === 'test') {
        cents += 100; // $1.00 test order
      }
    }
    return cents / 100;
  }

  // ---------- Render ----------
  function render() {
    const items = loadCart();

    if (!items.length) {
      if (cartBody) {
        cartBody.innerHTML = `<tr><td colspan="4" class="muted" style="padding:20px 0;">Your cart is empty.</td></tr>`;
      }
      if (subtotalEl) subtotalEl.textContent = fmtMoney(0);
      updateBadge(items);
      return;
    }

    if (cartBody) {
      cartBody.innerHTML = '';
      items.forEach((it, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.index = String(idx);

        if (it.type === 'bulk') {
          const unit = unitPriceFor(it.units);                                // dollars
          const lineTotal = lineTotalCentsForBulk(it.units) / 100;           // dollars

          tr.innerHTML = `
            <td class="col-item">
              <div class="item-title"><strong>Force Dowels — Bulk</strong></div>
              <div class="muted">Tiered pricing applies automatically</div>
            </td>

            <td class="col-qty">
              <div class="qtywrap">
                <button class="step btn-dec" type="button" aria-label="decrease">–</button>
                <input class="qty-input" type="number" inputmode="numeric"
                       min="${BULK_MIN}" max="${BULK_MAX}" step="${BULK_STEP}" value="${it.units}">
                <button class="step btn-inc" type="button" aria-label="increase">+</button>
                <span class="units-label">units</span>
              </div>
            </td>

            <td class="col-unitprice">
              <span class="unit-price">$${fmtUnit(unit)}</span>
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
                <input class="qty-input" type="number" inputmode="numeric" min="1" step="1" value="${it.qty}">
                <button class="step btn-inc" type="button" aria-label="increase">+</button>
                <span class="units-label">kits</span>
              </div>
            </td>

            <td class="col-unitprice">
              <span class="unit-price">$36.0000</span>
            </td>

            <td class="col-total">
              <span class="line-total">${fmtMoney(lineTotal)}</span>
              <button class="btn-remove" type="button" aria-label="Remove item">Remove</button>
            </td>
          `;
        } else if (it.type === 'test') {
          tr.innerHTML = `
            <td class="col-item">
              <div class="item-title"><strong>🧪 Webhook Test Order</strong></div>
              <div class="muted">Test order for webhook verification</div>
            </td>

            <td class="col-qty">
              <div class="qtywrap">
                <span style="padding: 0 12px;">1</span>
                <span class="units-label">test</span>
              </div>
            </td>

            <td class="col-unitprice">
              <span class="unit-price">$1.0000</span>
            </td>

            <td class="col-total">
              <span class="line-total">${fmtMoney(1.0)}</span>
              <button class="btn-remove" type="button" aria-label="Remove item">Remove</button>
            </td>
          `;
        }

        cartBody.appendChild(tr);
      });

      bindRowEvents();
    }

    if (subtotalEl) subtotalEl.textContent = fmtMoney(computeSubtotal(items));
    updateBadge(items);
  }

  function bindRowEvents() {
    $$('.btn-dec', cartBody).forEach((btn) => btn.addEventListener('click', onStep.bind(null, -1)));
    $$('.btn-inc', cartBody).forEach((btn) => btn.addEventListener('click', onStep.bind(null, +1)));
    $$('.qty-input', cartBody).forEach((inp) => inp.addEventListener('change', onManualChange));
    $$('.btn-remove', cartBody).forEach((btn) => btn.addEventListener('click', onRemove));
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
      let next = (item.qty || 1) + delta;
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

  // ---------- Toolbar ----------
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
      let bulkUnits = 0, kits = 0;
      for (const it of items) {
        if (it.type === 'bulk') bulkUnits += Number(it.units || 0);
        if (it.type === 'kit')  kits      += Number(it.qty || 0);
      }
      const merged = [];
      if (bulkUnits > 0) {
        let u = Math.min(BULK_MAX, Math.max(BULK_MIN, Math.round(bulkUnits / BULK_STEP) * BULK_STEP));
        merged.push({ type:'bulk', units:u });
      }
      if (kits > 0) merged.push({ type:'kit', qty:kits });
      saveCart(merged);
      render();
    });
  }

  if (btnMore) {
    btnMore.addEventListener('click', () => { window.location.href = '/order.html'; });
  }

  // On the cart page we now send users to the dedicated checkout page
  if (btnCheckout) {
    btnCheckout.addEventListener('click', () => {
      window.location.href = '/checkout.html';
    });
  }

  // ---------- Init ----------
  render();
})();
