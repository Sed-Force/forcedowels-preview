/* MASTER: /public/script-cart.js  (Step 2)
   Force Dowels — Cart page logic + Shipping quotes (status-aware)
   Storage keys:
     - 'fd_cart'       : [{type:'bulk',units:<int>} | {type:'kit',qty:<int>}]
     - 'fd_dest'       : {country:'US'|'CA'|'MX', state:'', city:'', postal:''}
     - 'fd_ship_quote' : {carrier, service, amount, currency}
*/
(function () {
  // ---------- Config ----------
  const STORAGE_KEY_CART = 'fd_cart';
  const STORAGE_KEY_DEST = 'fd_dest';
  const STORAGE_KEY_RATE = 'fd_ship_quote';

  const BULK_MIN = 5000, BULK_MAX = 960000, BULK_STEP = 5000;

  function unitPriceCentsFor(units) {
    if (units >= 160000) return Math.round(0.063 * 100);   // $0.0630
    if (units >= 20000)  return Math.round(0.0675 * 100);  // $0.0675
    return Math.round(0.072 * 100);                        // $0.0720
  }

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // Main cart bits
  const cartBody    = $('#cart-body') || $('#cart-items') || $('#cart-table tbody');
  const subtotalEl  = $('#cart-subtotal') || $('#summary-subtotal') || $('#summaryTotal');
  const shipTotalEl = $('#summary-shipping');
  const grandEl     = $('#summary-grand');
  const badgeEl     = $('#cart-count');

  // Toolbar
  const btnMore     = $('#btn-add-more');
  const btnClear    = $('#btn-clear');
  const btnCons     = $('#btn-consolidate');
  const btnCheckout = $('#btn-checkout');

  // Shipping UI
  const btnGetRates = $('#btn-get-rates');
  const ratesList   = $('#rates-list');
  const countrySel  = $('#ship-country');
  const stateInp    = $('#ship-state');
  const cityInp     = $('#ship-city');
  const zipInp      = $('#ship-postal');

  // ---------- Money ----------
  const fmtMoney = (n) => (Number(n)||0).toLocaleString('en-US', {style:'currency', currency:'USD', minimumFractionDigits:2});

  // ---------- Storage: cart ----------
  function loadCart() {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_CART) || '[]');
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
        if ('units' in it) return { type:'bulk', units:Number(it.units)||BULK_MIN };
        if ('qty'   in it) return { type:'kit',  qty:Math.max(1, Number(it.qty)||1) };
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
      if (it.type === 'bulk') total += it.units; else if (it.type === 'kit') total += it.qty;
    }
    badgeEl.textContent = total > 0 ? String(total) : '';
    badgeEl.style.display = total > 0 ? 'inline-block' : 'none';
  }

  // ---------- Destination ----------
  function getDest() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_DEST) || 'null'); } catch { return null; }
  }
  function setDest(d) {
    localStorage.setItem(STORAGE_KEY_DEST, JSON.stringify(d));
    // sync inputs
    if (countrySel) countrySel.value = (d.country||'US').toUpperCase();
    if (stateInp)   stateInp.value   = d.state||'';
    if (cityInp)    cityInp.value    = d.city||'';
    if (zipInp)     zipInp.value     = d.postal||'';
  }
  function readDestFromForm() {
    const d = {
      country: (countrySel?.value || 'US').toUpperCase(),
      state:   stateInp?.value || '',
      city:    cityInp?.value || '',
      postal:  zipInp?.value || '',
    };
    setDest(d);
    return d;
  }

  // ---------- Chosen shipping rate ----------
  function getChosenRate() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY_RATE) || 'null'); } catch { return null; } }
  function setChosenRate(r) { localStorage.setItem(STORAGE_KEY_RATE, JSON.stringify(r||null)); }
  function clearChosenRate(){ localStorage.removeItem(STORAGE_KEY_RATE); }

  // ---------- Totals ----------
  function computeSubtotal(items) {
    let cents = 0;
    for (const it of items) {
      if (it.type === 'bulk') cents += unitPriceCentsFor(it.units)*it.units;
      else if (it.type === 'kit') cents += 3600 * it.qty;
    }
    return cents/100;
  }

  // ---------- Render cart ----------
  function render() {
    const items = loadCart();

    // init dest inputs once
    if (!getDest()) setDest({ country: 'US', state: '', city: '', postal: '' });
    const dest = getDest();

    if (countrySel && !countrySel.value) countrySel.value = (dest.country || 'US');

    if (!items.length) {
      if (cartBody) cartBody.innerHTML = `<tr><td colspan="4" class="muted" style="padding:20px 0;">Your cart is empty.</td></tr>`;
      if (subtotalEl) subtotalEl.textContent = fmtMoney(0);
      if (shipTotalEl) shipTotalEl.textContent = fmtMoney(0);
      if (grandEl) grandEl.textContent = fmtMoney(0);
      updateBadge(items);
      return;
    }

    if (cartBody) {
      cartBody.innerHTML = '';
      items.forEach((it, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.index = String(idx);

        if (it.type === 'bulk') {
          const unit = unitPriceCentsFor(it.units)/100;
          const line = unit * it.units;
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
            <td class="col-unitprice"><span class="unit-price">${fmtMoney(unit)}</span></td>
            <td class="col-total">
              <span class="line-total">${fmtMoney(line)}</span>
              <button class="btn-remove" type="button" aria-label="Remove item">Remove</button>
            </td>`;
        } else {
          const line = 36 * it.qty;
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
            </td>`;
        }
        cartBody.appendChild(tr);
      });

      // bind row events
      $$('.btn-dec', cartBody).forEach(b => b.addEventListener('click', onStep.bind(null, -1)));
      $$('.btn-inc', cartBody).forEach(b => b.addEventListener('click', onStep.bind(null, +1)));
      $$('.qty-input', cartBody).forEach(i => i.addEventListener('change', onManual));
      $$('.btn-remove', cartBody).forEach(b => b.addEventListener('click', onRemove));
    }

    // totals
    const sub = computeSubtotal(items);
    if (subtotalEl) subtotalEl.textContent = fmtMoney(sub);

    const chosen = getChosenRate();
    const shipAmt = chosen?.amount || 0;
    if (shipTotalEl) shipTotalEl.textContent = fmtMoney(shipAmt);
    if (grandEl) grandEl.textContent = fmtMoney(sub + shipAmt);

    updateBadge(items);
  }

  function onStep(delta, ev) {
    const tr = ev.currentTarget.closest('tr'); if (!tr) return;
    const idx = Number(tr.dataset.index);
    const items = loadCart(); const it = items[idx]; if (!it) return;

    if (it.type === 'bulk') {
      let next = (it.units || BULK_MIN) + delta*BULK_STEP;
      if (next < BULK_MIN) next = BULK_MIN;
      if (next > BULK_MAX) next = BULK_MAX;
      it.units = next;
    } else {
      let q = (it.qty || 1) + delta; if (q < 1) q = 1; it.qty = q;
    }

    saveCart(items);
    clearChosenRate();  // changing cart invalidates shipping
    clearRatesUI();
    render();
  }

  function onManual(ev) {
    const tr = ev.currentTarget.closest('tr'); if (!tr) return;
    const idx = Number(tr.dataset.index);
    const items = loadCart(); const it = items[idx]; if (!it) return;

    let v = Number(ev.currentTarget.value || 0);
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
    clearChosenRate();
    clearRatesUI();
    render();
  }

  function onRemove(ev) {
    const tr = ev.currentTarget.closest('tr'); if (!tr) return;
    const idx = Number(tr.dataset.index);
    const items = loadCart();
    items.splice(idx, 1);
    saveCart(items);
    clearChosenRate();
    clearRatesUI();
    render();
  }

  // ---------- Toolbar ----------
  btnMore && btnMore.addEventListener('click', () => { window.location.href = '/order.html'; });
  btnClear && btnClear.addEventListener('click', () => {
    if (!confirm('Clear your cart?')) return;
    saveCart([]); clearChosenRate(); clearRatesUI(); render();
  });
  btnCons && btnCons.addEventListener('click', () => {
    const items = loadCart(); let u=0,q=0;
    for (const it of items) { if (it.type==='bulk') u+=Number(it.units||0); else if (it.type==='kit') q+=Number(it.qty||0); }
    const merged=[]; if (u>0){ let s=Math.round(u/BULK_STEP)*BULK_STEP; if (s<BULK_MIN)s=BULK_MIN; if (s>BULK_MAX)s=BULK_MAX; merged.push({type:'bulk',units:s}); }
    if (q>0) merged.push({type:'kit',qty:q});
    saveCart(merged); clearChosenRate(); clearRatesUI(); render();
  });

  // ---------- Shipping: request + UI ----------
  function clearRatesUI() {
    if (ratesList) ratesList.innerHTML = '';
    const dbg = $('.rates-debug'); if (dbg) dbg.remove();
    const sub = computeSubtotal(loadCart());
    if (shipTotalEl) shipTotalEl.textContent = fmtMoney(0);
    if (grandEl) grandEl.textContent = fmtMoney(sub);
  }

  async function fetchWithTimeout(url, opts={}, ms=20000) {
    const ctl = new AbortController(); const t = setTimeout(()=>ctl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctl.signal }); }
    finally { clearTimeout(t); }
  }

  async function requestRates() {
    const items = loadCart();
    if (!items.length) { alert('Your cart is empty.'); return; }
    const dest = readDestFromForm();
    if (!dest.postal) { alert('Enter a destination ZIP/Postal.'); return; }

    try {
      btnGetRates && (btnGetRates.disabled = true, btnGetRates.textContent = 'Getting rates…');

      const resp = await fetchWithTimeout('/api/shipping/quote', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ destination: dest, items })
      }, 25000);

      if (!resp.ok) {
        console.error('Quote error', await resp.text());
        alert('Could not get shipping rates.'); return;
      }

      const data = await resp.json();
      renderRates(data);
    } catch (e) {
      console.error(e);
      alert(e.name === 'AbortError' ? 'Timed out getting rates.' : 'Network error getting rates.');
    } finally {
      btnGetRates && (btnGetRates.disabled = false, btnGetRates.textContent = 'Get Rates');
    }
  }

  function renderRates(data) {
    if (!ratesList) return;
    const rates = Array.isArray(data?.rates) ? data.rates : [];
    ratesList.innerHTML = '';

    if (!rates.length) {
      ratesList.innerHTML = `<li class="muted">No rates available for this destination.</li>`;
      setChosenRate(null);
    } else {
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
          </label>`;
        ratesList.appendChild(li);
        li.querySelector('input').addEventListener('change', () => onSelectRate(r));
      });
      onSelectRate(rates[0]);
    }

    // ---- Step-2: show clear carrier status / reasons under the list ----
    const dbg = document.createElement('div');
    dbg.className = 'rates-debug';
    const ups   = data?.status?.ups;
    const usps  = data?.status?.usps;
    const tql   = data?.status?.tql;

    const lines = [];
    if (ups)  lines.push(`UPS: ${ups.available ? 'available' : 'unavailable'}${ups.message ? ' — ' + ups.message : ''}`);
    if (usps) lines.push(`USPS: ${usps.available ? 'available' : 'unavailable'}${usps.message ? ' — ' + usps.message : ''}`);
    if (tql)  lines.push(`TQL: ${tql.available ? 'available' : 'unavailable'}${tql.message ? ' — ' + tql.message : ''}`);

    dbg.innerHTML = lines.map(s => `<div class="muted">${s}</div>`).join('');
    ratesList.parentElement.appendChild(dbg);
  }

  function onSelectRate(rate) {
    setChosenRate(rate);
    const sub = computeSubtotal(loadCart());
    if (shipTotalEl) shipTotalEl.textContent = fmtMoney(rate?.amount || 0);
    if (grandEl)     grandEl.textContent     = fmtMoney(sub + (rate?.amount || 0));
  }

  btnGetRates && btnGetRates.addEventListener('click', requestRates);
  countrySel  && countrySel.addEventListener('change', readDestFromForm);
  stateInp    && stateInp.addEventListener('change', readDestFromForm);
  cityInp     && cityInp.addEventListener('change', readDestFromForm);
  zipInp      && zipInp.addEventListener('change', readDestFromForm);

  // ---------- Checkout ----------
  btnCheckout && btnCheckout.addEventListener('click', async () => {
    const items = loadCart(); if (!items.length) return alert('Your cart is empty.');
    const rate = getChosenRate(); // optional — Stripe can still work without
    try {
      btnCheckout.disabled = true; const prev = btnCheckout.textContent; btnCheckout.textContent = 'Loading…';
      const resp = await fetch('/api/checkout', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ items, shipping: rate ? {
          carrier: rate.carrier, service: rate.service, amount: rate.amount, currency: rate.currency || 'USD'
        } : null })
      });
      if (!resp.ok) { console.error(await resp.text()); alert('Server error creating checkout.'); return; }
      const data = await resp.json();
      if (!data?.url) { alert('Could not start checkout.'); return; }
      window.location.assign(data.url);
    } finally { btnCheckout.disabled = false; btnCheckout.textContent = 'Proceed to Checkout'; }
  });

  // ---------- init ----------
  render();
})();

