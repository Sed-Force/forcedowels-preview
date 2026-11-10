/* Canonical browser catalog: sizes, bulk tiers, and kit pricing.
   Keep in sync with /api/_lib/products.js */
(function (root) {
  const STEP = 5000;
  const MIN_UNITS = 5000;
  const MAX_UNITS = 960000;
  const DEFAULT_SIZE_ID = '8x38';

  const SIZES = [
    {
      id: '8x38',
      label: '8mm × 38mm',
      sku: 'FD-8X38',
      isOriginal: true,
      bulkTiers: [
        { min: 5000, max: 24999, unitUSD: 0.072, requiresAuth: false, label: '5,000–20,000' },
        { min: 25000, max: 960000, unitUSD: 0.0675, requiresAuth: true, label: '25,000–100,000' },
        // { min: 25000, max: 164999, unitUSD: 0.0675, requiresAuth: true, label: '25,000–164,999' },
        // { min: 165000, max: 960000, unitUSD: 0.063, requiresAuth: true, label: '165,000–960,000' }
      ],
      kit: { units: 300, priceUSD: 36, title: 'Force Dowels Kit' }
    },
    {
      id: '8x30',
      label: '8mm × 30mm',
      sku: 'FD-8X30',
      isOriginal: false,
      bulkTiers: [
        { min: 5000, max: 24999, unitUSD: 0.072, requiresAuth: false, label: '5,000–20,000' },
        { min: 25000, max: 960000, unitUSD: 0.0675, requiresAuth: true, label: '25,000–100,000' },
        // { min: 25000, max: 164999, unitUSD: 0.0675, requiresAuth: true, label: '25,000–164,999' },
        // { min: 165000, max: 960000, unitUSD: 0.063, requiresAuth: true, label: '165,000–960,000' }
      ],
      kit: { units: 300, priceUSD: 36, title: 'Force Dowels Kit' }
    },
    {
      id: '6x30',
      label: '6mm × 30mm',
      sku: 'FD-6X30',
      isOriginal: false,
      bulkTiers: [
        { min: 5000, max: 24999, unitUSD: 0.072, requiresAuth: false, label: '5,000–20,000' },
        { min: 25000, max: 960000, unitUSD: 0.0675, requiresAuth: true, label: '25,000–100,000' },
        // // { min: 25000, max: 164999, unitUSD: 0.0675, requiresAuth: true, label: '25,000–164,999' },
        // { min: 165000, max: 960000, unitUSD: 0.063, requiresAuth: true, label: '165,000–960,000' }
      ],
      kit: { units: 300, priceUSD: 36, title: 'Force Dowels Kit' }
    }
  ];

  function normalizeSizeId(id) {
    const key = String(id || '').toLowerCase().replace(/\s+/g, '');
    return SIZES.some((s) => s.id === key) ? key : DEFAULT_SIZE_ID;
  }

  function getSize(id) {
    const key = normalizeSizeId(id);
    return SIZES.find((s) => s.id === key);
  }

  function pickTier(sizeId, units) {
    const size = getSize(sizeId);
    const qty = Number(units) || 0;
    let matched = size.bulkTiers[0];
    for (const tier of size.bulkTiers) {
      if (qty >= tier.min) matched = tier;
    }
    return matched;
  }

  function unitPriceUSD(sizeId, units) {
    return pickTier(sizeId, units).unitUSD;
  }

  function bulkTotalCents(sizeId, units) {
    const n = Number(units);
    if (!Number.isFinite(n) || n < MIN_UNITS) return 0;
    const mills = Number((unitPriceUSD(sizeId, n) * 1000).toFixed(4));
    return Math.round((n * mills) / 10);
  }

  function kitPriceUSD(sizeId) {
    return getSize(sizeId).kit.priceUSD;
  }

  function kitUnits(sizeId) {
    return getSize(sizeId).kit.units;
  }

  function sizeLabel(id) {
    return getSize(id).label;
  }

  function bulkProductName(sizeId) {
    return 'Force Dowels — ' + sizeLabel(sizeId) + ' Bulk';
  }

  function kitProductName(sizeId) {
    const size = getSize(sizeId);
    return 'Force Dowels — ' + size.label + ' Kit (' + size.kit.units + ')';
  }

  root.FDProducts = {
    STEP,
    MIN_UNITS,
    MAX_UNITS,
    DEFAULT_SIZE_ID,
    SIZES,
    normalizeSizeId,
    getSize,
    pickTier,
    unitPriceUSD,
    bulkTotalCents,
    kitPriceUSD,
    kitUnits,
    sizeLabel,
    bulkProductName,
    kitProductName
  };
})(typeof window !== 'undefined' ? window : globalThis);
