/* MASTER v2: /public/script-cart.js
   Force Dowels — Cart page logic + Shipping quotes
   Storage keys:
     - 'fd_cart'       : [{type:'bulk',units:<int>} | {type:'kit',qty:<int>}]
     - 'fd_dest'       : {country:'US'|'CA'|'MX', state:'', city:'', postal:''}
     - 'fd_ship_quote' : {carrier, service, amount, currency, meta?}
*/

(function () {
  // ---------- Config ----------
  const STORAGE_KEY_CART = 'fd_cart';
  const STORAGE_KEY_DEST = 'fd_dest';
  const STORAGE_KEY_RATE = 'fd_ship_quote';

  // Bulk constraints
  const BULK_MIN  = 5000;
  const BULK_MAX  = 960000;
  const BULK_STEP = 5000;

  // Pricing tiers (MUST match server & order page)
  // Return integer cents for exact math
  function unitPriceCentsFor(units) {
    if (units >= 160000) return Math.round(0.063 * 100);   // $0.0630
    if (units >= 20000)  return Math.round(0.0675 * 100);  // $0.0675
    return Math.round(0.072 * 100);                        // $0.0720
  }

  // ---------- DOM helpers ----------
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // Main cart table
  const cartBody    = $('#cart-body') || $('#cart-items') || $('#cart-table tbody');
  const subtotalEl  = $('#summary-subtotal') || $('#cart-subtotal') || $('#summary .subtotal') || $('#summaryTotal');
  const badgeEl     = $('#cart-count');

  // Toolbar / actions
  const btnClear    = $('#btn-clear');
  const btnCons     = $('#btn-consolidate');
  const btnMore     = $('#btn-add-more');
  const btnCheckout = $('#btn-checkout');

  // Shipping summary chunk
  const btnChangeDest = $('#btn-change-dest');   // optional; opens mini prompt
  const btnGetRates   = $('#btn-get-rates');
  const ratesList     = $('#rates-list');        // <ul>
  const shipTotalEl   = $('#summary-shipping');  // $0.00 | $xx.xx
  const grandTotalEl  = $('#summary-grand');     // subtotal + shipping

  // Destination labels (for “Ship to …” display)
  const destCountryEl = $('#dest-country');
  const destStateEl   = $('#dest-state');
  const destCityEl    = $('#dest-city');
  const destPostalEl  = $('#dest-postal');

  // Optional live destination inputs (if present in your HTML)
  const fldCountry = $('#ship-country');
  const fldState   = $('#ship-state');
  const fldCity    = $('#ship-city');
  const fldPostal  = $('#ship-postal');

  // ---------- Money ----------
  const fmtMoney = (n) =>
    (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  // ---------- Storage: cart ----------
  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CART);
      const arr = raw ? JSON.parse(raw) : [];
      return arr
        .filter(Boolean)
        .map((it) => {
          if (it.type === 'bulk') {
            let u = Number(it.units || 0);
            if (!Number.isFinite(u) || u < BULK_MIN) u = BULK_MIN;
            if (u > BULK_MAX) u = BULK_MAX;
            u = Math.round(u / BULK_STEP) * BULK_STEP;  // snap
            if (u < BULK_MIN) u = BULK_MIN;
            return { type: 'bulk', units: u };
          }
          if (it.type === 'kit') {
            let q = Number(it.qty || 0);
            if (!Number.isFinite(q) || q < 1) q = 1;
            return { type: 'kit', qty: q };
          }
          // legacy leniency
          if ('units' in it) return { type: 'bulk', units: Number(it.units) || BULK_MIN };
          if ('qty'   in it) return { type: 'kit',  qty:   Math.max(1, Number(it.qty) || 1) };
          return null;
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(items));
    updateBadge(items);
  }

  function updateBadge(items) {
    if (!badgeEl) return;
    let total = 0;
    for (const it of items) {
      if (it.type === 'bulk') total += it.units; // design choice: show units
      else if (it.type === 'kit') total += it.qty;
    }
    badgeEl.textContent = total > 0 ? String(total) : '';
    badgeEl.style.display = total > 0 ? 'inline-block' : 'none';
  }

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

  // ---------- Render cart ----------
  function render() {
    const items = loadCart();

    // Empty state
    if (!items.length) {
      if (cartBody) {
        cartBody.innerHTML = `<tr><td colspan="4" class="muted" style="padding:20px 0;">Your cart is empty.</td></tr>`;
      }
      if (subtotalEl)   subtotalEl.textContent  = fmtMoney(0);
      if (shipTotalEl)  shipTotalEl.textContent = fmtMoney(0);
      if (grandTotalEl) grandTotalEl.textContent = fmtMoney(0);
      clearRatesUI();
      updateBadge(items);
      return;
    }

    // Build rows
    if (cartBody) {
      cartBody.innerHTML = '';
      items.forEach((it, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.index = String(idx);

        if (it.type === 'bulk') {
          const unitCents  = unitPriceCentsFor(it.units);  // exact math for totals
          const uiRate     = (it.units >= 160000 ? 0.0630 : (it.units >= 20000 ? 0.0675 : 0.0720)); // for display
          const lineTotal  = (unitCents * it.units) / 100;

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
              <span class="unit-price">$${uiRate.toFixed(4)}/unit</span>
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

      bindRowEvents();
    }

    // Update totals
    const subtotal = computeSubtotal(items);
    if (subtotalEl) subtotalEl.textContent = fmtMoney(subtotal);

    // Keep grand total in sync with any selected rate
    const chosen = getStoredRate();
    if (shipTotalEl)  shipTotalEl.textContent  = fmtMoney(chosen?.amount || 0);
    if (grandTotalEl) grandTotalEl.textContent = fmtMoney((chosen?.amount || 0) + subtotal);

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
    // Cart change invalidates shipping rate (size/weight)
    clearStoredRate();
    clearRatesUI();
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
    clearStoredRate();
    clearRatesUI();
    render();
  }

  function onRemove(ev) {
    const tr = ev.currentTarget.closest('tr');
    if (!tr) return;
    const idx = Number(tr.dataset.index);
    const items = loadCart();
    items.splice(idx, 1);
    saveCart(items);
    clearStoredRate();
    clearRatesUI();
    render();
  }

  // ---------- Toolbar ----------
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (!confirm('Clear your cart?')) return;
      saveCart([]);
      clearStoredRate();
      clearRatesUI();
      render();
    });
  }

  if (btnCons) {
    btnCons.addEventListener('click', () => {
      const items = loadCart();
      let bulkUnits = 0, kits = 0;
      for (const it of items) {
        if (it.type === 'bulk') bulkUnits += Number(it.units || 0);
        if (it.type === 'kit')  kits += Number(it.qty || 0);
      }
      const merged = [];
      if (bulkUnits > 0) {
        let u = Math.min(BULK_MAX, Math.max(BULK_MIN, Math.round(bulkUnits / BULK_STEP) * BULK_STEP));
        merged.push({ type:'bulk', units:u });
      }
      if (kits > 0) merged.push({ type:'kit', qty:kits });
      saveCart(merged);
      clearStoredRate();
      clearRatesUI();
      render();
    });
  }

  if (btnMore) {
    btnMore.addEventListener('click', () => { window.location.href = '/order.html'; });
  }

  // ---------- Destination storage + UI ----------
  function getStoredDest() {
    try { const raw = localStorage.getItem(STORAGE_KEY_DEST); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }
  function setStoredDest(dest) {
    localStorage.setItem(STORAGE_KEY_DEST, JSON.stringify(dest));
    renderDestLabels(dest);
  }
  function renderDestLabels(dest) {
    if (!dest) dest = getStoredDest() || {};
    if (destCountryEl) destCountryEl.textContent = dest.country || '—';
    if (destStateEl)   destStateEl.textContent   = dest.state   || '—';
    if (destCityEl)    destCityEl.textContent    = dest.city    || '—';
    if (destPostalEl)  destPostalEl.textContent  = dest.postal  || '—';
  }

  // Support prompt-based destination (fallback)
  function promptDestination() {
    const current = getStoredDest() || { country:'US', state:'', city:'', postal:'' };
    const country = (prompt('Ship to country (US, CA, MX):', current.country || 'US') || '').toUpperCase();
    if (!country) return null;
    const state   = prompt('State/Province (e.g., AZ):', current.state || '') || '';
    const city    = prompt('City:', current.city || '') || '';
    const postal  = prompt('Postal/ZIP:', current.postal || '') || '';
    const dest = { country, state, city, postal };
    setStoredDest(dest);
    return dest;
  }

  if (btnChangeDest) {
    btnChangeDest.addEventListener('click', () => {
      const dest = promptDestination();
      if (dest) {
        clearStoredRate();
        clearRatesUI();
        render();
      }
    });
  }

  // Live destination fields (if present)
  function readDestFromForm() {
    const country = fldCountry?.value?.trim().toUpperCase() || undefined;
    const state   = fldState?.value?.trim() || undefined;
    const city    = fldCity?.value?.trim() || undefined;
    const postal  = fldPostal?.value?.trim() || undefined;
    if (!country && !state && !city && !postal) return null;
    return { country, state, city, postal };
  }
  function wireDestForm() {
    if (!fldCountry && !fldState && !fldCity && !fldPostal) return;
    const sync = () => {
      const dest = readDestFromForm();
      if (!dest) return;
      setStoredDest(dest);
      clearStoredRate();
      clearRatesUI();
      render(); // recompute grand with 0 shipping
    };
    [fldCountry, fldState, fldCity, fldPostal].forEach((el) => el && el.addEventListener('change', sync));
  }

  // ---------- Shipping quotes ----------
  function getStoredRate() {
    try { const raw = localStorage.getItem(STORAGE_KEY_RATE); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }
  function setStoredRate(rate) { localStorage.setItem(STORAGE_KEY_RATE, JSON.stringify(rate || null)); }
  function clearStoredRate()    { localStorage.removeItem(STORAGE_KEY_RATE); }

  function clearRatesUI() {
    if (ratesList) ratesList.innerHTML = '';
    if (shipTotalEl) shipTotalEl.textContent = fmtMoney(0);
    if (grandTotalEl) grandTotalEl.textContent = fmtMoney(computeSubtotal(loadCart()));
  }

  function onSelectRate(rate) {
    setStoredRate(rate);
    if (shipTotalEl)  shipTotalEl.textContent = fmtMoney(rate.amount || 0);
    if (grandTotalEl) grandTotalEl.textContent = fmtMoney((rate.amount || 0) + computeSubtotal(loadCart()));
  }

  async function fetchWithTimeout(url, opts = {}, ms = 15000) {
    const ctl = new AbortController();
    const id  = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctl.signal }); }
    finally { clearTimeout(id); }
  }

  async function requestRates() {
    let dest = getStoredDest();
    if (!dest || !dest.country || !dest.postal) {
      // try reading from form first, then prompt
      dest = readDestFromForm() || promptDestination();
      if (!dest) return;
    }

    const items = loadCart();
    if (!items.length) { alert('Your cart is empty.'); return; }

    if (btnGetRates) {
      btnGetRates.disabled = true;
      const prev = btnGetRates.textContent;
      btnGetRates.textContent = 'Getting rates…';
      try {
        const res = await fetchWithTimeout('/api/shipping/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination: dest, items }),
        }, 20000);

        if (!res.ok) {
          console.error('Quote error', await res.text());
          alert('Could not get shipping rates. Please try again.');
          return;
        }

        const data = await res.json();
        renderRates(data?.rates || []);
      } catch (e) {
        console.error(e);
        alert(e.name === 'AbortError' ? 'Timed out getting rates. Try again.' : 'Network error getting rates.');
      } finally {
        btnGetRates.disabled = false;
        btnGetRates.textContent = prev;
      }
    }
  }

  function renderRates(rates) {
    if (!ratesList) return;

    ratesList.innerHTML = '';
    if (!rates || rates.length === 0) {
      ratesList.innerHTML = `<li class="muted">No rates available for this destination.</li>`;
      setStoredRate(null);
      onSelectRate({ amount: 0 });
      return;
    }

    rates.forEach((r, i) => {
      const id = `rate-${i}`;
      const li = document.createElement('li');
      li.className = 'rate-row';
      li.innerHTML = `
        <label class="rate-option">
          <input type="radio" name="shiprate" id="${id}" ${i === 0 ? 'checked' : ''}>
          <span class="rate-carrier">${r.carrier || 'Carrier'}</span>
          <span class="rate-service">${r.service || ''}</span>
          <span class="rate-price">${fmtMoney(r.amount || 0)}</span>
        </label>
      `;
      ratesList.appendChild(li);

      const radio = li.querySelector('input[type="radio"]');
      radio.addEventListener('change', () => onSelectRate(r));
    });

    // auto-select cheapest (assumes API sorted)
    onSelectRate(rates[0]);
  }

  if (btnGetRates) btnGetRates.addEventListener('click', requestRates);

  // ---------- Checkout ----------
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

        // Optional: require a selected rate before checkout
        const rate = getStoredRate();
        // If you want to force selection, uncomment:
        // if (!rate) { alert('Please select a shipping rate.'); btnCheckout.disabled=false; btnCheckout.textContent=prev; return; }

        const res = await fetchWithTimeout('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            shipping: rate ? { carrier: rate.carrier, service: rate.service, amount: rate.amount, currency: rate.currency || 'USD' } : null,
          }),
        }, 20000);

        if (!res.ok) {
          console.error('Checkout failed', await res.text());
          alert('A server error occurred creating your checkout. Please try again.');
          btnCheckout.disabled = false;
          btnCheckout.textContent = prev;
          return;
        }

        const data = await res.json();
        if (!data?.url) {
          alert('Could not start checkout. Please try again.');
          btnCheckout.disabled = false;
          btnCheckout.textContent = prev;
          return;
        }

        window.location.assign(data.url);
      } catch (e) {
        console.error(e);
        alert('Network error creating checkout. Please try again.');
      }
    });
  }

  // ---------- Init ----------
  wireDestForm();                    // hook up live fields if present
  renderDestLabels(getStoredDest()); // paint current destination text
  render();                          // draw cart + totals
})();
