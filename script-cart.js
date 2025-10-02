<!-- /public/script-cart.js -->
<script>
/* MASTER cart logic with cross-origin import + street support
   Storage:
     'fd_cart'       : normalized array
     'fd_dest'       : {country, state, city, postal, street}
     'fd_ship_quote' : chosen rate
   Cross-origin import:
     - ?cart=<base64 json of fd_cart>   (preferred)
     - cookie "fd_cart_b64" (optional fallback)
*/
(function () {
  // ---------- Config ----------
  const KEY_CART = 'fd_cart';
  const KEY_DEST = 'fd_dest';
  const KEY_RATE = 'fd_ship_quote';

  const BULK_MIN  = 5000;
  const BULK_MAX  = 960000;
  const BULK_STEP = 5000;

  function unitPriceFor(units) {
    if (units >= 160000) return 0.0630;
    if (units >= 20000)  return 0.0675;
    return 0.0720;
  }
  function lineTotalCentsForUnits(units) {
    // multiply then round, so 5,000 * 0.0720 => $360.00 (not 350)
    return Math.round(unitPriceFor(units) * 100 * units);
  }

  // ---------- DOM ----------
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

  const cartBody    = $('#cart-body') || $('#cart-items') || $('#cart-table tbody');
  const subtotalEl  = $('#cart-subtotal') || $('#summary-subtotal') || $('#summaryTotal');
  const shipTotalEl = $('#summary-shipping');
  const grandEl     = $('#summary-grand');
  const badgeEl     = $('#cart-count');

  const btnClear    = $('#btn-clear');
  const btnCons     = $('#btn-consolidate');
  const btnMore     = $('#btn-add-more');
  const btnRates    = $('#btn-get-rates');
  const ratesList   = $('#rates-list');
  const btnCheckout = $('#btn-checkout');
  const linkUseSaved= $('#use-saved-dest') || $('#btn-use-saved');

  // Shipping inputs (Street included)
  const inCountry = $('#ship-country');
  const inState   = $('#ship-state');
  const inCity    = $('#ship-city');
  const inPostal  = $('#ship-postal');
  const inStreet  = $('#ship-street');

  // ---------- Utils ----------
  const fmtMoney = (n)=> (Number(n)||0).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2});
  const fmtUnit  = (d)=> '$' + Number(d).toFixed(4);
  const n        = (v)=> Number(v);

  function ensureCountryOptions() {
    if (!inCountry) return;
    if (inCountry.options.length === 0) {
      [['US','United States'],['CA','Canada'],['MX','Mexico']].forEach(([v,t])=>{
        inCountry.add(new Option(t, v));
      });
    }
  }

  // ---------- Cart normalize ----------
  function normalizeItem(raw) {
    if (!raw) return null;
    const lower = (x)=> String(x||'').toLowerCase();

    // explicit types
    if (raw.type === 'bulk' || raw.type === 'BULK') {
      let u = n(raw.units ?? raw.qty ?? raw.quantity);
      if (!Number.isFinite(u) || u <= 0) return null;
      u = Math.round(u / BULK_STEP) * BULK_STEP;
      u = Math.max(BULK_MIN, Math.min(BULK_MAX, u));
      return { type:'bulk', units:u };
    }
    if (raw.type === 'kit' || raw.type === 'KIT') {
      let q = n(raw.qty ?? raw.quantity ?? 1);
      q = Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
      return { type:'kit', qty:q };
    }

    // SKU shapes
    if ('sku' in raw) {
      const s = lower(raw.sku);
      if (s.includes('kit')) {
        let q = n(raw.qty ?? raw.quantity ?? 1);
        q = Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
        return { type:'kit', qty:q };
      } else {
        let u = n(raw.units ?? raw.qty ?? raw.quantity);
        if (!Number.isFinite(u) || u <= 0) return null;
        u = Math.round(u / BULK_STEP) * BULK_STEP;
        u = Math.max(BULK_MIN, Math.min(BULK_MAX, u));
        return { type:'bulk', units:u };
      }
    }

    // generic
    if ('units' in raw) {
      let u = n(raw.units);
      if (!Number.isFinite(u) || u <= 0) return null;
      u = Math.round(u / BULK_STEP) * BULK_STEP;
      u = Math.max(BULK_MIN, Math.min(BULK_MAX, u));
      return { type:'bulk', units:u };
    }
    if ('qty' in raw || 'quantity' in raw) {
      const qval = n(raw.qty ?? raw.quantity);
      if (!Number.isFinite(qval) || qval <= 0) return null;
      if (qval >= BULK_MIN) {
        let u = Math.round(qval / BULK_STEP) * BULK_STEP;
        u = Math.max(BULK_MIN, Math.min(BULK_MAX, u));
        return { type:'bulk', units:u };
      }
      return { type:'kit', qty: Math.floor(qval) };
    }
    return null;
  }

  function loadCartLS() {
    try {
      const raw = localStorage.getItem(KEY_CART);
      const arr = raw ? JSON.parse(raw) : [];
      return (Array.isArray(arr) ? arr : []).map(normalizeItem).filter(Boolean);
    } catch { return []; }
  }
  function saveCart(items) {
    localStorage.setItem(KEY_CART, JSON.stringify(items||[]));
    updateBadge(items||[]);
  }

  // --- Cross-origin import helpers ---
  function b64decodeToString(b64) {
    try { return decodeURIComponent(escape(atob(b64))); } catch { return ''; }
  }
  function parseCookie(name) {
    return document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.split('=').slice(1).join('=') || '';
  }
  function importCartIfPresent() {
    // 1) URL param ?cart=<base64 json>
    const qp = new URLSearchParams(location.search);
    const enc = qp.get('cart');
    if (enc) {
      const json = b64decodeToString(enc);
      try {
        const arr = JSON.parse(json);
        const items = (Array.isArray(arr)?arr:[]).map(normalizeItem).filter(Boolean);
        if (items.length) {
          saveCart(items);
          // clean URL
          qp.delete('cart');
          history.replaceState({}, '', location.pathname + (qp.toString()?('?'+qp.toString()):''));
          return true;
        }
      } catch {}
    }
    // 2) Cookie fallback
    const c = parseCookie('fd_cart_b64');
    if (c) {
      const json = b64decodeToString(c);
      try {
        const arr = JSON.parse(json);
        const items = (Array.isArray(arr)?arr:[]).map(normalizeItem).filter(Boolean);
        if (items.length) {
          saveCart(items);
          return true;
        }
      } catch {}
    }
    return false;
  }

  // ---------- Badge ----------
  function updateBadge(items) {
    if (!badgeEl) return;
    let total = 0;
    for (const it of items) total += it.type==='bulk' ? it.units : it.qty;
    badgeEl.textContent = total > 0 ? String(total) : '';
    badgeEl.style.display = total > 0 ? 'inline-block' : 'none';
  }

  // ---------- Destination ----------
  function getDest() { try { return JSON.parse(localStorage.getItem(KEY_DEST)||'null'); } catch { return null; } }
  function setDest(d) { localStorage.setItem(KEY_DEST, JSON.stringify(d||null)); }
  function writeDestToUI(d) {
    if (!d) return;
    if (inCountry) inCountry.value = (d.country||'US').toUpperCase();
    if (inState)   inState.value   = (d.state||'').toUpperCase();
    if (inCity)    inCity.value    = d.city||'';
    if (inPostal)  inPostal.value  = d.postal||'';
    if (inStreet)  inStreet.value  = d.street||'';
  }
  function readDestFromUI() {
    if (!inCountry) return null;
    const d = {
      country: (inCountry.value||'US').toUpperCase(),
      state:   (inState?.value||'').toUpperCase(),
      city:     inCity?.value||'',
      postal:   inPostal?.value||'',
      street:   inStreet?.value||'',
    };
    if (!d.postal) return null;
    return d;
  }

  // ---------- Totals ----------
  function subtotal() {
    const items = loadCartLS();
    let cents = 0;
    for (const it of items) {
      if (it.type === 'bulk') cents += lineTotalCentsForUnits(it.units);
      else cents += 3600 * it.qty;
    }
    return cents / 100;
  }

  // ---------- Render ----------
  function render() {
    const items = loadCartLS();

    if (!items.length) {
      if (cartBody) cartBody.innerHTML = `<tr><td colspan="4" class="muted" style="padding:20px 0;">Your cart is empty.</td></tr>`;
      if (subtotalEl)  subtotalEl.textContent = fmtMoney(0);
      if (shipTotalEl) shipTotalEl.textContent = fmtMoney(0);
      if (grandEl)     grandEl.textContent = fmtMoney(0);
      clearRateUI();
      updateBadge(items);
      return;
    }

    if (cartBody) {
      cartBody.innerHTML = '';
      items.forEach((it, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.index = String(idx);

        if (it.type === 'bulk') {
          const unit = unitPriceFor(it.units);
          const line = lineTotalCentsForUnits(it.units) / 100;
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
            <td class="col-unitprice"><span class="unit-price">${fmtUnit(unit)}</span></td>
            <td class="col-total">
              <span class="line-total">${fmtMoney(line)}</span>
              <button class="btn-remove" type="button">Remove</button>
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
              <button class="btn-remove" type="button">Remove</button>
            </td>`;
        }
        cartBody.appendChild(tr);
      });

      // events
      $$('.btn-dec', cartBody).forEach(b=>b.addEventListener('click', onStep.bind(null,-1)));
      $$('.btn-inc', cartBody).forEach(b=>b.addEventListener('click', onStep.bind(null,+1)));
      $$('.qty-input', cartBody).forEach(i=>i.addEventListener('change', onManual));
      $$('.btn-remove', cartBody).forEach(b=>b.addEventListener('click', onRemove));
    }

    const sub = subtotal();
    if (subtotalEl) subtotalEl.textContent = fmtMoney(sub);

    const rate = getRate();
    if (shipTotalEl) shipTotalEl.textContent = fmtMoney(rate?.amount || 0);
    if (grandEl)     grandEl.textContent     = fmtMoney(sub + (rate?.amount || 0));

    updateBadge(items);
  }

  function afterCartChange() {
    clearRate();
    clearRateUI();
    render();
  }
  function onStep(delta, ev) {
    const tr   = ev.currentTarget.closest('tr');
    const idx  = n(tr?.dataset.index);
    const arr  = loadCartLS();
    const item = arr[idx];
    if (!item) return;

    if (item.type === 'bulk') {
      let next = (item.units||BULK_MIN) + delta*BULK_STEP;
      next = Math.max(BULK_MIN, Math.min(BULK_MAX, next));
      item.units = next;
    } else {
      let q = (item.qty||1) + delta;
      item.qty = Math.max(1, q);
    }
    saveCart(arr);
    afterCartChange();
  }
  function onManual(ev) {
    const tr   = ev.currentTarget.closest('tr');
    const idx  = n(tr?.dataset.index);
    const arr  = loadCartLS();
    const item = arr[idx];
    if (!item) return;

    let v = n(ev.currentTarget.value || 0);
    if (item.type === 'bulk') {
      v = Math.round(v / BULK_STEP) * BULK_STEP;
      v = Math.max(BULK_MIN, Math.min(BULK_MAX, v));
      item.units = v;
    } else {
      item.qty = Math.max(1, Math.floor(v||1));
    }
    saveCart(arr);
    afterCartChange();
  }
  function onRemove(ev) {
    const tr  = ev.currentTarget.closest('tr');
    const idx = n(tr?.dataset.index);
    const arr = loadCartLS();
    arr.splice(idx,1);
    saveCart(arr);
    afterCartChange();
  }

  // ---------- Rates ----------
  function getRate() { try { return JSON.parse(localStorage.getItem(KEY_RATE)||'null'); } catch { return null; } }
  function setRate(r){ localStorage.setItem(KEY_RATE, JSON.stringify(r||null)); }
  function clearRate(){ localStorage.removeItem(KEY_RATE); }
  function clearRateUI(){
    if (ratesList) ratesList.innerHTML = '';
    if (shipTotalEl) shipTotalEl.textContent = fmtMoney(0);
    if (grandEl)     grandEl.textContent     = fmtMoney(subtotal());
  }
  function selectRate(r){
    setRate(r);
    if (shipTotalEl) shipTotalEl.textContent = fmtMoney(r.amount||0);
    if (grandEl)     grandEl.textContent     = fmtMoney(subtotal() + (r.amount||0));
  }

  async function fetchWithTimeout(url, opts={}, ms=15000){
    const ctl = new AbortController();
    const id  = setTimeout(()=>ctl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctl.signal }); }
    finally { clearTimeout(id); }
  }
  function renderRates(rates){
    if (!ratesList) return;
    ratesList.innerHTML = '';
    if (!rates || !rates.length) {
      ratesList.innerHTML = `<li class="muted">No rates for this destination.</li>`;
      setRate(null);
      selectRate({amount:0});
      return;
    }
    rates.forEach((r,i)=>{
      const li = document.createElement('li');
      li.className='rate-row';
      li.innerHTML = `
        <label class="rate-option">
          <input type="radio" name="shiprate" ${i===0?'checked':''}>
          <span class="rate-carrier">${r.carrier||'Carrier'}</span>
          <span class="rate-service">${r.service||''}</span>
          <span class="rate-price">${fmtMoney(r.amount||0)}</span>
        </label>`;
      ratesList.appendChild(li);
      li.querySelector('input').addEventListener('change',()=>selectRate(r));
    });
    selectRate(rates[0]);
  }
  async function getRates(){
    const items = loadCartLS();
    if (!items.length) return alert('Your cart is empty.');

    ensureCountryOptions();
    let dest = readDestFromUI() || getDest();
    if (!dest || !dest.postal) {
      const zip = prompt('Enter destination ZIP/Postal:');
      if (!zip) return;
      dest = {
        country: (inCountry?.value||'US').toUpperCase(),
        state:   (inState?.value||'').toUpperCase(),
        city:     inCity?.value||'',
        postal:   zip,
        street:   inStreet?.value||'',
      };
    }
    setDest(dest);
    writeDestToUI(dest);

    if (!btnRates) return;
    btnRates.disabled = true;
    const prev = btnRates.textContent;
    btnRates.textContent = 'Getting rates…';
    try {
      const res = await fetchWithTimeout('/api/shipping/quote',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ destination: dest, items }),
      }, 20000);
      if (!res.ok) {
        console.error('Quote error', await res.text());
        alert('Could not get shipping rates. Please try again.');
        return;
      }
      const data = await res.json();
      renderRates(data?.rates||[]);
    } catch (e) {
      console.error(e);
      alert(e.name==='AbortError'?'Timed out getting rates. Try again.':'Network error getting rates.');
    } finally {
      btnRates.disabled = false;
      btnRates.textContent = prev;
    }
  }

  // ---------- Checkout ----------
  async function checkout(){
    const items = loadCartLS();
    if (!items.length) return alert('Your cart is empty.');
    const rate = getRate() || null;

    btnCheckout.disabled = true;
    const prev = btnCheckout.textContent;
    btnCheckout.textContent = 'Loading…';
    try{
      const res = await fetchWithTimeout('/api/checkout',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ items, shipping: rate, destination: getDest() || readDestFromUI() || null }),
      }, 20000);
      if (!res.ok) {
        console.error('Checkout failed', await res.text());
        alert('A server error occurred creating your checkout. Please try again.');
        return;
      }
      const data = await res.json();
      if (!data?.url) return alert('Could not start checkout. Please try again.');
      window.location.assign(data.url);
    } catch (e) {
      console.error(e);
      alert('Network error creating checkout. Please try again.');
    } finally {
      btnCheckout.disabled = false;
      btnCheckout.textContent = prev;
    }
  }

  // ---------- Wire up ----------
  if (btnClear) btnClear.addEventListener('click', ()=>{ if(confirm('Clear your cart?')){ saveCart([]); clearRate(); clearRateUI(); render(); }});
  if (btnCons)   btnCons.addEventListener('click', ()=>{
    const items = loadCartLS();
    let bulk=0, kits=0;
    for (const it of items){ if(it.type==='bulk') bulk+=it.units; else kits+=it.qty; }
    const merged=[];
    if (bulk>0){
      let u = Math.round(bulk / BULK_STEP) * BULK_STEP;
      u = Math.max(BULK_MIN, Math.min(BULK_MAX, u));
      merged.push({type:'bulk',units:u});
    }
    if (kits>0) merged.push({type:'kit',qty:kits});
    saveCart(merged); clearRate(); clearRateUI(); render();
  });
  if (btnMore)     btnMore.addEventListener('click', ()=>{ location.href='/order.html'; });
  if (btnRates)    btnRates.addEventListener('click', getRates);
  if (btnCheckout) btnCheckout.addEventListener('click', checkout);

  [inCountry,inState,inCity,inPostal,inStreet].forEach(el=>{
    if (!el) return;
    el.addEventListener('change', ()=>{ const d = readDestFromUI(); if (d) setDest(d); });
  });
  if (linkUseSaved) linkUseSaved.addEventListener('click',(e)=>{ e.preventDefault(); ensureCountryOptions(); writeDestToUI(getDest()); });

  // ---------- Init ----------
  ensureCountryOptions();
  // If LS is empty on this origin, try importing from URL/cookie
  const hadImport = importCartIfPresent();
  if (!hadImport && !loadCartLS().length) {
    // nothing yet; still render empty UI
  }
  writeDestToUI(getDest());
  render();
})();
</script>

