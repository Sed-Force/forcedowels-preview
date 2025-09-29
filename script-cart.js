/* Tier-aware cart for Force Dowels
   - Stores cart in localStorage under 'fd_cart'
   - Supports two item types:
       { type: 'bulk', units: 5000 }  // units are actual dowel units (5k step)
       { type: 'kit',  qty: 1 }       // Starter Kit, $36 each (300 units)
   - Migrates legacy items with skus 'force-100' (5k) and 'force-500' (25k) and 'FD-KIT-300'
*/

(function () {
  const LS_KEY = 'fd_cart';

  // ---- Constants (edit prices here if needed)
  const KIT_PRICE = 36_00; // $36.00 in cents
  const STEP = 5000;
  const MAX_BULK = 960000;

  function tierPricePerUnit(unitsTotal) {
    if (unitsTotal >= 160000) return 0.063;
    if (unitsTotal >= 20000)  return 0.0675;
    if (unitsTotal >= 5000)   return 0.072;
    return 0;
  }

  // ---- Storage helpers
  function loadCart() {
    let raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];

    try {
      let items = JSON.parse(raw);

      // Legacy migration (sku-based)
      let migrated = [];
      for (const it of items) {
        if (it.type) { migrated.push(it); continue; }

        // old shapes:
        // { sku:'force-100', qty: N } -> N*5000 units
        // { sku:'force-500', qty: N } -> N*25000 units
        // { sku:'FD-KIT-300', qty: N } -> kits
        if (it.sku === 'force-100') {
          migrated.push({ type: 'bulk', units: clampUnits((it.qty || 1) * 5000) });
        } else if (it.sku === 'force-500') {
          migrated.push({ type: 'bulk', units: clampUnits((it.qty || 1) * 25000) });
        } else if (it.sku === 'FD-KIT-300') {
          migrated.push({ type: 'kit', qty: Math.max(1, it.qty || 1) });
        }
      }

      if (migrated.length && JSON.stringify(migrated) !== raw) {
        localStorage.setItem(LS_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return items;
    } catch {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
    updateBadge(items);
  }

  function updateBadge(items) {
    const el = document.getElementById('cart-count');
    if (!el) return;
    const count =
      items.reduce((n, it) => n + (it.type === 'kit' ? it.qty : (it.units ? 1 : 0)), 0);
    el.textContent = count > 0 ? String(count) : '';
  }

  function clampUnits(units) {
    if (!units || units < 0) return 0;
    let u = Math.round(units / STEP) * STEP;
    u = Math.max(0, Math.min(MAX_BULK, u));
    return u;
  }

  // ---- Render
  const listEl = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('summary-subtotal');
  const btnCheckout = document.getElementById('btn-checkout');
  const btnClear = document.getElementById('btn-clear');
  const btnConsolidate = document.getElementById('btn-consolidate');

  let cart = loadCart();
  updateBadge(cart);
  render();

  // consolidate merges all bulk items into one line; kits stay as one line
  if (btnConsolidate) {
    btnConsolidate.addEventListener('click', () => {
      const totalBulk = cart.filter(i => i.type === 'bulk').reduce((s, i) => s + (i.units || 0), 0);
      const totalKits = cart.filter(i => i.type === 'kit').reduce((s, i) => s + (i.qty || 0), 0);
      const next = [];
      if (totalBulk > 0) next.push({ type: 'bulk', units: clampUnits(totalBulk) });
      if (totalKits > 0) next.push({ type: 'kit', qty: totalKits });
      cart = next;
      saveCart(cart);
      render();
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      cart = [];
      saveCart(cart);
      render();
    });
  }

  if (btnCheckout) {
    btnCheckout.addEventListener('click', onCheckout);
  }

  function render() {
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!cart.length) {
      listEl.innerHTML = `
        <div class="empty muted" style="padding:14px 0">Your cart is empty.</div>
      `;
      if (subtotalEl) subtotalEl.textContent = '$0.00';
      if (btnCheckout) btnCheckout.disabled = true;
      return;
    }

    const totalBulkUnits = cart
      .filter(i => i.type === 'bulk')
      .reduce((s, i) => s + (i.units || 0), 0);
    const ppu = tierPricePerUnit(totalBulkUnits);
    const ppuFmt = ppu ? `$${ppu.toFixed(4)}` : '--';

    let subtotalCents = 0;

    cart.forEach((item, idx) => {
      if (item.type === 'bulk') {
        const units = clampUnits(item.units || 0);
        const lineCents = Math.round(units * ppu * 100);
        subtotalCents += lineCents;

        const row = document.createElement('div');
        row.className = 'cart-row card-row';
        row.innerHTML = `
          <div class="row-left">
            <div class="title">Force Dowels — Bulk</div>
            <div class="muted">Price per unit: <strong>${ppuFmt}</strong></div>
          </div>
          <div class="row-mid qtywrap">
            <button class="step" data-act="bulk-minus" aria-label="decrease">–</button>
            <input class="qty-input" data-kind="bulk" value="${units}" inputmode="numeric" />
            <button class="step" data-act="bulk-plus" aria-label="increase">+</button>
          </div>
          <div class="row-right">
            <div class="line-total">${fmtUSD(lineCents)}</div>
            <button class="link danger" data-act="remove" aria-label="remove">🗑</button>
          </div>
        `;
        row.querySelector('[data-act="bulk-minus"]').addEventListener('click', () => {
          item.units = clampUnits(units - STEP);
          if (item.units === 0) cart.splice(idx, 1);
          saveCart(cart); render();
        });
        row.querySelector('[data-act="bulk-plus"]').addEventListener('click', () => {
          item.units = clampUnits(units + STEP);
          saveCart(cart); render();
        });
        row.querySelector('[data-act="remove"]').addEventListener('click', () => {
          cart.splice(idx, 1); saveCart(cart); render();
        });
        row.querySelector('.qty-input').addEventListener('change', (e) => {
          const val = parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 0;
          item.units = clampUnits(val);
          if (item.units === 0) cart.splice(idx, 1);
          saveCart(cart); render();
        });

        listEl.appendChild(row);
      } else if (item.type === 'kit') {
        const qty = Math.max(1, parseInt(item.qty || 1, 10));
        const lineCents = qty * KIT_PRICE;
        subtotalCents += lineCents;

        const row = document.createElement('div');
        row.className = 'cart-row card-row';
        row.innerHTML = `
          <div class="row-left">
            <div class="title">Force Dowels Kit — 300 units</div>
            <div class="muted">$36.00 ea</div>
          </div>
          <div class="row-mid qtywrap">
            <button class="step" data-act="kit-minus" aria-label="decrease">–</button>
            <input class="qty-input" data-kind="kit" value="${qty}" inputmode="numeric" />
            <button class="step" data-act="kit-plus" aria-label="increase">+</button>
          </div>
          <div class="row-right">
            <div class="line-total">${fmtUSD(lineCents)}</div>
            <button class="link danger" data-act="remove" aria-label="remove">🗑</button>
          </div>
        `;
        row.querySelector('[data-act="kit-minus"]').addEventListener('click', () => {
          const next = Math.max(1, qty - 1);
          item.qty = next; saveCart(cart); render();
        });
        row.querySelector('[data-act="kit-plus"]').addEventListener('click', () => {
          item.qty = qty + 1; saveCart(cart); render();
        });
        row.querySelector('[data-act="remove"]').addEventListener('click', () => {
          cart.splice(idx, 1); saveCart(cart); render();
        });
        row.querySelector('.qty-input').addEventListener('change', (e) => {
          const val = Math.max(1, parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 1);
          item.qty = val; saveCart(cart); render();
        });

        listEl.appendChild(row);
      }
    });

    if (subtotalEl) subtotalEl.textContent = fmtUSD(subtotalCents);
    if (btnCheckout) btnCheckout.disabled = subtotalCents <= 0;
  }

  function fmtUSD(cents) {
    return (cents/100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  async function onCheckout() {
    btnCheckout.disabled = true;
    btnCheckout.textContent = 'Preparing…';

    const totalBulkUnits = cart
      .filter(i => i.type === 'bulk')
      .reduce((s, i) => s + (i.units || 0), 0);
    const kits = cart
      .filter(i => i.type === 'kit')
      .reduce((s, i) => s + (i.qty || 0), 0);

    if (totalBulkUnits <= 0 && kits <= 0) {
      btnCheckout.disabled = false; btnCheckout.textContent = 'Proceed to Checkout';
      return;
    }

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          bulk_units: totalBulkUnits,
          kit_qty: kits,
          source: 'cart'
        })
      });

      if (!res.ok) throw new Error('Checkout error');
      const { url } = await res.json();
      if (url) {
        window.location = url;
      } else {
        alert('Could not start checkout. Please try again.');
        btnCheckout.disabled = false; btnCheckout.textContent = 'Proceed to Checkout';
      }
    } catch (e) {
      alert('Checkout error. Please try again.');
      btnCheckout.disabled = false; btnCheckout.textContent = 'Proceed to Checkout';
    }
  }
})();
