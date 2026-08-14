/* MASTER: /public/script-cart.js
   Force Dowels — Cart page logic (precise pricing)
   - localStorage key: 'fd_cart'
   - Items:
       { type: 'bulk', sizeId: '8x38', units: <int> }
       { type: 'kit',  sizeId: '8x38', qty:   <int> }
*/

(function () {
  const catalog = window.FDProducts;
  if (!catalog) {
    console.error('FDProducts catalog missing');
    return;
  }

  const STORAGE_KEY = 'fd_cart';
  const BULK_MIN = catalog.MIN_UNITS;
  const BULK_MAX = catalog.MAX_UNITS;
  const BULK_STEP = catalog.STEP;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const cartBody    = $('#cart-body') || $('#cart-items') || $('#cart-table tbody');
  const subtotalEl  = $('#cart-subtotal') || $('#summary-subtotal') || $('#summaryTotal');
  const badgeEl     = $('#cart-count');

  const btnClear    = $('#btn-clear');
  const btnCons     = $('#btn-consolidate');
  const btnMore     = $('#btn-add-more');
  const btnCheckout = $('#btn-checkout');

  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return arr
        .filter(Boolean)
        .map((it) => {
          if (it.type === 'bulk') {
            let u = Number(it.units || 0);
            if (!Number.isFinite(u) || u <= 0) return null;
            if (u > BULK_MAX) u = BULK_MAX;
            u = Math.round(u / BULK_STEP) * BULK_STEP;
            if (u < BULK_MIN) u = BULK_MIN;
            return { type: 'bulk', sizeId: catalog.normalizeSizeId(it.sizeId), units: u };
          }
          if (it.type === 'kit') {
            let q = Number(it.qty || 0);
            if (!Number.isFinite(q) || q < 1) q = 1;
            return { type: 'kit', sizeId: catalog.normalizeSizeId(it.sizeId), qty: q };
          }
          if (it.type === 'test') {
            return { type: 'test', qty: 1 };
          }
          if ('units' in it) {
            const u = Number(it.units);
            if (u > 0) return { type: 'bulk', sizeId: catalog.DEFAULT_SIZE_ID, units: u };
          }
          if ('qty' in it) {
            const q = Number(it.qty);
            if (q > 0) return { type: 'kit', sizeId: catalog.DEFAULT_SIZE_ID, qty: Math.max(1, q) };
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
      if (it.type === 'bulk') total += it.units;
      else if (it.type === 'kit') total += it.qty * catalog.kitUnits(it.sizeId);
      else if (it.type === 'test') total += 1;
    }
    badgeEl.textContent = total > 0 ? total.toLocaleString() : '';
    badgeEl.style.display = total > 0 ? 'inline-block' : 'none';
  }

  const fmtMoney = (n) =>
    (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  const fmtUnit = (d) =>
    (Number(d) || 0).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  function lineTotalCentsForBulk(sizeId, units) {
    return catalog.bulkTotalCents(sizeId, units);
  }

  function computeSubtotal(items) {
    let cents = 0;
    for (const it of items) {
      if (it.type === 'bulk') {
        cents += lineTotalCentsForBulk(it.sizeId, it.units);
      } else if (it.type === 'kit') {
        cents += Math.round(catalog.kitPriceUSD(it.sizeId) * 100) * it.qty;
      } else if (it.type === 'test') {
        cents += 100;
      }
    }
    return cents / 100;
  }

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
          const unit = catalog.unitPriceUSD(it.sizeId, it.units);
          const lineTotal = lineTotalCentsForBulk(it.sizeId, it.units) / 100;
          const label = catalog.sizeLabel(it.sizeId);

          tr.innerHTML = `
            <td class="col-item">
              <div class="item-title"><strong>Force Dowels — ${label} Bulk</strong></div>
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
              <div class="col-total-inner">
                <span class="line-total">${fmtMoney(lineTotal)}</span>
                <button class="btn-remove" type="button" aria-label="Remove item">Remove</button>
              </div>
            </td>
          `;
        } else if (it.type === 'kit') {
          const kitPrice = catalog.kitPriceUSD(it.sizeId);
          const kitCount = catalog.kitUnits(it.sizeId);
          const lineTotal = kitPrice * it.qty;
          const label = catalog.sizeLabel(it.sizeId);
          tr.innerHTML = `
            <td class="col-item">
              <div class="item-title"><strong>Force Dowels — ${label} Kit (${kitCount})</strong></div>
              <div class="muted">${kitCount} units per kit</div>
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
              <span class="unit-price">$${kitPrice.toFixed(4)}</span>
            </td>

            <td class="col-total">
              <div class="col-total-inner">
                <span class="line-total">${fmtMoney(lineTotal)}</span>
                <button class="btn-remove" type="button" aria-label="Remove item">Remove</button>
              </div>
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
              <div class="col-total-inner">
                <span class="line-total">${fmtMoney(1.0)}</span>
                <button class="btn-remove" type="button" aria-label="Remove item">Remove</button>
              </div>
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
      const bulkBySize = {};
      const kitsBySize = {};
      let tests = 0;
      for (const it of items) {
        if (it.type === 'bulk') {
          const sizeId = catalog.normalizeSizeId(it.sizeId);
          bulkBySize[sizeId] = (bulkBySize[sizeId] || 0) + Number(it.units || 0);
        } else if (it.type === 'kit') {
          const sizeId = catalog.normalizeSizeId(it.sizeId);
          kitsBySize[sizeId] = (kitsBySize[sizeId] || 0) + Number(it.qty || 0);
        } else if (it.type === 'test') {
          tests = 1;
        }
      }
      const merged = [];
      for (const sizeId of Object.keys(bulkBySize)) {
        let u = Math.min(BULK_MAX, Math.max(BULK_MIN, Math.round(bulkBySize[sizeId] / BULK_STEP) * BULK_STEP));
        merged.push({ type: 'bulk', sizeId, units: u });
      }
      for (const sizeId of Object.keys(kitsBySize)) {
        merged.push({ type: 'kit', sizeId, qty: kitsBySize[sizeId] });
      }
      if (tests) merged.push({ type: 'test', qty: 1 });
      saveCart(merged);
      render();
    });
  }

  if (btnMore) {
    btnMore.addEventListener('click', () => { window.location.href = '/order.html'; });
  }

  if (btnCheckout) {
    btnCheckout.addEventListener('click', () => {
      window.location.href = '/checkout.html';
    });
  }

  render();
})();
