/* v48 – Order page: sizes, tiers, calculator, add-to-cart */
(function () {
  'use strict';

  const catalog = window.FDProducts;
  if (!catalog) {
    console.error('FDProducts catalog missing');
    return;
  }

  const FD_CART_KEY = 'fd_cart';
  const STEP = catalog.STEP;
  const MIN_QTY = catalog.MIN_UNITS;
  const MAX_QTY = catalog.MAX_UNITS;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const KIT_MIN = 1;
  const KIT_MAX = 999;

  let isAuthenticated = false;
  let currentSizeId = catalog.DEFAULT_SIZE_ID;
  let orderMode = 'bulk'; // 'bulk' | 'kit'
  let bulkQty = MIN_QTY;
  let kitQty = KIT_MIN;

  function guestMaxQty() {
    const size = catalog.getSize(currentSizeId);
    const firstLocked = size.bulkTiers.find((tier) => tier.requiresAuth);
    if (!firstLocked) return MAX_QTY;
    return firstLocked.min - STEP;
  }

  function maxAllowedQty() {
    return isAuthenticated ? MAX_QTY : guestMaxQty();
  }

  function clampToStep(val) {
    let n = Math.round(Number(val) / STEP) * STEP;
    if (!isFinite(n) || n < MIN_QTY) n = MIN_QTY;
    const max = maxAllowedQty();
    if (n > max) n = max;
    return n;
  }

  function clampKitQty(val) {
    let n = Math.round(Number(val));
    if (!isFinite(n) || n < KIT_MIN) n = KIT_MIN;
    if (n > KIT_MAX) n = KIT_MAX;
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
    window.dispatchEvent(new CustomEvent('fd_cart_updated', { detail: items }));
  }

  function updateHeaderBadge(items = loadCart()) {
    const units =
      items.reduce((sum, it) => {
        if (it.type === 'bulk') return sum + (Number(it.units) || Number(it.qty) || 0);
        if (it.type === 'kit') return sum + (Number(it.qty) || 0) * catalog.kitUnits(it.sizeId);
        return sum;
      }, 0) || 0;
    const badge = $('#cart-count');
    if (!badge) return;
    badge.textContent = units > 0 ? units.toLocaleString() : '';
    badge.setAttribute('title', units > 0 ? `${units.toLocaleString()} dowels` : '');
  }

  const qtyInput = $('#qty-units');
  const minusBtn = $('#qty-minus');
  const plusBtn = $('#qty-plus');
  const perUnitEl = $('#price-per-unit');
  const totalEl = $('#price-total');
  const addBtn = $('#btn-add-to-cart');
  const kitBtn = $('#starter-kit');
  const testKitBtn = $('#test-kit');
  const tierList = $('#tier-list');
  const sizePicker = $('#size-picker');
  const qtyLabel = $('#qty-label');
  const qtyUnitLabel = $('#qty-unit-label');
  const priceLabel = $('#price-per-label');
  const calcCallout = $('#calc-callout');

  function tierButtons() {
    return $$('.tier', tierList || document);
  }

  function setActiveTier(btn) {
    tierButtons().forEach((b) => b.classList.toggle('active', b === btn));
  }

  function setActiveSize(sizeId) {
    currentSizeId = catalog.normalizeSizeId(sizeId);
    $$('.size-option', sizePicker || document).forEach((btn) => {
      const on = btn.dataset.size === currentSizeId;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    renderTiers();
    renderKit();
    if (orderMode === 'kit') {
      renderKitCalc();
    } else {
      setQtyAndRecalc(bulkQty);
    }
  }

  function renderTiers() {
    if (!tierList) return;
    const size = catalog.getSize(currentSizeId);
    const activeTier = catalog.pickTier(currentSizeId, bulkQty);
    const showActive = orderMode === 'bulk';

    tierList.innerHTML = size.bulkTiers.map((tier) => {
      const locked = tier.requiresAuth && !isAuthenticated;
      const isActive = showActive && !locked && tier.min === activeTier.min;
      const lock = tier.requiresAuth
        ? `<span class="tier-lock"${locked ? '' : ' hidden'}>Members-Only</span>`
        : '';
      const authAttr = tier.requiresAuth ? ' data-requires-auth="true"' : '';
      const lockClass = locked ? ' locked' : '';
      const activeClass = isActive ? ' active' : '';
      const disabledAttr = locked ? ' disabled aria-disabled="true"' : ' aria-disabled="false"';
      const titleAttr = locked ? ' title="Sign in to unlock this pricing tier"' : '';
      return `
        <button class="tier${lockClass}${activeClass}" type="button" data-min="${tier.min}"${authAttr}${disabledAttr}${titleAttr}>
          <span class="tier-main">
            <span class="tier-range">${tier.label}</span>
            ${lock}
          </span>
          <span class="tier-price">$${tier.unitUSD.toFixed(4)}/Unit</span>
        </button>`;
    }).join('');

    bindTierClicks();
    updateAuthUI();
  }

  function renderKit() {
    if (!kitBtn) return;
    const size = catalog.getSize(currentSizeId);
    const kit = size.kit;
    const perUnit = kit.priceUSD / kit.units;
    const titleEl = $('#kit-title');
    const priceEl = $('#kit-price');
    const metaEl = $('#kit-meta');
    if (titleEl) titleEl.textContent = `${kit.title} — ${size.label}`;
    if (priceEl) priceEl.textContent = `$${kit.priceUSD.toFixed(2)}`;
    if (metaEl) metaEl.textContent = `${kit.units} dowels • $${perUnit.toFixed(2)}/unit`;
  }

  function applyModeUI(mode) {
    orderMode = mode;
    if (mode === 'kit') {
      kitBtn?.classList.add('active');
      tierButtons().forEach((b) => b.classList.remove('active'));
      if (qtyInput) {
        qtyInput.step = '1';
        qtyInput.min = String(KIT_MIN);
        qtyInput.max = String(KIT_MAX);
      }
      if (qtyLabel) qtyLabel.textContent = 'Quantity (kits)';
      if (qtyUnitLabel) qtyUnitLabel.textContent = 'kits';
      if (priceLabel) priceLabel.textContent = 'Price per kit:';
      if (calcCallout) {
        calcCallout.innerHTML = '<strong>Kit Orders:</strong> Each Starter Kit ships 300 dowels. Choose how many kits you’d like below.';
      }
    } else {
      kitBtn?.classList.remove('active');
      if (qtyInput) {
        qtyInput.step = String(STEP);
        qtyInput.min = String(MIN_QTY);
        qtyInput.max = String(maxAllowedQty());
      }
      if (qtyLabel) qtyLabel.textContent = 'Quantity (units)';
      if (qtyUnitLabel) qtyUnitLabel.textContent = 'units';
      if (priceLabel) priceLabel.textContent = 'Price per unit:';
      if (calcCallout) {
        calcCallout.innerHTML = '<strong>Ordering Requirements:</strong> Orders are available in 5,000-unit increments only. Minimum 5,000 units, maximum 960,000 units.';
      }
    }
  }

  function renderKitCalc() {
    const size = catalog.getSize(currentSizeId);
    const kitPrice = size.kit.priceUSD;
    if (qtyInput) qtyInput.value = kitQty;
    if (perUnitEl) perUnitEl.textContent = `$${kitPrice.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `$${(kitQty * kitPrice).toFixed(2)}`;
  }

  function setKitQtyAndRecalc(newQty) {
    kitQty = clampKitQty(newQty);
    renderKitCalc();
  }

  function setQtyAndRecalc(newQty) {
    const qty = clampToStep(newQty);
    bulkQty = qty;
    if (qtyInput) qtyInput.value = qty;
    const ppu = catalog.unitPriceUSD(currentSizeId, qty);
    if (perUnitEl) perUnitEl.textContent = `$${ppu.toFixed(4)}`;
    if (totalEl) totalEl.textContent = `$${(qty * ppu).toFixed(2)}`;

    const active = catalog.pickTier(currentSizeId, qty);
    tierButtons().forEach((btn) => {
      const on = !btn.disabled && Number(btn.dataset.min) === active.min;
      btn.classList.toggle('active', on);
    });
  }

  function updateAuthUI() {
    tierButtons().forEach((btn) => {
      const requiresAuth = btn.dataset.requiresAuth === 'true';
      const locked = requiresAuth && !isAuthenticated;
      btn.classList.toggle('locked', locked);
      btn.disabled = locked;
      btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
      if (locked) {
        btn.title = 'Sign in to unlock this pricing tier';
      } else {
        btn.removeAttribute('title');
      }
      const lockLabel = btn.querySelector('.tier-lock');
      if (lockLabel) lockLabel.hidden = !locked;
    });

    if (orderMode === 'bulk' && qtyInput) {
      qtyInput.max = String(maxAllowedQty());
      if (bulkQty > maxAllowedQty()) setQtyAndRecalc(maxAllowedQty());
    }
  }

  function bindTierClicks() {
    tierButtons().forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled || (btn.dataset.requiresAuth === 'true' && !isAuthenticated)) return;
        applyModeUI('bulk');
        setActiveTier(btn);
        setQtyAndRecalc(Number(btn.dataset.min || MIN_QTY));
      });
    });
  }

  function initClerk() {
    if (window.Clerk) {
      window.Clerk.load().then(() => {
        isAuthenticated = !!window.Clerk.user;
        updateAuthUI();
        window.Clerk.addListener((clerk) => {
          isAuthenticated = !!clerk.user;
          updateAuthUI();
        });
      });
    } else {
      setTimeout(initClerk, 100);
    }
  }

  initClerk();
  applyModeUI('bulk');
  setActiveSize(currentSizeId);
  updateHeaderBadge();

  sizePicker?.querySelectorAll('.size-option').forEach((btn) => {
    btn.addEventListener('click', () => setActiveSize(btn.dataset.size));
  });

  minusBtn?.addEventListener('click', () => {
    if (orderMode === 'kit') setKitQtyAndRecalc(kitQty - 1);
    else setQtyAndRecalc(clampToStep(qtyInput.value) - STEP);
  });
  plusBtn?.addEventListener('click', () => {
    if (orderMode === 'kit') setKitQtyAndRecalc(kitQty + 1);
    else setQtyAndRecalc(clampToStep(qtyInput.value) + STEP);
  });

  qtyInput?.addEventListener('change', () => {
    if (orderMode === 'kit') setKitQtyAndRecalc(qtyInput.value);
    else setQtyAndRecalc(qtyInput.value);
  });
  qtyInput?.addEventListener('input', () => {
    const v = Number(qtyInput.value);
    if (!isFinite(v)) return;
    if (orderMode === 'kit') {
      const kitPrice = catalog.getSize(currentSizeId).kit.priceUSD;
      const q = Math.min(Math.max(v, KIT_MIN), KIT_MAX);
      if (totalEl) totalEl.textContent = `$${(q * kitPrice).toFixed(2)}`;
    } else {
      const ppu = catalog.unitPriceUSD(currentSizeId, Math.min(Math.max(v, MIN_QTY), MAX_QTY));
      if (perUnitEl) perUnitEl.textContent = `$${ppu.toFixed(4)}`;
    }
  });

  addBtn?.addEventListener('click', () => {
    let cart = loadCart();

    if (cart.some((i) => i.type === 'test')) {
      alert('Please remove the test order from your cart before adding products.');
      return;
    }

    if (orderMode === 'kit') {
      const size = catalog.getSize(currentSizeId);
      const existing = cart.find((i) => i.type === 'kit' && catalog.normalizeSizeId(i.sizeId) === currentSizeId);
      if (existing) {
        existing.qty = kitQty;
        existing.sizeId = currentSizeId;
      } else {
        cart.push({
          type: 'kit',
          sizeId: currentSizeId,
          qty: kitQty,
          price: size.kit.priceUSD,
          title: catalog.kitProductName(currentSizeId)
        });
      }
    } else {
      const qty = clampToStep(qtyInput.value);
      const requiresAuth = catalog.pickTier(currentSizeId, qty).requiresAuth;

      if (requiresAuth && !isAuthenticated) {
        alert('Please sign in or create an account to order 25,000+ units.');
        if (window.Clerk) window.Clerk.openSignIn();
        return;
      }

      const sizeId = currentSizeId;
      const bulk = cart.find((i) => i.type === 'bulk' && catalog.normalizeSizeId(i.sizeId) === sizeId);
      if (bulk) {
        bulk.units = qty;
        bulk.sizeId = sizeId;
        delete bulk.qty;
      } else {
        cart.push({ type: 'bulk', sizeId, units: qty });
      }
    }

    saveCart(cart);

    const originalText = addBtn.textContent;
    addBtn.textContent = '✓ Updated Cart';
    setTimeout(() => {
      addBtn.textContent = originalText;
    }, 1500);
  });

  kitBtn?.addEventListener('click', () => {
    applyModeUI('kit');
    renderKitCalc();
  });

  testKitBtn?.addEventListener('click', () => {
    const cart = [{ type: 'test', qty: 1, price: 1.0, title: '🧪 Webhook Test Order (1 unit)' }];
    saveCart(cart);
    const originalText = testKitBtn.innerHTML;
    testKitBtn.innerHTML = '<div style="text-align:center;"><strong>✓ Added to Cart</strong><div class="muted">Go to checkout to test webhook</div></div>';
    testKitBtn.style.background = '#10b981';
    testKitBtn.style.color = '#fff';
    setTimeout(() => {
      testKitBtn.innerHTML = originalText;
      testKitBtn.style.background = '';
      testKitBtn.style.color = '';
    }, 2000);
  });
})();
