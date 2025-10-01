// ============ SHARED CART (Force Dowels) ============
// Use the same key everywhere
const FD_CART_KEY = 'fd_cart';

function fdGetCart() {
  try {
    const raw = localStorage.getItem(FD_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(FD_CART_KEY);
    return [];
  }
}
function fdSaveCart(items) {
  localStorage.setItem(FD_CART_KEY, JSON.stringify(items || []));
  fdUpdateHeaderBadge();
}
function fdUpdateHeaderBadge() {
  const el = document.getElementById('cart-count');
  if (!el) return;
  const items = fdGetCart();
  const totalQty = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  el.textContent = totalQty > 0 ? String(totalQty) : '';
}

// Pricing rules (must match order page)
const TIERS = [
  { min: 5000,    max: 20000,   ppu: 0.0720 },
  { min: 20001,   max: 160000,  ppu: 0.0675 },
  { min: 160001,  max: 960000,  ppu: 0.0630 },
];
function ppuFor(qty) {
  const q = Number(qty||0);
  for (const t of TIERS) {
    if (q >= t.min && q <= t.max) return t.ppu;
  }
  if (q > 960000) return TIERS[TIERS.length-1].ppu;
  return TIERS[0].ppu;
}
function fmtMoney(n){ return `$${(Number(n)||0).toFixed(2)}`; }
function fmtPPU(n){ return `$${(Number(n)||0).toFixed(4)}`; }

// Render cart if we are on /cart.html (elements exist)
function fdRenderCartPage() {
  const list = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('cart-subtotal');
  const emptyBox = document.getElementById('cart-empty');
  const checkoutBtn = document.getElementById('btn-checkout');

  // If these don't exist, we're not on the cart page—just update badge.
  if (!list || !subtotalEl || !checkoutBtn) {
    fdUpdateHeaderBadge();
    return;
  }

  // Read items
  let items = fdGetCart();

  // Combine ALL bulk into one line (so tier pricing can apply to the combined qty)
  const kits = [];
  let bulkQty = 0;
  items.forEach(it => {
    if ((it.type || '') === 'bulk') bulkQty += Number(it.qty)||0;
    else kits.push(it);
  });

  // Recalculate bulk PPU on combined qty
  const rows = [];
  if (bulkQty > 0) {
    const ppu = ppuFor(bulkQty);
    rows.push({
      sku: 'force-bulk',
      name: 'Force Dowels — Bulk',
      type: 'bulk',
      qty: bulkQty,
      unitPrice: ppu
    });
  }
  // kits (fixed price 36.00 each)
  kits.forEach(k => {
    rows.push({
      sku: k.sku || 'FD-KIT-300',
      name: k.name || 'Force Dowels Kit — 300 units',
      type: 'kit',
      qty: Number(k.qty)||1,
      unitPrice: 36.0
    });
  });

  // If empty
  if (rows.length === 0) {
    list.innerHTML = '';
    if (emptyBox) emptyBox.style.display = 'block';
    subtotalEl.textContent = '$0.00';
    checkoutBtn.disabled = true;
    fdUpdateHeaderBadge();
    return;
  }
  if (emptyBox) emptyBox.style.display = 'none';

  // Build DOM
  list.innerHTML = '';
  let subtotal = 0;

  rows.forEach((row, idx) => {
    const lineTotal = row.qty * row.unitPrice;
    subtotal += lineTotal;

    const li = document.createElement('div');
    li.className = 'cart-row';

    li.innerHTML = `
      <div class="cart-line-info">
        <div class="cart-line-title">
          ${row.type === 'bulk'
            ? `Force Dowels — Bulk`
            : `Force Dowels Kit — 300 units`
          }
        </div>
        <div class="cart-line-meta">
          ${row.type === 'bulk'
            ? `${row.qty.toLocaleString()} units @ ${fmtPPU(row.unitPrice)}/unit`
            : `1 kit @ $36.00`
          }
        </div>
      </div>

      <div class="cart-line-qty">
        <button class="qty-btn" data-idx="${idx}" data-act="dec" aria-label="Decrease">–</button>
        <input class="qty-input" data-idx="${idx}" type="number" min="1" step="1" value="${row.qty}">
        <button class="qty-btn" data-idx="${idx}" data-act="inc" aria-label="Increase">+</button>
      </div>

      <div class="cart-line-total">${fmtMoney(lineTotal)}</div>

      <button class="cart-remove" data-idx="${idx}" aria-label="Remove">✕</button>
    `;
    list.appendChild(li);
  });

  subtotalEl.textContent = fmtMoney(subtotal);
  checkoutBtn.disabled = false;

  // Wire qty changes
  list.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = Number(btn.dataset.idx);
      const act = btn.dataset.act;
      if (rows[idx].type === 'bulk') {
        // bulk moves in 5,000 steps
        const delta = act === 'inc' ? 5000 : -5000;
        rows[idx].qty = Math.max(5000, Math.min(960000, rows[idx].qty + delta));
      } else {
        // kit qty in steps of 1
        const delta = act === 'inc' ? 1 : -1;
        rows[idx].qty = Math.max(1, rows[idx].qty + delta);
      }
      // save back to storage as decomposed items
      fdPersistFromRows(rows);
      fdRenderCartPage();
    });
  });

  list.querySelectorAll('.qty-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = Number(inp.dataset.idx);
      let v = Number(inp.value)||1;
      if (rows[idx].type === 'bulk') {
        v = Math.max(5000, Math.min(960000, Math.round(v/5000)*5000));
      } else {
        v = Math.max(1, Math.round(v));
      }
      rows[idx].qty = v;
      fdPersistFromRows(rows);
      fdRenderCartPage();
    });
  });

  list.querySelectorAll('.cart-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      rows.splice(Number(btn.dataset.idx), 1);
      fdPersistFromRows(rows);
      fdRenderCartPage();
    });
  });

  // Checkout handler (posts current cart to your API)
  const checkout = document.getElementById('btn-checkout');
  if (checkout) {
    checkout.onclick = async () => {
      try {
        checkout.disabled = true;
        checkout.textContent = 'Redirecting…';
        // Build payload your /api/checkout expects (SKU map is done server-side)
        const payload = rows.map(r => ({
          type: r.type,
          sku: r.sku,
          qty: r.qty
        }));
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payload })
        });
        if (!res.ok) throw new Error('Checkout failed');
        const data = await res.json();
        if (data?.url) {
          window.location = data.url;
        } else {
          throw new Error('No redirect URL from server');
        }
      } catch (err) {
        console.error('Checkout failed', err);
        alert('Sorry—checkout could not start. Please try again.');
        checkout.disabled = false;
        checkout.textContent = 'Proceed to Checkout';
      }
    };
  }

  fdUpdateHeaderBadge();
}

// Convert combined rows → storage format
function fdPersistFromRows(rows) {
  const out = [];
  rows.forEach(r => {
    if (r.type === 'bulk') {
      if (r.qty > 0) {
        out.push({
          sku: 'force-bulk',
          name: 'Force Dowels — Bulk',
          type: 'bulk',
          // unitPrice is recalculated each render based on qty, no need to store
          qty: r.qty
        });
      }
    } else {
      if (r.qty > 0) {
        out.push({
          sku: r.sku || 'FD-KIT-300',
          name: r.name || 'Force Dowels Kit — 300 units',
          type: 'kit',
          qty: r.qty
        });
      }
    }
  });
  fdSaveCart(out);
}

document.addEventListener('DOMContentLoaded', () => {
  // Always keep the badge in sync
  fdUpdateHeaderBadge();
  // If we’re on the cart page, render it
  fdRenderCartPage();
});

