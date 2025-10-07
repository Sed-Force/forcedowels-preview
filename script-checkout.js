/* MASTER: /public/script-checkout.js
   Checkout page logic:
   - Proper State/Province SELECT that updates per country (US/CA/MX)
   - Live rates via /api/shipping/quote
   - Subtotal computed from cart (fd_cart) using tiered pricing
   - Persists destination in localStorage 'fd_dest'
   - Persists chosen rate in localStorage 'fd_ship_quote'
*/

(function () {
  // ---- Storage keys ----
  const KEY_CART  = 'fd_cart';
  const KEY_DEST  = 'fd_dest';
  const KEY_RATE  = 'fd_ship_quote';

  // ---- Bulk pricing (match server + cart) ----
  const BULK_MIN = 5000, BULK_MAX = 960000, BULK_STEP = 5000;
  const unitPriceCentsFor = (units) => {
    if (units >= 160000) return Math.round(0.063 * 100);   // $0.0630
    if (units >= 20000)  return Math.round(0.0675 * 100);  // $0.0675
    return Math.round(0.072 * 100);                        // $0.0720
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

  // ---- Data: states/provinces ----
  const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
  ];
  const CA_PROV = ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'];
  // MX full list (UPS accepts empty but we provide a selector)
  const MX_STATES = [
    'AG','BC','BS','CM','CS','CH','CO','CL','DG','GJ','GR','HG','JA','MX','MC','MR','NA','NL','OA','PU','QE','QR','SL','SI','SO','TB','TM','TL','VE','YU','ZA'
  ];

  function populateStateOptions(country, selected) {
    stateSel.innerHTML = ''; // clear
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

    if (selected && list.includes(selected)) {
      stateSel.value = selected;
    } else {
      stateSel.value = '';
    }
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
        cents += unitPriceCentsFor(it.units) * it.units;
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
    // clear previously chosen rate on country change
    setChosenRate(null);
    renderRates([]);
    recalcTotals();
  });

  [stateSel, cityInp, postalInp, streetInp].forEach(el => {
    el.addEventListener('change', () => {
      setChosenRate(null);
      renderRates([]);
      recalcTotals();
    });
  });

  // ---- Rates ----
  async function fetchWithTimeout(url, opts={}, ms=20000) {
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
      street:  streetInp.value.trim(),
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

  function renderRates(rates) {
    ratesList.innerHTML = '';
    if (!rates || rates.length === 0) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'No rates yet. Enter address and click “Get Rates”.';
      ratesList.appendChild(li);
      return;
    }

    rates.forEach((r, i) => {
      const id = `rate-${i}`;
      const li = document.createElement('li');
      li.className = 'rate-row';

      // Group-like label: CARRIER — service text — price
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

    // Auto-select first (cheapest expected)
    setChosenRate(rates[0]);
    recalcTotals();
  }

  if (btnRates) {
    btnRates.addEventListener('click', async () => {
      const dest = currentDestFromForm();

      // persist
      setDest(dest);
      setChosenRate(null);
      renderRates([]);
      recalcTotals();

      // basic validation
      if (!dest.city || !dest.postal || !dest.street) {
        alert('Please complete street, city, and postal code.');
        return;
      }

      const items = loadCart();
      if (!items.length) {
        alert('Your cart is empty.');
        return;
      }

      // UI
      const prev = btnRates.textContent;
      btnRates.disabled = true;
      btnRates.textContent = 'Getting rates…';

      try {
        const res = await fetchWithTimeout('/api/shipping/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination: dest, items }),
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

      // keep destination persisted
      setDest(currentDestFromForm());

      // UI
      const prev = btnCheckout.textContent;
      btnCheckout.disabled = true;
      btnCheckout.textContent = 'Loading…';

      try {
        const res = await fetchWithTimeout('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            shipping: { carrier: rate.carrier, service: rate.service, amount: rate.amount, currency: rate.currency || 'USD' },
          }),
        }, 20000);

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
  recalcTotals();
})();
