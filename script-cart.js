/* script-cart.js — renders cart page & starts Stripe checkout
   EXPECTED DOM:
   - #cart-empty (empty state wrapper)
   - #cart-wrap (cart table + summary wrapper)
   - #cart-body (tbody for line items)
   - #cart-subtotal (subtotal text)
   - #btn-checkout (button to Stripe)
   - #cart-count (header badge)
*/

(function(){
  const CART_KEY = 'fd_cart';

  // Pricing tiers (per-unit)
  function unitPriceFor(units) {
    if (!units || units <= 0) return 0;
    if (units <= 20000) return 0.072;
    if (units <= 160000) return 0.0675;
    return 0.063; // up to 960k
  }

  // Read cart safely
  function readCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  // Best-effort normalize for display (don’t rewrite storage)
  function normalizeForDisplay(items) {
    let bulkUnits = 0;
    let kits = 0;
    let otherLines = [];

    for (const it of items) {
      const sku = (it.sku || '').toLowerCase();

      // Recognize kit(s)
      if (sku === 'fd-kit-300' || it.kind === 'kit' || /kit/i.test(it.name || '')) {
        const qty = Number(it.qty || it.quantity || 1);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        kits += qty;
        continue;
      }

      // Recognize bulk in a few shapes
      if (it.kind === 'bulk' && Number.isFinite(it.units)) {
        bulkUnits += Math.max(0, Number(it.units));
        continue;
      }
      if (sku === 'force-100') {               // 5,000 units per
        const qty = Number(it.qty || it.quantity || 1);
        bulkUnits += 5000 * (Number.isFinite(qty) ? qty : 1);
        continue;
      }
      if (sku === 'force-500') {               // 25,000 units per
        const qty = Number(it.qty || it.quantity || 1);
        bulkUnits += 25000 * (Number.isFinite(qty) ? qty : 1);
        continue;
      }
      if (Number.isFinite(it.units)) {
        bulkUnits += Math.max(0, Number(it.units));
        continue;
      }

      // Fallback "other" line (show name/price if present)
      otherLines.push(it);
    }

    const lines = [];

    if (bulkUnits > 0) {
      const ppu = unitPriceFor(bulkUnits);
      lines.push({
        _type: 'bulk',
        name: `Force Dowels — Bulk`,
        units: bulkUnits,
        unitPrice: ppu,
        lineTotal: +(bulkUnits * ppu).toFixed(2)
      });
    }

    if (kits > 0) {
      const price = 36.00;
      lines.push({
        _type: 'kit',
        name: `Force Dowels Kit — 300 units`,
        qty: kits,
        unitPrice: price,
        lineTotal: +(kits * price).toFixed(2)
      });
    }

    // any unknowns
    for (const o of otherLines) {
      const qty = Number(o.qty || o.quantity || 1);
      const up = Number(o.unitPrice || o.price || 0);
      const nm = o.name || o.sku || 'Item';
      const lt = (Number.isFinite(up) && Number.isFinite(qty)) ? +(up * qty).toFixed(2) : 0;
      lines.push({
        _type: 'other',
        name: nm,
        qty,
        unitPrice: Number.isFinite(up) ? up : 0,
        lineTotal: lt
      });
    }

    return lines;
  }

  // Money
  const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;
  const nf = new Intl.NumberFormat();

  // Render table
  function renderCart() {
    const cart = readCart();
    const badge = document.getElementById('cart-count');
    const wrap = document.getElementById('cart-wrap');
    const empty = document.getElementById('cart-empty');
    const body = document.getElementById('cart-body');
    const subtotalEl = document.getElementById('cart-subtotal');
    const checkoutBtn = document.getElementById('btn-checkout');

    // update badge from raw cart (lines count)
    if (badge) {
      let count = 0;
      for (const it of cart) {
        const sku = (it.sku || '').toLowerCase();
        if (sku === 'fd-kit-300' || it.kind === 'kit') {
          count += Number(it.qty || it.quantity || 1);
        } else if (sku === 'force-100') {
          count += Number(it.qty || it.quantity || 1);
        } else if (sku === 'force-500') {
          count += Number(it.qty || it.quantity || 1);
        } else if (Number.isFinite(it.units)) {
          // treat one bulk line as 1 for badge (or you can map units/5000)
          count += 1;
        } else {
          count += Number(it.qty || it.quantity || 1);
        }
      }
      badge.textContent = count > 0 ? String(count) : '';
    }

    const lines = normalizeForDisplay(cart);

    if (!lines.length) {
      if (wrap) wrap.style.display = 'none';
      if (empty) empty.style.display = '';
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }

    if (wrap) wrap.style.display = '';
    if (empty) empty.style.display = 'none';

    if (body) body.innerHTML = '';

    let subtotal = 0;

    for (const line of lines) {
      let row = document.createElement('tr');

      // Item cell
      const tdName = document.createElement('td');
      tdName.innerHTML = `
        <div class="cart-line">
          <div class="title">${line.name}</div>
          ${
            line._type === 'bulk'
              ? `<div class="muted">Quantity: ${nf.format(line.units)} units</div>`
              : line._type === 'kit'
                ? `<div class="muted">Quantity: ${nf.format(line.qty)} kit(s)</div>`
                : ''
          }
        </div>
      `;
      row.appendChild(tdName);

      // Unit price
      const tdUnit = document.createElement('td');
      tdUnit.className = 'num';
      tdUnit.textContent = fmt(line.unitPrice);
      row.appendChild(tdUnit);

      // Qty column (read-only here; editing handled on order page)
      const tdQty = document.createElement('td');
      tdQty.className = 'num';
      if (line._type === 'bulk') {
        tdQty.textContent = nf.format(line.units);
      } else {
        tdQty.textContent = nf.format(line.qty);
      }
      row.appendChild(tdQty);

      // Line total
      const tdTotal = document.createElement('td');
      tdTotal.className = 'num';
      tdTotal.textContent = fmt(line.lineTotal);
      row.appendChild(tdTotal);

      // Remove (removes entire category line)
      const tdRemove = document.createElement('td');
      tdRemove.className = 'num';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost btn--sm';
      btn.textContent = 'Remove';
      btn.addEventListener('click', () => {
        removeLine(line);
      });
      tdRemove.appendChild(btn);
      row.appendChild(tdRemove);

      if (body) body.appendChild(row);

      subtotal += line.lineTotal;
    }

    if (subtotalEl) subtotalEl.textContent = fmt(subtotal);

    if (checkoutBtn) {
      checkoutBtn.disabled = subtotal <= 0;
      checkoutBtn.onclick = async function () {
        try {
          checkoutBtn.disabled = true;
          const res = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cart: readCart() }) // send RAW cart so server understands shapes
          });
          if (!res.ok) {
            console.error('Checkout failed', await res.text());
            alert('A server error has occurred.\nPlease try again.');
            return;
          }
          const data = await res.json();
          if (data && data.url) {
            window.location = data.url;
          } else {
            alert('Unexpected response from server.');
          }
        } catch (err) {
          console.error(err);
          alert('Network error. Please try again.');
        } finally {
          checkoutBtn.disabled = false;
        }
      };
    }
  }

  // Remove a line (category-aware) and persist back in the same “shape” the cart used
  function removeLine(line) {
    const raw = readCart();
    if (!raw.length) return;

    // Detect cart shape (kind-based vs sku-based)
    let usesKind = raw.some(it => it.kind);
    let out = [];

    if (line._type === 'kit') {
      if (usesKind) {
        out = raw.filter(it => !(it.kind === 'kit' || (it.sku || '').toLowerCase() === 'fd-kit-300'));
      } else {
        out = raw.filter(it => (it.sku || '').toLowerCase() !== 'fd-kit-300');
      }
    } else if (line._type === 'bulk') {
      if (usesKind) {
        out = raw.filter(it => !(it.kind === 'bulk' || Number.isFinite(it.units) || (it.sku || '').toLowerCase().startsWith('force-')));
      } else {
        // remove all bulk-like lines (force-100, force-500, or units)
        out = raw.filter(it => {
          const sku = (it.sku || '').toLowerCase();
          if (sku === 'force-100' || sku === 'force-500') return false;
          if (Number.isFinite(it.units)) return false;
          return true;
        });
      }
    } else {
      // 'other' — remove by object identity fallback: drop items with same name if present
      out = raw.filter(it => (it.name || it.sku) !== (line.name));
    }

    localStorage.setItem(CART_KEY, JSON.stringify(out));
    renderCart();
  }

  // Init
  document.addEventListener('DOMContentLoaded', renderCart);
})();

