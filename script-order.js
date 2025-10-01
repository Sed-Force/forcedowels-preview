/* /script-order.js  (v51)  — Force Dowels: Tier logic + Add-to-cart */
// Guard against double-initialization
if (!window.__FD_ORDER_INIT__) {
  window.__FD_ORDER_INIT__ = true;

  // --------- DOM refs
  const qtyInput   = document.getElementById('qty-units');
  const btnMinus   = document.getElementById('qty-minus');
  const btnPlus    = document.getElementById('qty-plus');
  const ppuEl      = document.getElementById('price-per-unit');
  const totalEl    = document.getElementById('price-total');
  const tierBtns   = Array.from(document.querySelectorAll('.tier'));
  const kitBtn     = document.getElementById('starter-kit');
  const addBtn     = document.getElementById('btn-add-to-cart');

  // --------- Constants
  const STEP = 5000;
  const MIN_QTY = 5000;
  const MAX_QTY = 960000;

  // Tier defaults per your spec
  function defaultQtyForTierMin(minVal) {
    if (+minVal === 5000)   return 5000;    // 5,000–20,000
    if (+minVal === 20000)  return 25000;   // >20,000–160,000
    if (+minVal === 160000) return 165000;  // >160,000–960,000
    return 5000;
  }

  // Pricing logic (tiered)
  function unitPriceForQty(q) {
    if (q <= 20000)  return 0.0720;   // 5k–20k
    if (q <= 160000) return 0.0675;   // >20k–160k
    return 0.0630;                    // >160k–960k
  }

  // Utility: clamp & snap to 5,000s
  function normalizeQty(val) {
    let q = Math.round((+val || 0) / STEP) * STEP;
    if (q < MIN_QTY) q = MIN_QTY;
    if (q > MAX_QTY) q = MAX_QTY;
    return q;
  }

  // Update $ and active tier highlight based on current qty
  function syncUI() {
    const q = normalizeQty(qtyInput.value);
    qtyInput.value = q;

    // Price
    const ppu = unitPriceForQty(q);
    ppuEl.textContent   = `$${ppu.toFixed(4)}`;
    totalEl.textContent = `$${(q * ppu).toFixed(2)}`;

    // Highlight the correct tier
    // First: clear
    tierBtns.forEach(b => b.classList.remove('active'));
    // Then: choose by qty
    if (q <= 20000) {
      const b = tierBtns.find(b => +b.dataset.min === 5000);
      if (b) b.classList.add('active');
    } else if (q <= 160000) {
      const b = tierBtns.find(b => +b.dataset.min === 20000);
      if (b) b.classList.add('active');
    } else {
      const b = tierBtns.find(b => +b.dataset.min === 160000);
      if (b) b.classList.add('active');
    }
  }

  // ---------- Cart helpers
  const CART_KEY = 'fd_cart';

  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch { return []; }
  }
  function writeCart(arr) {
    localStorage.setItem(CART_KEY, JSON.stringify(arr));
    // Update header badge if not provided elsewhere
    if (window.updateCartBadge) {
      window.updateCartBadge();
    } else {
      const badge = document.getElementById('cart-count');
      if (badge) {
        // Show total units (bulk units + 300 per kit)
        const count = arr.reduce((sum, it) => {
          if (it.kind === 'bulk') return sum + (it.units || 0);
          if (it.kind === 'kit')  return sum + (it.qty || 0) * 300;
          return sum;
        }, 0);
        badge.textContent = count > 0 ? count.toLocaleString() : '';
      }
    }
  }

  function addBulkToCart(units) {
    const cart = readCart();
    // Single bulk line that accumulates units
    let bulk = cart.find(i => i.kind === 'bulk');
    if (!bulk) {
      bulk = {
        kind: 'bulk',
        sku: 'FD-BULK',
        name: 'Force Dowels — Bulk',
        // store units; price is recalculated in cart
        units: 0
      };
      cart.push(bulk);
    }
    bulk.units = (bulk.units || 0) + units;
    writeCart(cart);
  }

  // Guard to prevent fast double-click adds on kit
  let lastKitClickAt = 0;
  function addKitToCart() {
    const now = Date.now();
    if (now - lastKitClickAt < 350) return; // ignore ultra-fast double click
    lastKitClickAt = now;

    const cart = readCart();
    let kit = cart.find(i => i.kind === 'kit' && i.sku === 'FD-KIT-300');
    if (!kit) {
      kit = {
        kind: 'kit',
        sku: 'FD-KIT-300',
        name: 'Force Dowels Kit — 300 units',
        price: 36.00,
        qty: 0
      };
      cart.push(kit);
    }
    kit.qty = (kit.qty || 0) + 1; // add exactly ONE per click
    writeCart(cart);
  }

  // ---------- Wire events

  // Tier clicks → set default qty for that tier & highlight only that one
  tierBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // highlight the clicked one only
      tierBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // snap to the tier's default quantity
      const defaultQty = defaultQtyForTierMin(btn.dataset.min);
      qtyInput.value = defaultQty;
      syncUI();
    }, { passive: true });
  });

  // +/- buttons
  if (btnMinus) {
    btnMinus.addEventListener('click', () => {
      const next = normalizeQty(qtyInput.value) - STEP;
      qtyInput.value = next < MIN_QTY ? MIN_QTY : next;
      syncUI();
    });
  }
  if (btnPlus) {
    btnPlus.addEventListener('click', () => {
      const next = normalizeQty(qtyInput.value) + STEP;
      qtyInput.value = next > MAX_QTY ? MAX_QTY : next;
      syncUI();
    });
  }

  // Manual typing (on blur or Enter we normalize)
  if (qtyInput) {
    qtyInput.addEventListener('change', syncUI);
    qtyInput.addEventListener('blur',   syncUI);
    qtyInput.addEventListener('keyup', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        syncUI();
      }
    });
  }

  // Add Bulk to cart (does NOT navigate)
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const units = normalizeQty(qtyInput.value);
      addBulkToCart(units);
      // Optionally show a tiny confirmation (non-blocking)
      try {
        addBtn.disabled = true;
        const prev = addBtn.textContent;
        addBtn.textContent = 'Added!';
        setTimeout(() => {
          addBtn.disabled = false;
          addBtn.textContent = prev;
        }, 700);
      } catch {}
    });
  }

  // Add kit (exactly one) to cart (does NOT navigate)
  if (kitBtn) {
    kitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      addKitToCart();
    });
  }

  // Initial paint
  syncUI();
}
