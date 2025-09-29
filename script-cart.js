/* script-cart.js
   Handles:
   - Order page: Add to Cart for bulk + kit
   - Cart page: render cart, tiered pricing, edit qty, remove, checkout
*/

/* ---------- shared storage helpers ---------- */
const CART_KEY = 'fd_cart';

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateBadge(items);
}

function updateBadge(items = getCart()) {
  const countEl = document.getElementById('cart-count');
  if (!countEl) return;
  const totalUnits = items.reduce((sum, it) => {
    if (it.type === 'bulk') return sum + (it.units || 0);
    if (it.type === 'kit')  return sum + (it.qty || 0) * 300; // show “unitish” volume
    return sum;
  }, 0);
  countEl.textContent = totalUnits > 0 ? String(totalUnits) : '';
}

/* ---------- price rules ---------- */
function tierFor(units) {
  if (units >= 160000) return { label: '160,000–960,000', ppu: 0.063 };
  if (units >= 20000)  return { label: '20,000–160,000',  ppu: 0.0675 };
  // default (>= 5,000)
  return { label: '5,000–20,000',    ppu: 0.072 };
}
function dollars(n) { return `$${n.toFixed(2)}`; }

/* ---------- ORDER PAGE HOOKS ---------- */
(function setupOrderPage(){
  const bulkBtn = document.getElementById('btn-add-to-cart'); // our “Add to Cart” on order.html
  const qtyInput = document.getElementById('qty-units');      // the bulk qty input
  const kitBtn   = document.getElementById('starter-kit');    // the kit button

  if (bulkBtn && qtyInput) {
    bulkBtn.addEventListener('click', () => {
      let units = parseInt(qtyInput.value, 10);
      if (isNaN(units) || units < 5000) units = 5000;
      if (units % 5000 !== 0) units = Math.round(units / 5000) * 5000;
      if (units > 960000) units = 960000;

      const items = getCart().filter(it => it.type !== 'bulk'); // replace bulk line
      items.push({ type: 'bulk', units });
      saveCart(items);

      // Option: move them to cart page right away
      window.location.href = '/cart.html';
    });
  }

  if (kitBtn) {
    kitBtn.addEventListener('click', () => {
      const items = getCart();
      const existing = items.find(it => it.type === 'kit');
      if (existing) existing.qty += 1;
      else items.push({ type: 'kit', qty: 1, price: 36.00 });
      saveCart(items);
      window.location.href = '/cart.html';
    });
  }

  updateBadge(); // show count in header if present
})();

/* ---------- CART PAGE RENDER ---------- */
(function setupCartPage(){
  const bulkRow = document.getElementById('line-bulk');
  const kitRow  = document.getElementById('line-kit');
  const emptyEl = document.getElementById('cart-empty');

  if (!bulkRow && !kitRow) return; // not on cart page

  const bulkQty   = document.getElementById('bulk-qty');
  const bulkMinus = document.getElementById('bulk-minus');
  const bulkPlus  = document.getElementById('bulk-plus');
  const bulkPrice = document.getElementById('bulk-price');
  const bulkTier  = document.getElementById('bulk-tier-label');
  const bulkTotal = document.getElementById('bulk-total');
  const rmBulk    = document.getElementById('remove-bulk');

  const kitQty   = document.getElementById('kit-qty');
  const kitMinus = document.getElementById('kit-minus');
  const kitPlus  = document.getElementById('kit-plus');
  const kitTotal = document.getElementById('kit-total');
  const rmKit    = document.getElementById('remove-kit');

  const summarySubtotal = document.getElementById('summary-subtotal');
  const btnCheckout     = document.getElementById('btn-checkout');

  function normalizeBulk(v) {
    let n = parseInt(v, 10);
    if (isNaN(n) || n < 5000) n = 5000;
    if (n > 960000) n = 960000;
    if (n % 5000 !== 0) n = Math.round(n / 5000) * 5000;
    return n;
  }

  function render() {
    const items = getCart();
    const bulk = items.find(it => it.type === 'bulk');
    const kit  = items.find(it => it.type === 'kit');

    // Toggle rows
    bulkRow.style.display = bulk ? '' : 'none';
    kitRow.style.display  = kit  ? '' : 'none';
    emptyEl.style.display = (!bulk && !kit) ? '' : 'none';

    let subtotal = 0;

    if (bulk) {
      const units = normalizeBulk(bulk.units);
      if (bulkQty) bulkQty.value = units;

      const { ppu, label } = tierFor(units);
      const line = units * ppu;
      subtotal += line;

      if (bulkPrice) bulkPrice.textContent = `$${ppu.toFixed(4)}`;
      if (bulkTier)  bulkTier.textContent  = `Tier: ${label}`;
      if (bulkTotal) bulkTotal.textContent = dollars(line);

      // Persist normalized value
      bulk.units = units;
    }

    if (kit) {
      const qty = Math.max(1, parseInt(kit.qty, 10) || 1);
      const price = 36.00;
      const line = qty * price;
      subtotal += line;

      if (kitQty)   kitQty.value = qty;
      if (kitTotal) kitTotal.textContent = dollars(line);

      kit.qty = qty;
      kit.price = price;
    }

    if (summarySubtotal) summarySubtotal.textContent = dollars(subtotal);
    saveCart(items); // also updates header badge
  }

  // Bulk listeners (update on every keystroke + buttons)
  if (bulkQty) {
    bulkQty.addEventListener('input', () => {
      const items = getCart();
      const bulk = items.find(it => it.type === 'bulk');
      if (!bulk) return;
      bulk.units = parseInt(bulkQty.value, 10) || 5000;
      saveCart(items);
      render();
    });
  }
  if (bulkMinus) bulkMinus.addEventListener('click', () => {
    const items = getCart();
    const bulk = items.find(it => it.type === 'bulk');
    if (!bulk) return;
    bulk.units = normalizeBulk((bulk.units || 5000) - 5000);
    saveCart(items); render();
  });
  if (bulkPlus) bulkPlus.addEventListener('click', () => {
    const items = getCart();
    const bulk = items.find(it => it.type === 'bulk');
    if (!bulk) return;
    bulk.units = normalizeBulk((bulk.units || 5000) + 5000);
    saveCart(items); render();
  });
  if (rmBulk) rmBulk.addEventListener('click', () => {
    const items = getCart().filter(it => it.type !== 'bulk');
    saveCart(items); render();
  });

  // Kit listeners
  if (kitQty) {
    kitQty.addEventListener('input', () => {
      const items = getCart();
      const kit = items.find(it => it.type === 'kit');
      if (!kit) return;
      kit.qty = Math.max(1, parseInt(kitQty.value, 10) || 1);
      saveCart(items); render();
    });
  }
  if (kitMinus) kitMinus.addEventListener('click', () => {
    const items = getCart();
    const kit = items.find(it => it.type === 'kit');
    if (!kit) return;
    kit.qty = Math.max(1, (kit.qty || 1) - 1);
    saveCart(items); render();
  });
  if (kitPlus) kitPlus.addEventListener('click', () => {
    const items = getCart();
    const kit = items.find(it => it.type === 'kit');
    if (!kit) return;
    kit.qty = (kit.qty || 1) + 1;
    saveCart(items); render();
  });
  if (rmKit) rmKit.addEventListener('click', () => {
    const items = getCart().filter(it => it.type !== 'kit');
    saveCart(items); render();
  });

  // Checkout → Stripe
  if (btnCheckout) {
    btnCheckout.addEventListener('click', async () => {
      const items = getCart();
      if (!items.length) {
        alert('Your cart is empty.');
        return;
      }

      // Build payload with current computed pricing so Stripe session is exact
      let bulkPart = null;
      let kitPart  = null;

      const bulk = items.find(it => it.type === 'bulk');
      if (bulk) {
        const units = normalizeBulk(bulk.units || 5000);
        const { ppu } = tierFor(units);
        const amountCents = Math.round(units * ppu * 100); // e.g., 5000 * 0.072 * 100 = 36000
        bulkPart = { units, unitPrice: ppu, amountCents };
      }

      const kit = items.find(it => it.type === 'kit');
      if (kit) {
        const qty = Math.max(1, parseInt(kit.qty, 10) || 1);
        const unitCents = 3600;
        const amountCents = unitCents * qty;
        kitPart = { qty, unitCents, amountCents };
      }

      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bulk: bulkPart, kit: kitPart })
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `HTTP ${res.status}`);
        }
        const { url } = await res.json();
        if (!url) throw new Error('No checkout URL returned.');
        window.location.href = url;
      } catch (err) {
        console.error(err);
        alert('Sorry, checkout could not start. Please try again in a moment.');
      }
    });
  }

  render();
})();
