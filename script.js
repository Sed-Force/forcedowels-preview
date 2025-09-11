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
