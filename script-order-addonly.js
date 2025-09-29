/* Force Dowels — Order page: add-only behavior (no Stripe on this page) */
(function () {
  const LS_KEY = 'fd_cart';
  const STEP = 5000;
  const MAX = 960000;

  const money = n => (n || 0).toLocaleString('en-US', {style:'currency', currency:'USD'});

  function load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch { return []; }
  }
  function save(items) {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
    // header badge
    const badge = document.getElementById('cart-count');
    if (badge) {
      const count = items.reduce((n,i)=> n + (i.type==='kit' ? i.qty : (i.type==='bulk' && i.units ? 1 : 0)), 0);
      badge.textContent = count ? String(count) : '';
    }
  }
  const clampUnits = u => {
    u = Math.round((+u||0)/STEP)*STEP;
    return Math.max(0, Math.min(MAX, u));
  };

  function addBulk(units) {
    units = clampUnits(units);
    if (!units) return;
    const cart = load();
    const bulk = cart.find(i => i.type==='bulk');
    if (bulk) bulk.units = clampUnits((bulk.units||0) + units);
    else cart.push({ type:'bulk', units });
    save(cart);
  }
  function addKit(qty=1) {
    qty = Math.max(1, qty|0);
    const cart = load();
    const kit = cart.find(i => i.type==='kit');
    if (kit) kit.qty += qty;
    else cart.push({ type:'kit', qty });
    save(cart);
  }

  // Neutralize any old listeners that jump to Stripe
  const addBtn = document.getElementById('btn-add-to-cart')
             || document.getElementById('add-bulk')
             || document.getElementById('btn-add-only');
  if (addBtn) {
    const clone = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(clone, addBtn);
    clone.addEventListener('click', function (e) {
      e.preventDefault(); e.stopImmediatePropagation();
      const input = document.getElementById('qty-units') || document.getElementById('qty');
      const units = input ? parseInt(input.value, 10) : 5000;
      addBulk(units);
      const prev = clone.textContent;
      clone.textContent = 'Added!';
      setTimeout(()=> clone.textContent = prev || 'Add to Cart', 900);
    }, true);
  }

  // Starter kit button (if present)
  const kitBtn = document.getElementById('starter-kit');
  if (kitBtn) {
    kitBtn.addEventListener('click', function (e) {
      e.preventDefault();
      addKit(1);
      kitBtn.classList.add('pulse');
      setTimeout(()=> kitBtn.classList.remove('pulse'), 450);
    });
  }

  // View Cart → /cart.html
  const view = document.querySelector('.viewcart a, #link-view-cart');
  if (view) view.setAttribute('href', '/cart.html');

  // Also force header cart to go to /cart.html
  const headerCart = document.getElementById('btn-cart');
  if (headerCart) {
    headerCart.href = '/cart.html';
    headerCart.onclick = function(){ window.location='/cart.html'; return false; };
  }
})();
