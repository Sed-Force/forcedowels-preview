// Shared formatting helpers for order e-mails (customer confirmations + internal notifications).
import {
  DEFAULT_SIZE_ID, bulkTotalCents, expandSummaryLines, kitPriceCents, kitUnits, pickTier,
  type OrderLine,
} from '@/lib/products';

/** Order summary stored in Stripe session metadata by the checkout route. */
export interface MetaSummary {
  bulkUnits?: number;
  kits?: number;
  tests?: number;
  lines?: unknown[];
}

export function formatMoney(cents: unknown): string {
  return (Number(cents || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

export function unitPriceForLine(line: OrderLine): number {
  if (line.type === 'bulk') return pickTier(line.sizeId, line.units).unitUSD;
  return kitPriceCents(line.sizeId) / 100 / kitUnits(line.sizeId);
}

export function lineTotalCents(line: OrderLine): number {
  return line.type === 'bulk' ? bulkTotalCents(line.sizeId, line.units) : kitPriceCents(line.sizeId) * line.qty;
}

/** Order lines from metadata, falling back to the legacy bulkUnits/kits totals. */
export function resolveOrderLines(metaSummary: MetaSummary = {}): OrderLine[] {
  const expanded = expandSummaryLines(metaSummary.lines || []);
  if (expanded.length) return expanded;

  const lines: OrderLine[] = [];
  if ((metaSummary.bulkUnits ?? 0) > 0) {
    lines.push({ type: 'bulk', sizeId: DEFAULT_SIZE_ID, units: Number(metaSummary.bulkUnits) });
  }
  if ((metaSummary.kits ?? 0) > 0) {
    lines.push({ type: 'kit', sizeId: DEFAULT_SIZE_ID, qty: Number(metaSummary.kits) });
  }
  return lines;
}
