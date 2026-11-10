// /api/_lib/email/orderFormatting.js
// Shared formatting helpers for order emails (customer confirmations + internal notifications).

import {
  bulkTotalCents,
  kitPriceCents,
  kitUnits,
  pickTier,
  expandSummaryLines,
  DEFAULT_SIZE_ID
} from '../products.js';

export function formatMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  });
}

export function unitPriceForLine(line) {
  if (line.type === 'bulk') {
    return pickTier(line.sizeId, line.units).unitUSD;
  }
  if (line.type === 'kit') {
    const units = kitUnits(line.sizeId);
    return kitPriceCents(line.sizeId) / 100 / units;
  }
  return 0;
}

export function lineTotalCents(line) {
  if (line.type === 'bulk') return bulkTotalCents(line.sizeId, line.units);
  if (line.type === 'kit') return kitPriceCents(line.sizeId) * line.qty;
  return 0;
}

export function resolveOrderLines(metaSummary = {}) {
  const expanded = expandSummaryLines(metaSummary.lines || []);
  if (expanded.length) return expanded;

  const lines = [];
  if (metaSummary.bulkUnits > 0) {
    lines.push({ type: 'bulk', sizeId: DEFAULT_SIZE_ID, units: Number(metaSummary.bulkUnits) });
  }
  if (metaSummary.kits > 0) {
    lines.push({ type: 'kit', sizeId: DEFAULT_SIZE_ID, qty: Number(metaSummary.kits) });
  }
  return lines;
}
