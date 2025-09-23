/* Clerk mount (kept safe) */
window.addEventListener('load', async () => {
  try {
    if (window.Clerk) {
      await window.Clerk.load();
      const userBtn = document.getElementById('user-button');
      if (window.Clerk.user && userBtn) {
        window.Clerk.mountUserButton(userBtn);
        document.body.classList.add('authed');
      }
    }
  } catch (_) {}
});

/* ===== Slider (kept from home page; safe if not present) ===== */
(function () {
  const viewport = document.getElementById('fd-viewport');
  if (!viewport) return;
  const slides = Array.from(viewport.querySelectorAll('.slide'));
  const dots = Array.from(document.querySelectorAll('.slider .dot'));
  const prevBtn = document.querySelector('.slider .prev');
  const nextBtn = document.querySelector('.slider .next');
  let index = 0, timer = null, AUTOPLAY_MS = 4500;
  function goTo(i){ index=(i+slides.length)%slides.length; viewport.style.transform=`translateX(-${index*100}%)`;
    slides.forEach((s,idx)=>s.classList.toggle('is-active',idx===index));
    dots.forEach((d,idx)=>{ d.classList.toggle('is-active',idx===index); d.setAttribute('aria-selected', idx===index?'true':'false'); });
  }
  function next(){ goTo(index+1);} function prev(){ goTo(index-1);}
  dots.forEach(d=>d.addEventListener('click',()=>{ const i=+d.dataset.slide||0; goTo(i); restart();}));
  if (nextBtn) nextBtn.addEventListener('click', ()=>{ next(); restart();});
  if (prevBtn) prevBtn.addEventListener('click', ()=>{ prev(); restart();});
  function start(){ timer=setInterval(next, AUTOPLAY_MS);} function stop(){ if(timer) clearInterval(timer); timer=null;} function restart(){ stop(); start();}
  const slider=document.querySelector('.slider'); if(slider){ slider.addEventListener('mouseenter',stop); slider.addEventListener('mouseleave',start);}
  let sx=0, dx=0;
  viewport.addEventListener('touchstart',e=>{ if(e.touches.length!==1) return; sx=e.touches[0].clientX; dx=0; stop(); },{passive:true});
  viewport.addEventListener('touchmove',e=>{ if(e.touches.length!==1) return; dx=e.touches[0].clientX-sx; },{passive:true});
  viewport.addEventListener('touchend',()=>{ const t=40; if(dx>t) prev(); else if(dx<-t) next(); restart();});
  goTo(0); start();
})();

/* ===== Cart (client-side) ================================================ */
(function () {
  const cartEl = document.getElementById('cart');
  const openBtn = document.getElementById('btn-cart');
  if (!cartEl || !openBtn) return;

  const itemsEl = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('cart-subtotal');
  const closeBtn = cartEl.querySelector('.cart-close');
  const backdrop = cartEl.querySelector('.cart-backdrop');

  const fmt = (n)=> `$${n.toFixed(2)}`;
  const load = ()=> JSON.parse(localStorage.getItem('fd_cart') || '[]');
  const save = (data)=> localStorage.setItem('fd_cart', JSON.stringify(data));

  function open(){ cartEl.setAttribute('aria-hidden', 'false'); }
  function close(){ cartEl.setAttribute('aria-hidden', 'true'); }
  openBtn.addEventListener('click', (e)=>{ e.preventDefault(); open(); });
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);

  function addLine(item){
    const data = load();
    const idx = data.findIndex(x=>x.sku===item.sku);
    if (idx>-1) data[idx].qty += item.qty;
    else data.push(item);
    save(data);
    render();
    open();
  }

  function removeLine(sku){
    const data = load().filter(x=>x.sku!==sku);
    save(data); render();
  }

  function render(){
    const data = load();
    let subtotal = 0;
    itemsEl.innerHTML = '';
    data.forEach(line=>{
      subtotal += line.price * line.qty;
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = `
        <img src="${line.img}" alt="">
        <div>
          <h4>${line.name}</h4>
          <div class="meta">SKU: ${line.sku} · Qty: ${line.qty}</div>
        </div>
        <div style="text-align:right;">
          <div>${fmt(line.price*line.qty)}</div>
          <button class="remove" data-sku="${line.sku}">Remove</button>
        </div>`;
      itemsEl.appendChild(row);
    });
    subtotalEl.textContent = fmt(subtotal);
    itemsEl.querySelectorAll('.remove').forEach(btn=>{
      btn.addEventListener('click', ()=> removeLine(btn.dataset.sku));
    });
  }

  // Hook up product cards
  document.querySelectorAll('.product').forEach(card=>{
    const sku = card.dataset.sku;
    const name = card.dataset.name;
    const price = parseFloat(card.dataset.price);
    const img = card.querySelector('img')?.getAttribute('src') || '/images/og.jpg';
    const input = card.querySelector('input');
    card.querySelectorAll('.qty-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const delta = parseInt(btn.dataset.delta,10);
        const val = Math.max(1, (parseInt(input.value||'1',10) + delta));
        input.value = val;
      });
    });
    card.querySelector('.add-to-cart').addEventListener('click', ()=>{
      const qty = Math.max(1, parseInt(input.value||'1',10));
      addLine({ sku, name, price, qty, img });
    });
  });

  // Initial render
  render();
})();

/* ===== Order page logic: tiers + calculator ============================= */
(function () {
  const tiers = document.querySelectorAll('.tier');
  const qtyInput = document.getElementById('qty');
  const ppuEl = document.getElementById('ppu');
  const totalEl = document.getElementById('total');
  const addBulkBtn = document.getElementById('add-bulk');
  const starterKitBtn = document.getElementById('starter-kit');

  if (!qtyInput || !ppuEl || !totalEl) return;

  // Current active tier (defaults to the one marked active)
  let active = document.querySelector('.tier.active');
  let ppu = parseFloat(active?.dataset.price || '0.072');
  let min = parseInt(active?.dataset.min || '5000', 10);
  let max = parseInt(active?.dataset.max || '20000', 10);

  function clampToStep(v) {
    const step = 5000;
    v = Math.round(v / step) * step;
    v = Math.max(5000, Math.min(960000, v));
    return v;
  }

  function syncPrice() {
    const q = clampToStep(parseInt(qtyInput.value || '5000', 10));
    qtyInput.value = q;

    // If quantity leaves this tier's bounds, keep the price from active tier (like screenshot).
    const total = q * ppu;
    ppuEl.textContent = `$${ppu.toFixed(3)}`;
    totalEl.textContent = `$${total.toFixed(2)}`;
  }

  tiers.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('locked') || btn.disabled) return;
      tiers.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      active = btn;
      ppu = parseFloat(btn.dataset.price);
      min = parseInt(btn.dataset.min, 10);
      max = parseInt(btn.dataset.max, 10);
      // Snap qty into the selected tier range
      let q = parseInt(qtyInput.value || '5000', 10);
      if (q < min) q = min;
      if (q > max) q = max;
      qtyInput.value = q;
      syncPrice();
    });
  });

  // Step buttons
  document.querySelectorAll('.qtywrap .step').forEach(b => {
    b.addEventListener('click', () => {
      const delta = parseInt(b.dataset.delta, 10);
      let q = parseInt(qtyInput.value || '5000', 10);
      q = clampToStep(q + delta);
      qtyInput.value = q;
      syncPrice();
    });
  });

  qtyInput.addEventListener('change', syncPrice);
  syncPrice();

  // Add bulk to cart (uses the cart code already in script.js)
  if (addBulkBtn) {
    addBulkBtn.addEventListener('click', () => {
      const q = parseInt(qtyInput.value || '5000', 10);
      const item = {
        sku: `FD-8MM-BULK-${q}`,
        name: `Force Dowels — Bulk (${q.toLocaleString()} units)`,
        price: ppu * q, // store as line price; cart UI shows subtotal anyway
        qty: 1,
        img: '/images/slider-3.jpg'
      };
      // Reuse cart helpers if present:
      try {
        const data = JSON.parse(localStorage.getItem('fd_cart') || '[]');
        data.push(item);
        localStorage.setItem('fd_cart', JSON.stringify(data));
        // open cart
        const cart = document.getElementById('cart');
        if (cart) cart.setAttribute('aria-hidden', 'false');
        // trigger re-render if our cart UI is on this page
        const evt = new Event('storage'); window.dispatchEvent(evt);
      } catch (_) {}
    });
  }

  // Starter kit add to cart
  if (starterKitBtn) {
    starterKitBtn.addEventListener('click', () => {
      const item = {
        sku: starterKitBtn.dataset.sku,
        name: starterKitBtn.dataset.name,
        price: parseFloat(starterKitBtn.dataset.price),
        qty: 1,
        img: '/images/slider-5.jpg'
      };
      try {
        const data = JSON.parse(localStorage.getItem('fd_cart') || '[]');
        data.push(item);
        localStorage.setItem('fd_cart', JSON.stringify(data));
        const cart = document.getElementById('cart');
        if (cart) cart.setAttribute('aria-hidden', 'false');
        const evt = new Event('storage'); window.dispatchEvent(evt);
      } catch (_) {}
    });
  }
})();

// === Clerk auth wiring (robust) ===
(async function initClerkAuth() {
  // Wait for Clerk script tag to load
  if (!window.Clerk) {
    await new Promise((resolve) => {
      const t = setInterval(() => {
        if (window.Clerk) { clearInterval(t); resolve(); }
      }, 50);
    });
  }

  try {
    await window.Clerk.load();
  } catch (e) {
    console.error('[Clerk] load() failed:', e);
    // If load fails, the redirect flows below will still work (they don’t need the modal)
  }

  const $ = (s) => document.querySelector(s);
  const authWrap   = document.querySelector('.auth-buttons');
  const btnLogin   = $('#btn-login');
  const btnSignup  = $('#btn-signup');
  const btnSignout = $('#btn-signout'); // optional
  const userMount  = $('#user-button');

  function render() {
    const user = window.Clerk?.user;
    const session = window.Clerk?.session;
    const signedIn = !!(user && session);

    if (authWrap)  authWrap.style.display  = signedIn ? 'none' : '';
    if (btnSignout) btnSignout.style.display = signedIn ? '' : 'none';

    if (signedIn) {
      if (userMount && !userMount.hasChildNodes() && window.Clerk?.mountUserButton) {
        window.Clerk.mountUserButton(userMount);
      }
      document.body.classList.add('authed');
    } else {
      if (userMount) userMount.replaceChildren();
      document.body.classList.remove('authed');
    }
  }

  // Re-render on Clerk state changes
  if (window.Clerk?.addListener) window.Clerk.addListener(render);
  render();

  // Helpers: prefer modal, fall back to redirect (hosted pages)
  const goSignIn = () => {
    if (window.Clerk?.openSignIn) {
      window.Clerk.openSignIn({ afterSignInUrl: window.location.href });
    } else if (window.Clerk?.redirectToSignIn) {
      window.Clerk.redirectToSignIn({ returnBackUrl: window.location.href });
    } else {
      console.error('[Clerk] No sign-in methods available.');
    }
  };

  const goSignUp = () => {
    if (window.Clerk?.openSignUp) {
      window.Clerk.openSignUp({ afterSignUpUrl: window.location.href });
    } else if (window.Clerk?.redirectToSignUp) {
      window.Clerk.redirectToSignUp({ returnBackUrl: window.location.href });
    } else {
      console.error('[Clerk] No sign-up methods available.');
    }
  };

  if (btnLogin)  btnLogin.onclick  = goSignIn;
  if (btnSignup) btnSignup.onclick = goSignUp;
  if (btnSignout) btnSignout.onclick = () => window.Clerk?.signOut?.();

  // Dev helper: test the protected API
  window.__pingProtected = async function () {
    try {
      const token = await window.Clerk?.session?.getToken({ skipCache: true });
      const res = await fetch('/api/protected', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const text = await res.text();
      try { return { status: res.status, body: JSON.parse(text) }; }
      catch { return { status: res.status, body: text }; }
    } catch (e) {
      return { error: true, message: e?.message || String(e) };
    }
  };
})();

// /script.js — CONTACT FORM MASTER BLOCK (drop-in, replace previous)
(function wireContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  // Avoid double-binding if scripts reload
  if (form.dataset.fdBound === '1') return;
  form.dataset.fdBound = '1';

  // Reuse an existing .form-note if present
  let note = form.querySelector('.form-note');
  if (!note) {
    note = document.createElement('p');
    note.className = 'form-note';
    form.appendChild(note);
  }

  const submitBtn = form.querySelector('button[type="submit"]');

  const setNote = (msg, type = 'info') => {
    note.textContent = msg;
    note.style.display = 'block';
    note.classList.remove('is-error', 'is-success', 'is-info');
    note.classList.add(type === 'error' ? 'is-error' : type === 'success' ? 'is-success' : 'is-info');
  };

  async function onSubmit(e) {
    // Block any legacy handlers (including inline onsubmit) from running
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    setNote('Sending…', 'info');
    submitBtn && (submitBtn.disabled = true);

    const data = Object.fromEntries(new FormData(form).entries());

    // Attach Clerk token when available (optional)
    let headers = { 'Content-Type': 'application/json' };
    try {
      const token = await window.Clerk?.session?.getToken({ skipCache: true });
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {}

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || json.error) {
        throw new Error(json.error || res.statusText || 'Failed to send');
      }

      setNote('Thanks! Your message was sent successfully.', 'success');
      form.reset();
    } catch (err) {
      setNote(`Something went wrong. Please email info@forcedowels.com. (${err.message || err})`, 'error');
    } finally {
      submitBtn && (submitBtn.disabled = false);
    }
  }

  // Use capture so we can stop older target/bubble listeners from firing
  form.addEventListener('submit', onSubmit, { capture: true });
})();
