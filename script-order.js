/* v47 – Order page: tiers, calculator, add-to-cart */
(function () {
  'use strict';

  // ---- constants ----
  const FD_CART_KEY = 'fd_cart';
  const STEP = 5000;
  const MIN_QTY = 5000;
  const MAX_QTY = 960000;

  // price ladder
  function pricePerUnit(qty) {
    if (qty >= 160000) return 0.0630;
    if (qty > 20000)   return 0.0675;
    return 0.0720;
  }

  // helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function clampToStep(val) {
    let n = Math.round(Number(val) / STEP) * STEP;
    if (!isFinite(n) || n < MIN_QTY) n = MIN_QTY;
    if (n > MAX_QTY) n = MAX_QTY;
    return n;
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(FD_CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function saveCart(items) {
    localStorage.setItem(FD_CART_KEY, JSON.stringify(items));
    updateHeaderBadge(items);
  }

  function updateHeaderBadge(items = loadCart()) {
    // Badge shows total *units* (bulk units + kits*300), like your old build
    const units =
      items.reduce((sum, it) => {
        if (it.type === 'bulk') return sum + (it.qty || 0);
        if (it.type === 'kit')  return sum + (it.qty || 0) * 300;
        return sum;
      }, 0) || 0;
    const badge = $('#cart-count');
    if (!badge) return;
    badge.textContent = units > 0 ? units.toLocaleString() : '';
  }

  // ---- elements ----
  const qtyInput = $('#qty-units');
  const minusBtn = $('#qty-minus');
  const plusBtn  = $('#qty-plus');
  const perUnitEl = $('#price-per-unit');
  const totalEl   = $('#price-total');
  const addBtn    = $('#btn-add-to-cart');
  const kitBtn    = $('#starter-kit');
  const tierButtons = $$('.tier');

  function setActiveTier(btn) {
    tierButtons.forEach(b => b.classList.toggle('active', b === btn));
  }

  function setQtyAndRecalc(newQty) {
    const qty = clampToStep(newQty);
    qtyInput.value = qty;
    const ppu = pricePerUnit(qty);
    perUnitEl.textContent = `$${ppu.toFixed(4)}`;
    const total = qty * ppu;
    totalEl.textContent = `$${total.toFixed(2)}`;
  }

  // initial
  setQtyAndRecalc(qtyInput.value || MIN_QTY);
  updateHeaderBadge();

  // tier clicks — set qty to each tier's minimum and highlight only that button
  tierButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveTier(btn);
      const min = Number(btn.dataset.min || MIN_QTY);
      setQtyAndRecalc(min);
    });
  });

  minusBtn?.addEventListener('click', () => {
    const current = clampToStep(qtyInput.value);
    setQtyAndRecalc(current - STEP);
  });
  plusBtn?.addEventListener('click', () => {
    const current = clampToStep(qtyInput.value);
    setQtyAndRecalc(current + STEP);
  });

  qtyInput?.addEventListener('change', () => {
    setQtyAndRecalc(qtyInput.value);
  });
  qtyInput?.addEventListener('input', () => {
    // keep it snappy while typing; clamp on change
    const v = Number(qtyInput.value);
    if (!isFinite(v)) return;
    const ppu = pricePerUnit(Math.min(Math.max(v, MIN_QTY), MAX_QTY));
    perUnitEl.textContent = `$${ppu.toFixed(4)}`;
  });

  // Add bulk selection to cart (merge same type into one line)
  addBtn?.addEventListener('click', () => {
    const qty = clampToStep(qtyInput.value);
    let cart = loadCart();
    const bulk = cart.find(i => i.type === 'bulk');
    if (bulk) {
      bulk.qty = Math.min(MAX_QTY, (Number(bulk.qty) || 0) + qty);
    } else {
      cart.push({ type: 'bulk', qty });
    }
    saveCart(cart);
  });

  // Add ONE starter kit per click (no auto-redirect)
  kitBtn?.addEventListener('click', () => {
    let cart = loadCart();
    const kit = cart.find(i => i.type === 'kit');
    if (kit) {
      kit.qty = (Number(kit.qty) || 0) + 1;
    } else {
      cart.push({ type: 'kit', qty: 1, price: 36.0, title: 'Force Dowels — Starter Kit (300)' });
    }
    saveCart(cart);
  });
})();
