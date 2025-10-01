// /script-cart.js  (MASTER)
(function(){
  const FD_CART_KEY = 'fd_cart';

  // Price tiers based on TOTAL bulk units across cart
  function ppuFor(totalUnits) {
    if (totalUnits >= 160000) return 0.0630;
    if (totalUnits >= 20000)  return 0.0675;
    return 0.0720; // 5k–20k
  }
  const KIT_PRICE = 36.00;

  // ---- storage helpers ----
  function getCart() {
    try {
      const raw = localStorage.getItem(FD_CART_KEY);
      if (!raw) return [];
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      localStorage.removeItem(FD_CART_KEY);
      return [];
    }
  }
  function saveCart(items) {
    localStorage.setItem(FD_CART_KEY, JSON.stringify(items || []));
    updateBadge(items);
  }
  function updateBadge(items) {
    const el = document.getElementById('cart-count');
    if (!el) return;
    items = items || getCart();
    const totalQty = items.reduce((s, it) => s + (+it.qty || 0), 0);
    el.textContent = totalQty > 0 ? String(totalQty) : '';
  }

  // ---- rendering ----
  const listEl     = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('cart-subtotal');
  const emptyEl    = document.getElementById('cart-empty');
  const cardEl     = document.getElementById('cart-card');
  const checkoutBtn= document.getElementById('btn-checkout');
  const clearBtn   = document.getElementById('btn-clear');

  function fmt$(n)  { return '$' + (+n || 0).toFixed(2); }
  function fmt4$(n) { return '$' + (+n || 0).toFixed(4); }

  function totalBulkUnits(items) {
    return items
      .filter(it => it.type === 'bulk')
      .reduce((s, it) => s + ((+it.units || 0) * (+it.qty || 0)), 0);
  }

  function render() {
    const items = getCart();
    updateBadge(items);

    if (!listEl || !subtotalEl || !emptyEl || !cardEl) return;

    if (!items.length) {
      emptyEl.style.display = 'block';
      cardEl.style.display = 'none';
      subtotalEl.textContent = '$0.00';
      return;
    }

    emptyEl.style.display = 'none';
    cardEl.style.display = 'block';
    listEl.innerHTML = '';

    // Compute PPU once from TOTAL bulk units
    const totalUnits = totalBulkUnits(items);
    const ppu = ppuFor(totalUnits);

    let subtotal = 0;

    items.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'cart-row';

      const title = document.createElement('div');
      title.className = 'cart-title';

      const details = document.createElement('div');
      details.className = 'cart-details';

      const qtyWrap = document.createElement('div');
      qtyWrap.className = 'cart-qty';

      const price = document.createElement('div');
      price.className = 'cart-price';

      // Content per type
      if (it.type === 'bulk') {
        title.innerHTML = `<strong>Force Dowels — Bulk</strong>`;
        details.innerHTML =
          `${(+it.units || 0).toLocaleString()} units @ ${fmt4$(ppu)}/unit`;
        const lineTotal = (+it.units || 0) * (+it.qty || 1) * ppu;
        price.innerHTML = `<strong>${fmt$(lineTotal)}</strong>`;
        subtotal += lineTotal;
      } else {
        title.innerHTML = `<strong>Force Dowels Kit — 300 units</strong>`;
        details.textContent = `Fixed ${fmt$(KIT_PRICE)} each`;
        const lineTotal = (+it.qty || 1) * KIT_PRICE;
        price.innerHTML = `<strong>${fmt$(lineTotal)}</strong>`;
        subtotal += lineTotal;
      }

      // Qty controls (this is the number of identical orders, not units)
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'qty-btn';
      minus.textContent = '–';

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.step = '1';
      input.value = String(+it.qty || 1);

      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'qty-btn';
      plus.textContent = '+';

      qtyWrap.appendChild(minus);
      qtyWrap.appendChild(input);
      qtyWrap.appendChild(plus);

      // Remove button
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'cart-remove';
      remove.textContent = 'Remove';

      // Wire events
      minus.addEventListener('click', () => {
        let q = (+input.value || 1) - 1;
        if (q < 1) q = 1;
        input.value = String(q);
        it.qty = q;
        saveCart(items);
        render();
      });
      plus.addEventListener('click', () => {
        let q = (+input.value || 1) + 1;
        input.value = String(q);
        it.qty = q;
        saveCart(items);
        render();
      });
      input.addEventListener('change', () => {
        let q = Math.max(1, Math.floor(+input.value || 1));
        input.value = String(q);
        it.qty = q;
        saveCart(items);
        render();
      });
      remove.addEventListener('click', () => {
        const next = getCart().filter(x => x.id !== it.id);
        saveCart(next);
        render();
      });

      // Assemble row
      const left = document.createElement('div');
      left.className = 'cart-left';
      left.appendChild(title);
      left.appendChild(details);

      const right = document.createElement('div');
      right.className = 'cart-right';
      right.appendChild(qtyWrap);
      right.appendChild(price);
      right.appendChild(remove);

      row.appendChild(left);
      row.appendChild(right);

      listEl.appendChild(row);
    });

    subtotalEl.textContent = fmt$(subtotal);
  }

  // Clear cart
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm('Clear your cart?')) return;
      localStorage.removeItem(FD_CART_KEY);
      render();
    });
  }

  // Checkout → Stripe
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', async () => {
      const items = getCart();
      if (!items.length) return;

      checkoutBtn.disabled = true;
      const prev = checkoutBtn.textContent;
      checkoutBtn.textContent = 'Starting checkout…';

      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items })
        });
        if (!res.ok) throw new Error('Server error');
        const data = await res.json();
        if (data && data.url) {
          window.location.href = data.url;
        } else {
          alert('Checkout failed: No URL returned.');
        }
      } catch (e) {
        console.error(e);
        alert('Checkout failed. Please try again.');
      } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = prev;
      }
    });
  }

  // initial paint
  render();
})();

