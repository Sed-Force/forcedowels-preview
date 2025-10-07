/* MASTER: /public/script-checkout.js
   Checkout page logic:
   - State/Province SELECT per country (US/CA/MX)
   - Live rates via /api/shipping/quote
   - Accurate subtotal using extended pricing (no per-unit rounding loss)
   - Stores destination in localStorage 'fd_dest' and selected rate in 'fd_ship_quote'
*/

(function () {
  // ---- Storage keys ----
  const KEY_CART  = 'fd_cart';
  const KEY_DEST  = 'fd_dest';
  const KEY_RATE  = 'fd_ship_quote';

  // ---- Bulk pricing (match server) ----
  const BULK_MIN = 5000, BULK_MAX = 960000, BULK_STEP = 5000;
  const unitPriceFor = (units) => {
    if (units >= 160000) return 0.0630;
    if (units >= 20000)  return 0.0675;
    return 0.0720;
  };
  const fmtMoney = (n) =>
    (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  // ---- DOM ----
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const countrySel = $('#ship-country');
  const stateSel   = $('#ship-state');
  const cityInp    = $('#ship-city');
  const postalInp  = $('#ship-postal');
  const streetInp  = $('#ship-street');

  const btnRates   = $('#btn-get-rates');
  const ratesList  = $('#rates-list');

  const subtotalEl = $('#summary-subtotal');
  const shipEl     = $('#summary-shipping');
  const grandEl    = $('#summary-grand');

  const btnCheckout = $('#btn-checkout');
  const badgeEl     = $('#cart-count');

  // ---- States/Provinces ----
  const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
  ];
  const CA_PROV = ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'];
  const MX_STATES = [
    'AG','BC','BS','CM','CS','CH','CO','CL','DG','GJ','GR','HG','JA','MX','MC','MR','NA','NL','OA','PU','QE','QR','SL','SI','SO','TB','TM','TL','VE','YU','ZA'
  ];

  function populateStateOptions(country, selected) {
    stateSel.innerHTML = '';
    const frag = document.createDocumentFragment();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = 'Select…';
    frag.appendChild(first);

    let list = [];
    if (country === 'US') list = US_STATES;
    else if (country === 'CA') list = CA_PROV;
    else if (country === 'MX') list = MX_STATES;

    list.forEach(code => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = code;
      frag.appendChild(opt);
    });
    stateSel.appendChild(frag);
    if (selected && list.includes(selected)) stateSel.value = selected;
  }

  // ---- Storage helpers ----
  function loadCart() {
    try {
      const raw = localStorage.getItem(KEY_CART);
      const arr = raw ? JSON.parse(raw) : [];
      return arr.map(it => {
        if (it?.type === 'bulk') {
          let u = Number(it.units || 0);
          if (!Number.isFinite(u) || u < BULK_MIN) u = BULK_MIN;
          if (u > BULK_MAX) u = BULK_MAX;
          u = Math.round(u / BULK_STEP) * BULK_STEP;
          return { type:'bulk', units:u };
        }
        if (it?.type === 'kit') {
          let q = Number(it.qty || 0);
          if (!Number.isFinite(q) || q < 1) q = 1;
          return { type:'kit', qty:q };
        }
        return null;
      }).filter(Boolean);
    } catch { return []; }
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

  function computeSubtotal(items) {
    let cents = 0;
    for (const it of items) {
      if (it.type === 'bulk') {
        cents += Math.round(unitPriceFor(it.units) * it.units * 100);
      } else if (it.type === 'kit') {
        cents += 3600 * it.qty; // $36.00
      }
    }
    return cents / 100;
  }

  function getDest() {
    try { return JSON.parse(localStorage.getItem(KEY_DEST) || '{}'); }
    catch { return {}; }
  }
  function setDest(dest) {
    localStorage.setItem(KEY_DEST, JSON.stringify(dest || {}));
  }

  function getChosenRate() {
    try { return JSON.parse(localStorage.getItem(KEY_RATE) || 'null'); }
    catch { return null; }
  }
  function setChosenRate(rate) {
    localStorage.setItem(KEY_RATE, JSON.stringify(rate || null));
  }

  // ---- Prefill & wire form ----
  function prefillForm() {
    const d = getDest();
    const country = (d.country || 'US').toUpperCase();
    countrySel.value = country;
    populateStateOptions(country, (d.state || '').toUpperCase());
    cityInp.value   = d.city   || '';
    postalInp.value = d.postal || '';
    streetInp.value = d.street || '';
  }

  countrySel.addEventListener('change', () => {
    populateStateOptions(countrySel.value);
    setChosenRate(null);
    renderRates([], null);
    recalcTotals();
  });

  [stateSel, cityInp, postalInp, streetInp].forEach(el => {
    el.addEventListener('change', () => {
      setChosenRate(null);
      renderRates([], null);
      recalcTotals();
    });
  });

  // ---- Rates ----
  async function fetchWithTimeout(url, opts={}, ms=25000) {
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctl.signal }); }
    finally { clearTimeout(id); }
  }

  function currentDestFromForm() {
    return {
      country: countrySel.value || 'US',
      state:   stateSel.value || '',
      city:    cityInp.value.trim(),
      postal:  postalInp.value.trim(),
      street:  streetInp.value.trim(), // optional for quoting; backend tolerates empty
    };
  }

  function recalcTotals() {
    const items = loadCart();
    const sub = computeSubtotal(items);
    const rate = getChosenRate();
    if (subtotalEl) subtotalEl.textContent = fmtMoney(sub);
    if (shipEl)     shipEl.textContent     = fmtMoney(rate?.amount || 0);
    if (grandEl)    grandEl.textContent    = fmtMoney(sub + (rate?.amount || 0));
    updateBadge(items);
  }

  function renderRates(rates, status) {
    ratesList.innerHTML = '';

    // If we have rates, render them
    if (Array.isArray(rates) && rates.length) {
      rates.forEach((r, i) => {
        const id = `rate-${i}`;
        const li = document.createElement('li');
        li.className = 'rate-row';
        li.innerHTML = `
          <label class="rate-option">
            <input type="radio" name="shiprate" id="${id}" ${i===0 ? 'checked' : ''}>
            <span class="rate-carrier">${r.carrier || 'Carrier'}</span>
            <span class="rate-service">${r.service || ''}</span>
            <span class="rate-price">${fmtMoney(r.amount || 0)}</span>
          </label>
        `;
        ratesList.appendChild(li);

        const radio = li.querySelector('input[type="radio"]');
        radio.addEventListener('change', () => {
          setChosenRate(r);
          recalcTotals();
        });
      });
      setChosenRate(rates[0]);
      recalcTotals();
    } else {
      // Graceful empty message
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'No rates yet. Enter address and click “Get Rates”.';
      ratesList.appendChild(li);
    }

    // Add a compact status block (helps diagnose when a carrier returns no rates)
    if (status && typeof status === 'object') {
      const s = document.createElement('li');
      s.className = 'muted';
      const ups  = status.ups  ? (status.ups.available ? `UPS: available — ${status.ups.message||''}` : `UPS: unavailable — ${status.ups.message||''}`) : '';
      const usps = status.usps ? (status.usps.available ? `USPS: available — ${status.usps.message||''}` : `USPS: unavailable — ${status.usps.message||''}`) : '';
      const tql  = status.tql  ? (status.tql.available ? `TQL: available` : `TQL: unavailable — ${status.tql.message||''}`) : '';
      s.innerHTML = [ups, usps, tql].filter(Boolean).join('<br>');
      ratesList.appendChild(s);
    }
  }

  if (btnRates) {
    btnRates.addEventListener('click', async () => {
      const dest = currentDestFromForm();

      // Persist whatever the user has entered
      setDest(dest);
      setChosenRate(null);
      renderRates([], null);
      recalcTotals();

      // Minimal validation so we don't block UPS/TQL: require country + postal at least
      if (!dest.country || !dest.postal) {
        alert('Please enter a postal/ZIP code.');
        return;
      }

      const items = loadCart();
      if (!items.length) {
        alert('Your cart is empty.');
        return;
      }

      const prev = btnRates.textContent;
      btnRates.disabled = true;
      btnRates.textContent = 'Getting rates…';

      try {
        const res = await fetchWithTimeout('/api/shipping/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination: dest, items }),
        });

        if (!res.ok) {
          console.error('Quote error', await res.text());
          alert('Could not get shipping rates. Please try again.');
          return;
        }

        const data = await res.json();
        renderRates(data?.rates || [], data?.status || null);
      } catch (e) {
        console.error(e);
        alert(e.name === 'AbortError' ? 'Timed out getting rates. Try again.' : 'Network error getting rates.');
      } finally {
        btnRates.disabled = false;
        btnRates.textContent = prev;
      }
    });
  }

  // ---- Proceed to payment ----
  if (btnCheckout) {
    btnCheckout.addEventListener('click', async () => {
      const items = loadCart();
      if (!items.length) {
        alert('Your cart is empty.');
        return;
      }
      const rate = getChosenRate();
      if (!rate) {
        alert('Please choose a shipping option first.');
        return;
      }
      setDest({
        country: countrySel.value || 'US',
        state:   stateSel.value || '',
        city:    cityInp.value.trim(),
        postal:  postalInp.value.trim(),
        street:  streetInp.value.trim(),
      });

      const prev = btnCheckout.textContent;
      btnCheckout.disabled = true;
      btnCheckout.textContent = 'Loading…';

      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            shipping: { carrier: rate.carrier, service: rate.service, amount: rate.amount, currency: rate.currency || 'USD' },
          }),
        });

        if (!res.ok) {
          console.error('Checkout failed', await res.text());
          alert('A server error occurred creating your checkout. Please try again.');
          return;
        }
        const data = await res.json();
        if (!data?.url) {
          alert('Could not start checkout. Please try again.');
          return;
        }
        window.location.assign(data.url);
      } catch (e) {
        console.error(e);
        alert('Network error creating checkout. Please try again.');
      } finally {
        btnCheckout.disabled = false;
        btnCheckout.textContent = prev;
      }
    });
  }

  // ---- Init ----
  prefillForm();
  (function renderInitialTotals() {
    const items = loadCart();
    const sub = computeSubtotal(items);
    if (subtotalEl) subtotalEl.textContent = fmtMoney(sub);
    if (shipEl)     shipEl.textContent     = fmtMoney(getChosenRate()?.amount || 0);
    if (grandEl)    grandEl.textContent    = fmtMoney(sub + (getChosenRate()?.amount || 0));
    updateBadge(items);
  })();
})();
