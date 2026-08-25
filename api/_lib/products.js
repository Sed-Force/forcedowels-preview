// Canonical product catalog: sizes, bulk tiers, and kit pricing.
// Keep in sync with /scripts/shared/products.js

export const STEP = 5000;
export const MIN_UNITS = 5000;
export const MAX_UNITS = 960000;
export const DEFAULT_SIZE_ID = '8x38';

export const SIZES = [
  {
    id: '8x38',
    label: '8mm × 38mm',
    sku: 'FD-8X38',
    isOriginal: true,
    bulkTiers: [
      { min: 5000, max: 24999, unitUSD: 0.072, requiresAuth: false, label: '5,000–24,999' },
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
    // Same quantity breaks as 8x38; update unitUSD / kit.priceUSD when this size’s list prices are set.
    bulkTiers: [
      { min: 5000, max: 24999, unitUSD: 0.072, requiresAuth: false, label: '5,000–24,999' },
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
    // Same quantity breaks as 8x38; update unitUSD / kit.priceUSD when this size’s list prices are set.
    bulkTiers: [
      { min: 5000, max: 24999, unitUSD: 0.072, requiresAuth: false, label: '5,000–24,999' },
      { min: 25000, max: 960000, unitUSD: 0.0675, requiresAuth: true, label: '25,000–100,000' },
      // { min: 25000, max: 164999, unitUSD: 0.0675, requiresAuth: true, label: '25,000–164,999' },
      // { min: 165000, max: 960000, unitUSD: 0.063, requiresAuth: true, label: '165,000–960,000' }
    ],
    kit: { units: 300, priceUSD: 36, title: 'Force Dowels Kit' }
  }
];

export function normalizeSizeId(id) {
  const key = String(id || '').toLowerCase().replace(/\s+/g, '');
  return SIZES.some((s) => s.id === key) ? key : DEFAULT_SIZE_ID;
}

export function getSize(id) {
  const key = normalizeSizeId(id);
  return SIZES.find((s) => s.id === key);
}

export function listSizes() {
  return SIZES;
}

export function pickTier(sizeId, units) {
  const size = getSize(sizeId);
  const qty = Number(units) || 0;
  let matched = size.bulkTiers[0];
  for (const tier of size.bulkTiers) {
    if (qty >= tier.min) matched = tier;
  }
  return matched;
}

export function unitPriceUSD(sizeId, units) {
  return pickTier(sizeId, units).unitUSD;
}

export function unitPriceMills(sizeId, units) {
  return Number((unitPriceUSD(sizeId, units) * 1000).toFixed(4));
}

export function bulkTotalCents(sizeId, units) {
  const n = Number(units);
  if (!Number.isFinite(n) || n < MIN_UNITS) return 0;
  return Math.round((n * unitPriceMills(sizeId, n)) / 10);
}

export function kitPriceCents(sizeId) {
  return Math.round(getSize(sizeId).kit.priceUSD * 100);
}

export function kitUnits(sizeId) {
  return getSize(sizeId).kit.units;
}

export function sizeLabel(id) {
  return getSize(id).label;
}

export function bulkProductName(sizeId) {
  return `Force Dowels — ${sizeLabel(sizeId)} Bulk`;
}

export function kitProductName(sizeId) {
  const size = getSize(sizeId);
  return `Force Dowels — ${size.label} Kit (${size.kit.units})`;
}

export function formatItemsSummary(lines = [], tests = 0) {
  if (tests > 0) return 'Test Order';
  const parts = [];
  for (const line of lines) {
    const type = line.type || (line.t === 'k' ? 'kit' : line.t === 'b' ? 'bulk' : '');
    const sizeId = line.sizeId || line.s;
    if (type === 'bulk') {
      const units = Number(line.units || line.u || 0);
      parts.push(`${sizeLabel(sizeId)} bulk ${units.toLocaleString()}`);
    } else if (type === 'kit') {
      const qty = Number(line.qty || line.q || 0);
      parts.push(`${sizeLabel(sizeId)} kit ×${qty}`);
    }
  }
  return parts.join('; ') || 'Custom Order';
}

export function compactSummaryLines(lines = []) {
  return lines.map((line) => {
    if (line.type === 'bulk') {
      return { t: 'b', s: normalizeSizeId(line.sizeId), u: Number(line.units) };
    }
    if (line.type === 'kit') {
      return { t: 'k', s: normalizeSizeId(line.sizeId), q: Number(line.qty) };
    }
    return null;
  }).filter(Boolean);
}

export function expandSummaryLines(compact = []) {
  return (Array.isArray(compact) ? compact : []).map((line) => {
    if (line.type === 'bulk' || line.t === 'b') {
      return { type: 'bulk', sizeId: normalizeSizeId(line.sizeId || line.s), units: Number(line.units || line.u || 0) };
    }
    if (line.type === 'kit' || line.t === 'k') {
      return { type: 'kit', sizeId: normalizeSizeId(line.sizeId || line.s), qty: Number(line.qty || line.q || 0) };
    }
    return null;
  }).filter(Boolean);
}
