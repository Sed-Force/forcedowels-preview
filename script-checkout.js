/* MASTER: /public/script-checkout.js
   Checkout page logic:
   - Reads 'fd_cart' items
   - Shows tiered pricing correctly (dollars, not 100x)
   - Gets rates from /api/shipping/quote
   - Renders grouped carriers with friendly labels (UPS Ground, 3 Day Select, etc.)
   - Stores chosen rate and proceeds to Stripe via /api/checkout
*/

(function () {
  // ---------- Storage keys ----------
  const K_CART  = 'fd_cart';
  const K_DEST  = 'fd_dest';
  const K_RATE  = 'fd_ship_quote';

  // ---------- Pricing tiers ----------
  function unitPriceCentsFor(units) {
    if (units >= 160000) return Math.round(0.063 * 100);
    if (units >= 20000)  return Math.round(0.0675 * 100);
    return Math.round(0.072 * 100);
  }

  function computeSubtotalDollars(items) {
    let cents = 0;
    for (const it of items) {
      if (it.type === 'bulk') {
        const u = Number(it.units || 0);
        cents += unitPriceCentsFor(u) * u;
      } else if (it.type === 'kit') {
        cents += 3600 * Number(it.qty || 0);
      }
    }
    return cents / 100;
  }

  // ---------- DOM ----------
  const $ = (s, r=document) => r.querySelector(s);
  const fmt = (n) => (Number(n)||0).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2});

  const elName    = $('#co-name');
  const elStreet  = $('#co-street');
  const elCity    = $('#co-city');
  const elState   = $('#co-state');
  const elPostal  = $('#co-postal');
  const elCountry = $('#co-country');

  const btnGet    = $('#btn-get-rates');
  const btnUse    = $('#btn-use-saved');
  const groupsEl  = $('#ship-groups');

  const sumItems  = $('#sum-items');
  const sumSub    = $('#sum-subtotal');
  const sumShip   = $('#sum-shipping');
  const sumTotal  = $('#sum-total');
  const btnPay    = $('#btn-pay');

  // ---------- Loaders ----------
  function loadItems() {
    try { return JSON.parse(localStorage.getItem(K_CART) || '[]'); } catch { return []; }
  }
  function loadDest() {
    try { return JSON.parse(localStorage.getItem(K_DEST) || 'null'); } catch { return null; }
  }
  function saveDest(d) { localStorage.setItem(K_DEST, JSON.stringify(d||null)); }
  function loadRate() {
    try { return JSON.parse(localStorage.getItem(K_RATE) || 'null'); } catch { return null; }
  }
  function saveRate(r) { localStorage.setItem(K_RATE, JSON.stringify(r||null)); }

  // ---------- UI: items & totals ----------
  function renderSummary() {
    const items = loadItems();
    const units = items.filter(i=>i.type==='bulk').reduce((a,b)=>a+Number(b.units||0),0);
    const kits  = items.filter(i=>i.type==='kit').reduce((a,b)=>a+Number(b.qty||0),0);

    const parts = [];
    if (units>0) parts.push(`${units.toLocaleString()} dowels`);
    if (kits>0)  parts.push(`${kits} kit${kits>1?'s':''}`);
    sumItems.textContent = parts.length?parts.join(' + '):'—';

    const sub = computeSubtotalDollars(items);
    const r   = loadRate();
    sumSub.textContent  = fmt(sub);
    sumShip.textContent = fmt(r?.amount||0);
    sumTotal.textContent= fmt(sub + (r?.amount||0));
  }

  // ---------- Prefill / use saved ----------
  function prefillFromSaved() {
    const d = loadDest();
    if (!d) return;
    if (elName)    elName.value    = d.name || '';
    if (elStreet)  elStreet.value  = d.street || '';
    if (elCity)    elCity.value    = d.city || '';
    if (elState)   elState.value   = d.state || '';
    if (elPostal)  elPostal.value  = d.postal || '';
    if (elCountry) elCountry.value = d.country || 'US';
  }

  function gatherDest() {
    return {
      name:   elName?.value?.trim() || '',
      street: elStreet?.value?.trim() || '',
      city:   elCity?.value?.trim() || '',
      state:  elState?.value?.trim() || '',
      postal: elPostal?.value?.trim() || '',
      country:(elCountry?.value || 'US').toUpperCase(),
    };
  }

  // ---------- Rates ----------
  const UPS_LABELS = {
    '03':'UPS Ground','12':'UPS 3 Day Select','02':'UPS 2nd Day Air','01':'UPS Next Day Air','14':'UPS Next Day Air Early'
  };

  function groupByCarrier(rates) {
    const g = {};
    for (const r of rates||[]) {
      const key = (r.carrier||'Other').toUpperCase();
      (g[key] ||= []).push(r);
    }
    return g;
  }

  function makeRateRow(rate, checked) {
    const li = document.createElement('label');
    li.className = 'rate-line';
    const display = rate.serviceLabel || UPS_LABELS[rate.serviceCode] || rate.service || 'Service';
    li.innerHTML = `
      <input type="radio" name="shiprate" ${checked?'checked':''}>
      <span class="rate-name">${display}</span>
      <span class="rate-price">${fmt(rate.amount||0)}</span>
    `;
    const radio = li.querySelector('input');
    radio.addEventListener('change', () => {
      saveRate(rate);
      renderSummary();
    });
    return li;
  }

  function renderRates(rates, status) {
    groupsEl.innerHTML = '';
    const groups = groupByCarrier(rates);

    const order = ['USPS','UPS','TQL','OTHER'];
    for (const key of order) {
      const list = groups[key] || (key==='OTHER' ? Object.entries(groups).filter(([k])=>!order.includes(k)).flatMap(([,v])=>v) : null);
      if (!list || list.length===0) continue;

      const box = document.createElement('div');
      box.className = 'rate-group';
      box.innerHTML = `<div class="rate-title">${key}</div>`;
      const ul = document.createElement('div');
      ul.className = 'rate-list';
      list.forEach((r,i)=>ul.appendChild(makeRateRow(r,i===0)));
      box.appendChild(ul);
      groupsEl.appendChild(box);
    }

    // Auto-select first available
    const first = groupsEl.querySelector('input[name="shiprate"]');
    if (first && !loadRate()) {
      first.click();
    }

    // Carrier status (optional)
    const notes = document.createElement('div');
    notes.className = 'carrier-notes';
    notes.innerHTML = `
      <div class="note">UPS: ${status?.ups?.available?'available — '+(status?.ups?.message||''):'unavailable — '+(status?.ups?.message||'')}</div>
      <div class="note">USPS: ${status?.usps?.available?'available — '+(status?.usps?.message||''):'unavailable — '+(status?.usps?.message||'')}</div>
      <div class="note">TQL: ${status?.tql?.available?'available':'unavailable'}</div>
    `;
    groupsEl.appendChild(notes);
  }

  async function fetchWithTimeout(url, opts = {}, ms = 20000) {
    const ctl = new AbortController();
    const id = setTimeout(()=>ctl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctl.signal }); }
    finally { clearTimeout(id); }
  }

  async function getRates() {
    const dest = gatherDest();
    if (!dest.postal) { alert('Please enter ZIP / Postal.'); return; }
    saveDest(dest);

    const items = loadItems();
    if (!items.length) { alert('Your cart is empty.'); return; }

    btnGet.disabled = true;
    const prev = btnGet.textContent; btnGet.textContent = 'Getting rates…';

    try {
      const res = await fetchWithTimeout('/api/shipping/quote', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ destination: dest, items })
      });
      if (!res.ok) { console.error(await res.text()); alert('Could not get rates.'); return; }
      const data = await res.json();
      renderRates(data.rates || [], data.status || {});
      // default selected rate gets saved in renderRates via first.click()
      renderSummary();
    } catch (e) {
      console.error(e);
      alert(e.name==='AbortError' ? 'Timed out getting rates.' : 'Network error getting rates.');
    } finally {
      btnGet.disabled = false; btnGet.textContent = prev;
    }
  }

  // ---------- Proceed to payment ----------
  async function goPay() {
    const items = loadItems();
    if (!items.length) { alert('Your cart is empty.'); return; }
    const rate = loadRate(); // optional but recommended
    btnPay.disabled = true;
    const prev = btnPay.textContent; btnPay.textContent = 'Loading…';

    try {
      const res = await fetchWithTimeout('/api/checkout', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ items, shipping: rate ? {
          carrier: rate.carrier, service: rate.service, amount: rate.amount, currency: rate.currency || 'USD'
        } : null })
      });
      if (!res.ok) { console.error(await res.text()); alert('Checkout failed.'); return; }
      const data = await res.json();
      if (!data?.url) { alert('No checkout URL returned.'); return; }
      window.location.assign(data.url);
    } catch (e) {
      console.error(e);
      alert('Network error starting checkout.');
    } finally {
      btnPay.disabled = false; btnPay.textContent = prev;
    }
  }

  // ---------- Events ----------
  if (btnGet) btnGet.addEventListener('click', getRates);
  if (btnUse) btnUse.addEventListener('click', () => { prefillFromSaved(); });
  if (btnPay) btnPay.addEventListener('click', goPay);

  // ---------- Init ----------
  prefillFromSaved();
  renderSummary();
})();
