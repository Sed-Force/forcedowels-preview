// ============ ORDER PAGE CART WRITER (Force Dowels) ============
// Single source of truth key
const FD_CART_KEY = 'fd_cart';

// Safe read/write helpers
function fdGetCart() {
  try {
    const raw = localStorage.getItem(FD_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // if it was corrupted, reset it
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

// Add (or merge) an item into cart
function fdAddToCart(newItem) {
  const cart = fdGetCart();
  const idx = cart.findIndex(
    (it) => it.sku === newItem.sku && (it.type || '') === (newItem.type || '')
  );
  if (idx > -1) {
    cart[idx].qty = Number(cart[idx].qty || 0) + Number(newItem.qty || 0);
  } else {
    cart.push({ ...newItem, qty: Number(newItem.qty || 0) });
  }
  fdSaveCart(cart);
}

// On page load: wire up controls if they exist
document.addEventListener('DOMContentLoaded', () => {
  // Always keep badge correct when landing on order page
  fdUpdateHeaderBadge();

  // ----- Starter Kit button (fixed item) -----
  const kitBtn = document.getElementById('starter-kit');
  if (kitBtn) {
    kitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // Make sure we add exactly ONE kit per click
      fdAddToCart({
        sku: kitBtn.dataset.sku || 'FD-KIT-300',
        name: kitBtn.dataset.name || 'Force Dowels Kit — 300 units',
        type: 'kit',
        unitPrice: 36.0, // fixed
        qty: 1
      });
      // optional: toast; do not navigate
      console.log('Added 1 kit to cart');
    });
  }

  // ----- Bulk calculator controls -----
  const minus = document.getElementById('qty-minus');
  const plus  = document.getElementById('qty-plus');
  const qtyEl = document.getElementById('qty-units');
  const addBtn = document.getElementById('btn-add-to-cart');
  const ppuEl = document.getElementById('price-per-unit');
  const totalEl = document.getElementById('price-total');

  // price tiers
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
    // clamp to highest tier if above range
    if (q > 960000) return TIERS[TIERS.length-1].ppu;
    // default first tier
    return TIERS[0].ppu;
  }
  function fmtMoney(n){ return `$${(Number(n)||0).toFixed(2)}`; }
  function fmtPPU(n){ return `$${(Number(n)||0).toFixed(4)}`; }

  function clampToStep(val) {
    // enforce 5,000 step and bounds
    let v = Math.max(5000, Math.min(960000, Math.round(Number(val||5000)/5000)*5000));
    return v;
  }
  function recalc() {
    if (!qtyEl || !ppuEl || !totalEl) return;
    const qty = clampToStep(qtyEl.value);
    qtyEl.value = qty;
    const ppu = ppuFor(qty);
    ppuEl.textContent = fmtPPU(ppu);
    totalEl.textContent = fmtMoney(qty * ppu);
  }

  if (qtyEl) {
    qtyEl.addEventListener('change', recalc);
  }
  if (minus) {
    minus.addEventListener('click', () => {
      const v = clampToStep((Number(qtyEl.value)||5000) - 5000);
      qtyEl.value = v; recalc();
    });
  }
  if (plus) {
    plus.addEventListener('click', () => {
      const v = clampToStep((Number(qtyEl.value)||5000) + 5000);
      qtyEl.value = v; recalc();
    });
  }
  // initialize
  if (qtyEl) recalc();

  // tier buttons (optional UI on your page)
  document.querySelectorAll('.tier').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      // make the clicked one active, others not
      document.querySelectorAll('.tier').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // enforce the minimum of that tier
      const min = Number(btn.dataset.min || 5000);
      if (qtyEl) qtyEl.value = min;
      recalc();
    });
  });

  if (addBtn && qtyEl) {
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const qty = clampToStep(qtyEl.value);
      const unitPrice = ppuFor(qty);
      fdAddToCart({
        sku: 'force-bulk',
        name: 'Force Dowels — Bulk',
        type: 'bulk',
        unitPrice,
        qty
      });
      console.log(`Added bulk ${qty} units to cart`);
    });
  }
});
