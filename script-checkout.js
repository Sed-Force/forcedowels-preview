/* MASTER: /public/script-checkout.js
   Standalone checkout page:
   - reads cart (fd_cart)
   - lets customer enter destination
   - fetches live rates from /api/shipping/quote
   - stores chosen rate (fd_ship_quote)
   - starts Stripe via /api/checkout
*/
(function () {
  // ---------- storage keys ----------
  const K_CART = 'fd_cart';
  const K_DEST = 'fd_dest';
  const K_RATE = 'fd_ship_quote';

  // ---------- pricing ----------
  const BULK_MIN = 5000, BULK_MAX = 960000, BULK_STEP = 5000;
  const unitCents = (u)=> u>=160000?6300 : u>=20000?6750 : 7200;

  // ---------- dom ----------
  const $ = (s, r=document)=> r.querySelector(s);
  const ratesBox = $('#rates');
  const statusEl = $('#carrier-status');
  const sumItems = $('#sum-items');
  const elSubtotal = $('#sum-subtotal');
  const elShip = $('#sum-shipping');
  const elTotal = $('#sum-total');
  const btnRates = $('#btn-get-rates');
  const btnUseSaved = $('#btn-use-saved');
  const btnCheckout = $('#btn-checkout');

  const fName = $('#ship-name');
  const fStreet = $('#ship-street');
  const fCity = $('#ship-city');
  const fState = $('#ship-state');
  const fPostal = $('#ship-postal');
  const fCountry = $('#ship-country');

  // ---------- helpers ----------
  const money = n => (Number(n)||0).toLocaleString('en-US',{style:'currency',currency:'USD'});

  function loadCart(){
    try{ return JSON.parse(localStorage.getItem(K_CART)||'[]') }catch{ return [] }
  }
  function saveDest(d){ localStorage.setItem(K_DEST, JSON.stringify(d)); }
  function loadDest(){
    try{ return JSON.parse(localStorage.getItem(K_DEST)||'null') }catch{ return null }
  }
  function saveRate(r){ localStorage.setItem(K_RATE, JSON.stringify(r||null)); }
  function loadRate(){ try{ return JSON.parse(localStorage.getItem(K_RATE)||'null') }catch{ return null } }

  function subtotal(items){
    let cents = 0;
    for(const it of items){
      if(it.type==='bulk'){ cents += unitCents(it.units)*it.units; }
      else if(it.type==='kit'){ cents += 3600*it.qty; }
    }
    return cents/100;
  }

  // ---------- states/provinces ----------
  const US = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
  const CA = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];
  const MX = []; // UPS accepts blank; you can add full list later

  function fillStates(country, selected){
    const list = country==='CA'?CA : country==='US'?US : MX;
    fState.innerHTML = '';
    if(list.length===0){
      const opt=document.createElement('option'); opt.value=''; opt.textContent='—';
      fState.appendChild(opt);
      return;
    }
    list.forEach(code=>{
      const o=document.createElement('option'); o.value=code; o.textContent=code;
      if(selected===code) o.selected = true;
      fState.appendChild(o);
    });
  }

  function readDestFromForm(){
    return {
      name: fName.value.trim(),
      street: fStreet.value.trim(),
      city: fCity.value.trim(),
      state: fState.value.trim(),
      postal: fPostal.value.trim(),
      country: fCountry.value
    };
  }

  function hydrateForm(){
    const d = loadDest() || {country:'US'};
    fName.value = d.name||'';
    fStreet.value = d.street||'';
    fCity.value = d.city||'';
    fPostal.value = d.postal||'';
    fCountry.value = d.country||'US';
    fillStates(fCountry.value, (d.state||'').toUpperCase());
  }

  // ---------- summary ----------
  function renderSummary(){
    const items = loadCart();
    if(items.length===0){ window.location.href='/order.html'; return; }

    const units = items.filter(i=>i.type==='bulk').reduce((a,b)=>a+(+b.units||0),0);
    const kits  = items.filter(i=>i.type==='kit').reduce((a,b)=>a+(+b.qty||0),0);
    const pieces = [];
    if(units>0) pieces.push(`${units.toLocaleString()} dowels`);
    if(kits>0) pieces.push(`${kits} kit${kits>1?'s':''}`);
    sumItems.textContent = pieces.join(' • ') || '—';

    const sub = subtotal(items);
    elSubtotal.textContent = money(sub);

    const rate = loadRate();
    elShip.textContent = money(rate?.amount||0);
    elTotal.textContent = money(sub + (rate?.amount||0));
  }

  // ---------- rates UI ----------
  function groupRates(rates){
    const g = { UPS:[], USPS:[], TQL:[], OTHER:[] };
    for(const r of rates){
      const k = (r.carrier||'OTHER').toUpperCase();
      (g[k] || g.OTHER).push(r);
    }
    // cheapest first in each group
    for(const k in g){ g[k].sort((a,b)=>a.amount-b.amount); }
    return g;
  }

  function renderRates(rates, status){
    ratesBox.innerHTML = '';
    statusEl.innerHTML = '';

    // carrier status line
    if(status){
      const s = [];
      if(status.ups)  s.push(`UPS: ${status.ups.available?'available':'unavailable'}${status.ups.message?` — ${status.ups.message}`:''}`);
      if(status.usps) s.push(`<br>USPS: ${status.usps.available?'available':'unavailable'}${status.usps.message?` — ${status.usps.message}`:''}`);
      if(status.tql)  s.push(`<br>TQL: ${status.tql.available?'available':'unavailable'}${status.tql.message?` — ${status.tql.message}`:''}`);
      statusEl.innerHTML = s.join('');
    }

    if(!rates || rates.length===0){
      ratesBox.innerHTML = `<div class="muted">No live rates returned. Double-check the address and try again.</div>`;
      saveRate(null);
      renderSummary();
      return;
    }

    const groups = groupRates(rates);
    const order = ['USPS','UPS','TQL','OTHER'];

    let firstRadio = null;

    order.forEach(label=>{
      const list = groups[label];
      if(!list || list.length===0) return;

      const panel = document.createElement('div');
      panel.className='rate-group';
      panel.innerHTML = `
        <div class="head">
          <span class="pill">${label}</span>
          <span class="kicker">${list.length} option${list.length>1?'s':''}</span>
        </div>
      `;
      list.forEach((r,i)=>{
        const id = `rate-${label}-${i}`;
        const row = document.createElement('div');
        row.className='rate-row';
        row.innerHTML = `
          <label for="${id}">
            <input type="radio" name="shiprate" id="${id}">
            <span>${r.service || ''}</span>
          </label>
          <span class="price">${money(r.amount||0)}</span>
        `;
        const radio = row.querySelector('input');
        radio.addEventListener('change', ()=>{
          saveRate(r);
          renderSummary();
        });
        panel.appendChild(row);
        if(!firstRadio){ firstRadio = radio; }
      });

      ratesBox.appendChild(panel);
    });

    // auto-select cheapest overall
    if(firstRadio){ firstRadio.checked = true; firstRadio.dispatchEvent(new Event('change')); }
  }

  async function fetchWithTimeout(url, opts={}, ms=20000){
    const ctl=new AbortController(); const id=setTimeout(()=>ctl.abort(),ms);
    try{ return await fetch(url,{...opts, signal:ctl.signal}); } finally{ clearTimeout(id); }
  }

  async function getRates(){
    const dest = readDestFromForm();
    // basic validation
    if(!dest.postal || !dest.city || !dest.country){
      alert('Please complete City, State/Province (if applicable), ZIP/Postal and Country.');
      return;
    }
    // persist dest
    saveDest(dest);

    const items = loadCart();
    if(items.length===0){ alert('Your cart is empty.'); return; }

    btnRates.disabled = true; const prev = btnRates.textContent; btnRates.textContent='Getting rates…';
    try{
      const res = await fetchWithTimeout('/api/shipping/quote', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ destination: dest, items })
      }, 25000);

      if(!res.ok){
        const t = await res.text();
        console.error('Quote failed', t);
        alert('Could not get shipping rates. Please try again.');
        return;
      }
      const data = await res.json();
      renderRates(data.rates||[], data.status||{});
    }catch(e){
      console.error(e);
      alert(e.name==='AbortError'?'Timed out getting rates. Try again.':'Network error getting rates.');
    }finally{
      btnRates.disabled=false; btnRates.textContent = prev;
    }
  }

  // ---------- events ----------
  fCountry.addEventListener('change', ()=>{
    fillStates(fCountry.value, '');
  });
  [fName,fStreet,fCity,fState,fPostal,fCountry].forEach(el=>{
    el.addEventListener('change', ()=> saveDest(readDestFromForm()));
  });

  btnRates.addEventListener('click', getRates);
  btnUseSaved.addEventListener('click', ()=>{
    const d = loadDest(); if(!d){ alert('No saved address yet.'); return; }
    hydrateForm(); // re-fill
  });

  btnCheckout.addEventListener('click', async ()=>{
    const items = loadCart();
    if(items.length===0){ alert('Your cart is empty.'); return; }
    const rate = loadRate();
    if(!rate){ alert('Please choose a shipping option first.'); return; }

    btnCheckout.disabled = true; const prev = btnCheckout.textContent; btnCheckout.textContent='Loading…';
    try{
      const res = await fetchWithTimeout('/api/checkout', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ items, shipping:{ carrier:rate.carrier, service:rate.service, amount:rate.amount, currency: rate.currency||'USD' } })
      }, 20000);
      if(!res.ok){
        console.error(await res.text());
        alert('A server error occurred creating your checkout.');
        return;
      }
      const data = await res.json();
      if(!data?.url){ alert('Could not start checkout.'); return; }
      window.location.assign(data.url);
    }catch(e){
      console.error(e); alert('Network error creating checkout.');
    }finally{
      btnCheckout.disabled=false; btnCheckout.textContent=prev;
    }
  });

  // ---------- boot ----------
  hydrateForm();
  renderSummary();
})();
