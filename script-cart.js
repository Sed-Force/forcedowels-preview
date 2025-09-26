// /script-cart.js
// Renders the cart page, edits quantities, and kicks off Stripe Checkout.

(function () {
  const CART_KEY = 'fd_cart'; // same storage used on order page

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const money = n => `$${(Number(n)||0).toFixed(2)}`;

  const getCart = () => {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch { return []; }
  };
  const setCart = items => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    updateHeaderCount(items);
  };
  const updateHeaderCount = (items=getCart()) => {
    const el = $('#cart-count');
    if (!el) return;
    const qty = items.reduce((s,i)=>s+Number(i.qty||0),0);
    el.textContent = qty>0 ? qty : '';
  };

  const consolidate = items => {
    const map = new Map();
    for (const it of items) {
      const key = it.sku || it.id || it.name;
      if (!map.has(key)) map.set(key, { ...it });
      else map.get(key).qty += Number(it.qty||0);
    }
    return [...map.values()];
  };

  const calcSubtotal = items =>
    items.reduce((s, i) => s + Number(i.unitPrice||0) * Number(i.qty||0), 0);

  function render() {
    const list = $('#cart-list');
    const sumSub = $('#sum-subtotal');
    const sumTot = $('#sum-total');
    const btnCheckout = $('#btn-checkout');

    const items = getCart();
    updateHeaderCount(items);

    if (!items.length) {
      list.innerHTML = `<p class="muted">Your cart is empty.</p>`;
      sumSub.textContent = money(0);
      sumTot.textContent = money(0);
      btnCheckout.disabled = true;
      return;
    }

    list.innerHTML = items.map((it, idx) => `
      <div class="cart-row" data-idx="${idx}">
        <div class="line-left">
          <div>
            <div style="font-weight:600">${it.name || 'Item'}</div>
            ${it.meta ? `<div class="muted">${it.meta}</div>` : ''}
            ${it.unitPrice ? `<div class="muted">$${Number(it.unitPrice).toFixed(3)} per unit</div>` : ''}
          </div>
        </div>

        <div class="qtywrap">
          <button class="btn-step" data-delta="-1" aria-label="Decrease">–</button>
          <input class="qty" type="number" min="1" step="1" value="${it.qty||1}">
          <button class="btn-step" data-delta="1" aria-label="Increase">+</button>
        </div>

        <div class="price">${money((it.unitPrice||0) * (it.qty||0))}</div>
        <div class="trash" title="Remove" aria-label="Remove" role="button">🗑</div>
      </div>
    `).join('');

    const subtotal = calcSubtotal(items);
    sumSub.textContent = money(subtotal);
    sumTot.textContent = money(subtotal);
    btnCheckout.disabled = false;

    // wire row controls
    $$('#cart-list .cart-row').forEach(row => {
      const idx = Number(row.dataset.idx);
      const minus = $('.btn-step[data-delta="-1"]', row);
      const plus  = $('.btn-step[data-delta="1"]', row);
      const qtyIn = $('.qty', row);
      const del   = $('.trash', row);

      minus.addEventListener('click', () => {
        const items = getCart();
        items[idx].qty = Math.max(1, Number(items[idx].qty||1) - 1);
        setCart(items);
        render();
      });
      plus.addEventListener('click', () => {
        const items = getCart();
        items[idx].qty = Number(items[idx].qty||1) + 1;
        setCart(items);
        render();
      });
      qtyIn.addEventListener('change', () => {
        const items = getCart();
        items[idx].qty = Math.max(1, parseInt(qtyIn.value||'1',10));
        setCart(items);
        render();
      });
      del.addEventListener('click', () => {
        const items = getCart();
        items.splice(idx,1);
        setCart(items);
        render();
      });
    });
  }

  async function checkout() {
    const items = getCart();
    if (!items.length) return;

    // only send sku + qty to server (server maps skus to Stripe prices)
    const resp = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ items: items.map(i => ({ sku: i.sku, qty: i.qty })) })
    });
    const data = await resp.json().catch(()=> ({}));
    if (!resp.ok || !data?.url) {
      alert('Sorry, something went wrong starting checkout.');
      console.error('Checkout error', data);
      return;
    }
    location.href = data.url;
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    $('#btn-clear')?.addEventListener('click', () => { localStorage.setItem(CART_KEY,'[]'); render(); });
    $('#btn-merge')?.addEventListener('click', () => { setCart(consolidate(getCart())); render(); });
    $('#btn-checkout')?.addEventListener('click', checkout);
  });
})();

