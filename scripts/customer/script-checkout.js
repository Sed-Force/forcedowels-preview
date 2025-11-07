/* MASTER: /public/script-checkout.js
   Checkout page logic with cheapest-first sorting + styled selection state.
*/
(function () {
  const KEY_CART='fd_cart', KEY_DEST='fd_dest', KEY_RATE='fd_ship_quote';
  const BULK_MIN=5000, BULK_MAX=960000, BULK_STEP=5000;
  const unitPriceFor = (u)=> (u>=160000?0.0630:(u>=20000?0.0675:0.0720));
  const fmtMoney = (n)=> (Number(n)||0).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2});
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

  const companyInp=$('#ship-company'), contactInp=$('#ship-contact'), emailInp=$('#ship-email'), phoneInp=$('#ship-phone');
  const countrySel=$('#ship-country'), stateSel=$('#ship-state'), cityInp=$('#ship-city'), postalInp=$('#ship-postal'), streetInp=$('#ship-street');
  const btnRates=$('#btn-get-rates'), ratesList=$('#rates-list');
  const subtotalEl=$('#summary-subtotal'), shipEl=$('#summary-shipping'), grandEl=$('#summary-grand');
  const btnCheckout=$('#btn-checkout'), badgeEl=$('#cart-count');

  const US_STATES=['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
  const CA_PROV=['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'];
  const MX_STATES=['AG','BC','BS','CM','CS','CH','CO','CL','DG','GJ','GR','HG','JA','MX','MC','MR','NA','NL','OA','PU','QE','QR','SL','SI','SO','TB','TM','TL','VE','YU','ZA'];

  function populateStateOptions(country, selected){
    stateSel.innerHTML='';
    const frag=document.createDocumentFragment();
    const first=document.createElement('option'); first.value=''; first.textContent='Select…'; frag.appendChild(first);
    let list=[]; if(country==='US') list=US_STATES; else if(country==='CA') list=CA_PROV; else if(country==='MX') list=MX_STATES;
    list.forEach(c=>{const o=document.createElement('option'); o.value=c; o.textContent=c; frag.appendChild(o);});
    stateSel.appendChild(frag);
    if(selected && list.includes(selected)) stateSel.value=selected;
  }

  function loadCart(){
    try{
      const raw=localStorage.getItem(KEY_CART); const arr=raw?JSON.parse(raw):[];
      return arr.map(it=>{
        if(it?.type==='bulk'){ let u=Number(it.units||0); if(!Number.isFinite(u)||u<BULK_MIN)u=BULK_MIN; if(u>BULK_MAX)u=BULK_MAX; u=Math.round(u/BULK_STEP)*BULK_STEP; return {type:'bulk',units:u}; }
        if(it?.type==='kit'){ let q=Number(it.qty||0); if(!Number.isFinite(q)||q<1)q=1; return {type:'kit',qty:q}; }
        if(it?.type==='test'){ return {type:'test',qty:1}; }
        return null;
      }).filter(Boolean);
    }catch{return [];}
  }
  function updateBadge(items){ if(!badgeEl)return; let t=0; for(const it of items){ if(it.type==='bulk')t+=it.units; else if(it.type==='kit')t+=(it.qty*300); else if(it.type==='test')t+=1; } badgeEl.textContent=t>0?t.toLocaleString():''; badgeEl.style.display=t>0?'inline-block':'none'; }
  function computeSubtotal(items){ let c=0; for(const it of items){ if(it.type==='bulk') c+=Math.round(unitPriceFor(it.units)*it.units*100); else if(it.type==='kit') c+=3600*it.qty; else if(it.type==='test') c+=100; } return c/100; }
  function getDest(){ try{return JSON.parse(localStorage.getItem(KEY_DEST)||'{}');}catch{return{};} }
  function setDest(d){ localStorage.setItem(KEY_DEST, JSON.stringify(d||{})); }
  function getChosenRate(){ try{return JSON.parse(localStorage.getItem(KEY_RATE)||'null');}catch{return null;} }
  function setChosenRate(r){ localStorage.setItem(KEY_RATE, JSON.stringify(r||null)); }

  function prefillForm(){
    const d=getDest(); const c=(d.country||'US').toUpperCase();
    countrySel.value=c; populateStateOptions(c,(d.state||'').toUpperCase());
    cityInp.value=d.city||''; postalInp.value=d.postal||''; streetInp.value=d.street||'';
  }
  countrySel.addEventListener('change',()=>{ populateStateOptions(countrySel.value); setChosenRate(null); renderRates([],null); recalcTotals(); });
  [stateSel,cityInp,postalInp,streetInp].forEach(el=>el.addEventListener('change',()=>{ setChosenRate(null); renderRates([],null); recalcTotals(); }));

  async function fetchWithTimeout(url,opts={},ms=25000){ const ctl=new AbortController(); const id=setTimeout(()=>ctl.abort(),ms); try{ return await fetch(url,{...opts,signal:ctl.signal}); } finally{ clearTimeout(id); } }
  function currentDestFromForm(){ return { country:countrySel.value||'US', state:stateSel.value||'', city:cityInp.value.trim(), postal:postalInp.value.trim(), street:streetInp.value.trim() }; }
  function recalcTotals(){ const items=loadCart(); const sub=computeSubtotal(items); const rate=getChosenRate(); if(subtotalEl)subtotalEl.textContent=fmtMoney(sub); if(shipEl)shipEl.textContent=fmtMoney(rate?.amount||0); if(grandEl)grandEl.textContent=fmtMoney(sub+(rate?.amount||0)); updateBadge(items); }

  function renderRates(rates,status){
    ratesList.innerHTML='';
    const sorted = Array.isArray(rates) ? [...rates].sort((a,b)=>Number(a.amount||0)-Number(b.amount||0)) : [];

    if(sorted.length){
      sorted.forEach((r,i)=>{
        const id=`rate-${i}`;
        const li=document.createElement('li'); li.className='rate-row'+(i===0?' selected':'');
        li.innerHTML=`
          <label class="rate-option">
            <input type="radio" name="shiprate" id="${id}" ${i===0?'checked':''} aria-label="${(r.carrier||'')+' '+(r.service||'')+' '+(r.amount!=null?fmtMoney(r.amount):'')}">
            <span class="rate-carrier">${r.carrier||'Carrier'}</span>
            <span class="rate-service">${r.service||''}</span>
            <span class="rate-price">${fmtMoney(r.amount||0)}</span>
          </label>`;
        ratesList.appendChild(li);

        const radio = li.querySelector('input');
        radio.addEventListener('change', () => {
          // toggle selected class for styling
          $$('.rate-row', ratesList).forEach(n => n.classList.remove('selected'));
          li.classList.add('selected');
          setChosenRate(r);
          recalcTotals();
        });
      });
      // choose cheapest initially
      setChosenRate(sorted[0]);
      recalcTotals();
    }else{
      const li=document.createElement('li'); li.className='muted'; li.textContent='No rates yet. Enter address and click “Get Rates”.'; ratesList.appendChild(li);
    }

    if(status && typeof status==='object'){
      const s=document.createElement('li'); s.className='muted carrier-status';
      const ups=status.ups?(status.ups.available?`UPS: available — ${status.ups.message||''}`:`UPS: unavailable — ${status.ups.message||''}`):'';
      const usps=status.usps?(status.usps.available?`USPS: available — ${status.usps.message||''}`:`USPS: unavailable — ${status.usps.message||''}`):'';
      const tql=status.tql?(status.tql.available?`TQL: available`:`TQL: unavailable — ${status.tql.message||''}`):'';
      s.innerHTML=[ups,usps,tql].filter(Boolean).join('<br>');
      ratesList.appendChild(s);
    }
  }

  if(btnRates){
    btnRates.addEventListener('click', async ()=>{
      const dest=currentDestFromForm();
      setDest(dest); setChosenRate(null); renderRates([],null); recalcTotals();
      if(!dest.country || !dest.postal){ alert('Please enter a postal/ZIP code.'); return; }
      const items=loadCart(); if(!items.length){ alert('Your cart is empty.'); return; }

      const prev=btnRates.textContent; btnRates.disabled=true; btnRates.textContent='Getting rates…';
      try{
        const res=await fetchWithTimeout('/api/shipping/rates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:dest,items})});
        if(!res.ok){ console.error('Rates error',await res.text()); alert('Could not get shipping rates. Please try again.'); return; }
        const data=await res.json();
        // Convert new API format (priceCents) to old format (amount)
        const rates = (data?.rates || []).map(r => ({
          carrier: r.carrier,
          service: r.service,
          amount: r.priceCents / 100,
          currency: 'USD',
          serviceCode: r.serviceCode,
          estDays: r.estDays
        }));
        // Build status from errors if present
        const status = data?.errors ? {
          ups: data.errors.find(e => e.carrier === 'UPS') ? {available: false, message: data.errors.find(e => e.carrier === 'UPS').error} : null,
          usps: data.errors.find(e => e.carrier === 'USPS') ? {available: false, message: data.errors.find(e => e.carrier === 'USPS').error} : null,
          tql: data.errors.find(e => e.carrier === 'TQL') ? {available: false, message: data.errors.find(e => e.carrier === 'TQL').error} : null
        } : null;
        renderRates(rates, status);
      }catch(e){ console.error(e); alert(e.name==='AbortError'?'Timed out getting rates. Try again.':'Network error getting rates.'); }
      finally{ btnRates.disabled=false; btnRates.textContent=prev; }
    });
  }

  if(btnCheckout){
    btnCheckout.addEventListener('click', async ()=>{
      const items=loadCart(); if(!items.length){ alert('Your cart is empty.'); return; }

      // Validate email and phone
      const email = emailInp?.value?.trim();
      const phone = phoneInp?.value?.trim();
      if(!email){ alert('Please enter your email address.'); return; }
      if(!phone){ alert('Please enter your phone number.'); return; }

      // Check if cart contains only test order
      const isTestOnly = items.length === 1 && items[0].type === 'test';

      // Require shipping (skip for test orders only)
      const rate = getChosenRate();
      if(!rate && !isTestOnly){ alert('Please choose a shipping option first.'); return; }

      setDest(currentDestFromForm());

      const prev=btnCheckout.textContent; btnCheckout.disabled=true; btnCheckout.textContent='Loading…';
      try{
        const dest = currentDestFromForm();
        const company = companyInp?.value?.trim() || '';
        const contact = contactInp?.value?.trim() || '';
        const payload = {
          items,
          customerEmail: email,
          customerPhone: phone,
          customerName: company, // Use company name as primary name
          contactName: contact, // Contact person name
        };

        // Only add shipping address for non-test orders
        if(!isTestOnly) {
          payload.shippingAddress = {
            name: company || email, // Use company name, fallback to email
            line1: dest.street,
            city: dest.city,
            state: dest.state,
            postal_code: dest.postal,
            country: dest.country
          };
        }

        if(rate) payload.shipping = {carrier:rate.carrier,service:rate.service,amount:rate.amount,currency:rate.currency||'USD'};
        const res=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(!res.ok){ console.error('Checkout failed',await res.text()); alert('A server error occurred creating your checkout. Please try again.'); return; }
        const data=await res.json(); if(!data?.url){ alert('Could not start checkout. Please try again.'); return; }
        window.location.assign(data.url);
      }catch(e){ console.error(e); alert('Network error creating checkout. Please try again.'); }
      finally{ btnCheckout.disabled=false; btnCheckout.textContent=prev; }
    });
  }

  // Init
  prefillForm();
  (function initTotals(){ const items=loadCart(); const sub=computeSubtotal(items); if(subtotalEl)subtotalEl.textContent=fmtMoney(sub); if(shipEl)shipEl.textContent=fmtMoney(getChosenRate()?.amount||0); if(grandEl)grandEl.textContent=fmtMoney(sub+(getChosenRate()?.amount||0)); updateBadge(items); })();
})();
