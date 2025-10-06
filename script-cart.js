/* MASTER: /public/script-cart.js  v48
   - Exact pricing using basis-points (1/10000 of a dollar)
   - Inline destination form -> live shipping
*/

(function () {
  // ---------- Config ----------
  const STORAGE_KEY_CART = 'fd_cart';
  const STORAGE_KEY_DEST = 'fd_dest';
  const STORAGE_KEY_RATE = 'fd_ship_quote';

  // Bulk rules
  const BULK_MIN = 5000;
  const BULK_MAX = 960000;
  const BULK_STEP = 5000;

  // Pricing tiers -> return basis-points (bp), i.e., $ * 10000
  function unitPriceBpFor(units) {
    if (units >= 160000) return Math.round(0.0630 * 10000);  // 630 bp
    if (units >= 20000)  return Math.round(0.0675 * 10000);  // 675 bp
    return Math.round(0.0720 * 10000);                       // 720 bp
  }

  // ---------- DOM ----------
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const cartBody   = $('#cart-body');
  const subtotalEl = $('#cart-subtotal');
  const shipEl     = $('#summary-shipping');
  const grandEl    = $('#summary-grand');
  const badgeEl    = $('#cart-count');

  const btnClear   = $('#btn-clear');
  const btnCons    = $('#btn-consolidate');
  const btnMore    = $('#btn-add-more');
  const btnRates   = $('#btn-get-rates');
  const ratesList  = $('#rates-list');
  const btnCheckout= $('#btn-checkout');

  const fCountry = $('#ship-country');
  const fState   = $('#ship-state');
  const fCity    = $('#ship-city');
  const fPostal  = $('#ship-postal');

  // ---------- Money ----------
  const fmtMoney = (n) =>
    (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  // ---------- Storage: cart ----------
  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CART);
      const arr = raw ? JSON.parse(raw) : [];
      return arr.filter(Boolean).map((it) => {
        if (it.type === 'bulk') {
          let u = Number(it.units || 0);
          if (!Number.isFinite(u) || u < BULK_MIN) u = BULK_MIN;
          if (u > BULK_MAX) u = BULK_MAX;
          u = Math.round(u / BULK_STEP) * BULK_STEP;
          if (u < BULK_MIN) u = BULK_MIN;
          return { type:'bulk', units:u };
        }
        if (it.type === 'kit') {
          let q = Number(it.qty || 0);
          if (!Number.isFinite(q) || q < 1) q = 1;
          return { type:'kit', qty:q };
        }
        return null;
      }).filter(Boolean);
    } catch { return []; }
  }
  function saveCart(items) {
    localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(items));
    updateBadge(items);
  }
  function updateBadge(items) {
    if (!badgeEl) return;
    let total = 0;
    for (const it of items) {
      if (it.type === 'bulk') total += it.units;
      else if (it.type === 'kit') total += it.qty;
    }
    badgeEl.textContent = total > 0 ? String(total) : '';
    badgeEl.style.display = total > 0 ? 'inline-block' : 'none';
  }

  // ---------- Destination ----------
  function getStoredDest() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_DEST) || 'null'); }
    catch { return null; }
  }
  function setStoredDest(d) {
    localStorage.setItem(STORAGE_KEY_DEST, JSON.stringify(d));
  }
  function readDestFromForm() {
    const country = (fCountry?.value || 'US').toUpperCase();
    const state   = (fState?.value || '').trim();
    const city    = (fCity?.value || '').trim();
    const postal  = (fPostal?.value || '').trim();
    return { country, state, city, postal };
  }
  function hydrateFormFromStored() {
    const d = getStoredDest() || { country:'US', state:'', city:'', postal:'' };
    if (fCountry) fCountry.value = d.country || 'US';
    if (fState)   fState.value   = d.state   || '';
    if (fCity)    fCity.value    = d.city    || '';
    if (fPostal)  fPostal.value  = d.postal  || '';
  }

  // ---------- Totals (exact using bp) ----------
  function computeSubtotalDollars(items) {
    let bp = 0; // dollars * 10000
    for (const it of items) {
      if (it.type === 'bulk') {
        const unitBp = unitPriceBpFor(it.units);
        bp += unitBp * it.units;
      } else if (it.type === 'kit') {
        bp += (36.00 * 10000) * it.qty;
      }
    }
    return bp / 10000;
  }

  // ---------- Render ----------
  function render() {
    const items = loadCart();

    if (!items.length) {
      if (cartBody) cartBody.innerHTML = `<tr><td colspan="4" class="muted" style="padding:20px 0;">Your cart is empty.</td></tr>`;
      if (subtotalEl) subtotalEl.textContent = fmtMoney(0);
      if (shipEl)     shipEl.textContent     = fmtMoney(0);
      if (grandEl)    grandEl.textContent    = fmtMoney(0);
      updateBadge(items);
      return;
    }

    // rows
    cartBody.innerHTML = '';
    items.forEach((it, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.index = String(idx);

      if (it.type === 'bulk') {
        const unitBp   = unitPriceBpFor(it.units);
        const line     = (unitBp * it.units) / 10000;

        tr.innerHTML = `
          <td class="col-item">
            <div class="item-title"><strong>Force Dowels — Bulk</strong></div>
            <div class="muted">Tiered pricing applies automatically</div>
          </td>
          <td class="col-qty">
            <div class="qtywrap">
              <button class="step btn-dec" type="button" aria-label="decrease">–</button>
              <input class="qty-input" type="number" inputmode="numeric" min="${BULK_MIN}" max="${BULK_MAX}" step="${BULK_STEP}" value="${it.units}">
              <button class="step btn-inc" type="button" aria-label="increase">+</button>
              <span class="units-label">units</span>
            </div>
          </td>
          <td class="col-unitprice"><span class="unit-price">$${(unitBp/10000).toFixed(4)}</span></td>
          <td class="col-total">
            <span class="line-total">${fmtMoney(line)}</span>
            <button class="btn-remove" type="button" aria-label="Remove item">Remove</button>
          </td>
        `;
      } else {
        const line = 36.00 * it.qty;
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
          <td class="col-unitprice"><span class="unit-price">$36.00</span></td>
          <td class="col-total">
            <span class="line-total">${fmtMoney(line)}</span>
            <button class="btn-remove" type="button" aria-label="Remove item">Remove</button>
          </td>
        `;
      }
      cartBody.appendChild(tr);
    });

    // bind
    $$('.btn-dec', cartBody).forEach((b)=>b.addEventListener('click', onStep.bind(null,-1)));
    $$('.btn-inc', cartBody).forEach((b)=>b.addEventListener('click', onStep.bind(null,+1)));
    $$('.qty-input', cartBody).forEach((i)=>i.addEventListener('change', onManual));
    $$('.btn-remove', cartBody).forEach((b)=>b.addEventListener('click', onRemove));

    if (subtotalEl) subtotalEl.textContent = fmtMoney(computeSubtotalDollars(items));
    // keep shipping / grand aligned with any selected rate
    const rate = getStoredRate();
    if (shipEl)  shipEl.textContent  = fmtMoney(rate?.amount || 0);
    if (grandEl) grandEl.textContent = fmtMoney((rate?.amount || 0) + computeSubtotalDollars(items));

    updateBadge(items);
  }

  function onStep(delta, ev) {
    const tr = ev.currentTarget.closest('tr'); if (!tr) return;
    const idx = Number(tr.dataset.index);
    const items = loadCart();
    const it = items[idx]; if (!it) return;

    if (it.type === 'bulk') {
      let next = (it.units||BULK_MIN) + delta*BULK_STEP;
      if (next < BULK_MIN) next = BULK_MIN;
      if (next > BULK_MAX) next = BULK_MAX;
      it.units = next;
    } else {
      let q = (it.qty||1) + delta;
      if (q < 1) q = 1;
      it.qty = q;
    }
    saveCart(items);
    clearStoredRate(); clearRatesUI();
    render();
  }
  function onManual(ev) {
    const tr = ev.currentTarget.closest('tr'); if (!tr) return;
    const idx = Number(tr.dataset.index);
    const items = loadCart();
    const it = items[idx]; if (!it) return;
    let v = Number(ev.currentTarget.value||0);
    if (it.type === 'bulk') {
      if (!Number.isFinite(v)) v = BULK_MIN;
      v = Math.round(v / BULK_STEP) * BULK_STEP;
      if (v < BULK_MIN) v = BULK_MIN;
      if (v > BULK_MAX) v = BULK_MAX;
      it.units = v;
    } else {
      if (!Number.isFinite(v) || v < 1) v = 1;
      it.qty = v;
    }
    saveCart(items);
    clearStoredRate(); clearRatesUI();
    render();
  }
  function onRemove(ev) {
    const tr = ev.currentTarget.closest('tr'); if (!tr) return;
    const idx = Number(tr.dataset.index);
    const items = loadCart();
    items.splice(idx,1);
    saveCart(items);
    clearStoredRate(); clearRatesUI();
    render();
  }

  // Toolbar
  if (btnClear) btnClear.addEventListener('click', () => {
    if (!confirm('Clear your cart?')) return;
    saveCart([]); clearStoredRate(); clearRatesUI(); render();
  });
  if (btnCons) btnCons.addEventListener('click', () => {
    const items = loadCart();
    let bulk = 0, kits = 0;
    for (const it of items) {
      if (it.type === 'bulk') bulk += Number(it.units||0);
      if (it.type === 'kit')  kits += Number(it.qty||0);
    }
    const merged = [];
    if (bulk > 0) {
      let u = Math.min(BULK_MAX, Math.max(BULK_MIN, Math.round(bulk / BULK_STEP) * BULK_STEP));
      merged.push({ type:'bulk', units:u });
    }
    if (kits > 0) merged.push({ type:'kit', qty:kits });
    saveCart(merged); clearStoredRate(); clearRatesUI(); render();
  });
  if (btnMore) btnMore.addEventListener('click', ()=>{ window.location.href='/order.html'; });

  // Shipping quote UI
  function getStoredRate() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_RATE) || 'null'); }
    catch { return null; }
  }
  function setStoredRate(rate) {
    localStorage.setItem(STORAGE_KEY_RATE, JSON.stringify(rate || null));
  }
  function clearStoredRate() { localStorage.removeItem(STORAGE_KEY_RATE); }
  function clearRatesUI() {
    if (ratesList) ratesList.innerHTML = '';
    if (shipEl)  shipEl.textContent  = fmtMoney(0);
    if (grandEl) grandEl.textContent = fmtMoney(computeSubtotalDollars(loadCart()));
  }
  function onSelectRate(rate) {
    setStoredRate(rate);
    if (shipEl)  shipEl.textContent  = fmtMoney(rate.amount || 0);
    if (grandEl) grandEl.textContent = fmtMoney((rate.amount || 0) + computeSubtotalDollars(loadCart()));
  }

  async function fetchWithTimeout(url, opts={}, ms=20000) {
    const ctl = new AbortController();
    const t = setTimeout(()=>ctl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctl.signal }); }
    finally { clearTimeout(t); }
  }

  async function requestRates() {
    const dest = readDestFromForm();
    if (!dest.postal) { alert('Please enter a ZIP/Postal code.'); return; }
    setStoredDest(dest);

    const items = loadCart();
    if (!items.length) { alert('Your cart is empty.'); return; }

    try {
      btnRates.disabled = true;
      const prev = btnRates.textContent;
      btnRates.textContent = 'Getting rates…';

      const res = await fetchWithTimeout('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ destination: dest, items })
      }, 25000);

      if (!res.ok) {
        console.error('Quote error', await res.text());
        alert('Could not get shipping rates. Please try again.');
        return;
      }

      const data = await res.json();
      renderRates(data?.rates || []);
    } catch (e) {
      console.error(e);
      alert(e.name === 'AbortError' ? 'Timed out getting rates.' : 'Network error getting rates.');
    } finally {
      btnRates.disabled = false;
      btnRates.textContent = 'Get Rates';
    }
  }

  function renderRates(rates) {
    ratesList.innerHTML = '';
    if (!rates.length) {
      ratesList.innerHTML = `<li class="muted">No rates available for this destination.</li>`;
      setStoredRate(null); onSelectRate({ amount: 0 });
      return;
    }
    rates.forEach((r, i) => {
      const id = `rate-${i}`;
      const li = document.createElement('li');
      li.className = 'rate-row';
      li.innerHTML = `
        <label class="rate-option">
          <input type="radio" name="shiprate" id="${id}" ${i===0?'checked':''}>
          <span class="rate-carrier">${r.carrier}</span>
          <span class="rate-service">${r.service||''}</span>
          <span class="rate-price">${fmtMoney(r.amount||0)}</span>
        </label>`;
      ratesList.appendChild(li);
      li.querySelector('input').addEventListener('change', () => onSelectRate(r));
    });
    onSelectRate(rates[0]); // auto-select cheapest (pre-sorted by API)
  }

  if (btnRates) btnRates.addEventListener('click', requestRates);

  // Checkout
  if (btnCheckout) btnCheckout.addEventListener('click', async () => {
    try {
      btnCheckout.disabled = true;
      const items = loadCart();
      if (!items.length) { alert('Your cart is empty.'); btnCheckout.disabled = false; return; }
      const rate = getStoredRate() || null;
      const res = await fetchWithTimeout('/api/checkout', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ items, shipping: rate })
      }, 20000);
      if (!res.ok) { console.error(await res.text()); alert('Server error creating checkout.'); return; }
      const data = await res.json();
      if (!data?.url) { alert('Could not start checkout.'); return; }
      window.location.assign(data.url);
    } catch (e) {
      console.error(e); alert('Network error creating checkout.');
    } finally { btnCheckout.disabled = false; }
  });

  // Init
  hydrateFormFromStored();
  render();
})();

