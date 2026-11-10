/**
 * Canonical product catalog: sizes, bulk pricing tiers and starter-kit pricing.
 *
 * This single module is imported by both the browser UI and the server route
 * handlers, so prices shown to the customer can never drift from the prices
 * charged by Stripe.
 */

export const STEP = 5000;
export const MIN_UNITS = 5000;
export const MAX_UNITS = 960000;

export type SizeId = '8x38' | '8x30' | '6x30';
export const DEFAULT_SIZE_ID: SizeId = '8x38';

export interface BulkTier {
  min: number;
  max: number;
  unitUSD: number;
  /** Tier is only purchasable by signed-in customers. */
  requiresAuth: boolean;
  label: string;
}

export interface ProductSize {
  id: SizeId;
  label: string;
  sku: string;
  bulkTiers: BulkTier[];
  kit: { units: number; priceUSD: number; title: string };
}

const STANDARD_TIERS: BulkTier[] = [
  { min: 5000, max: 24999, unitUSD: 0.072, requiresAuth: false, label: '5,000–20,000' },
  { min: 25000, max: 960000, unitUSD: 0.0675, requiresAuth: true, label: '25,000–100,000' },
];

const STANDARD_KIT = { units: 300, priceUSD: 36, title: 'Force Dowels Kit' };

export const SIZES: readonly ProductSize[] = [
  { id: '8x38', label: '8mm × 38mm', sku: 'FD-8X38', bulkTiers: STANDARD_TIERS, kit: STANDARD_KIT },
  { id: '8x30', label: '8mm × 30mm', sku: 'FD-8X30', bulkTiers: STANDARD_TIERS, kit: STANDARD_KIT },
  { id: '6x30', label: '6mm × 30mm', sku: 'FD-6X30', bulkTiers: STANDARD_TIERS, kit: STANDARD_KIT },
];

export function isSizeId(value: unknown): value is SizeId {
  return SIZES.some((s) => s.id === value);
}

export function normalizeSizeId(id: unknown): SizeId {
  const key = String(id ?? '').toLowerCase().replace(/\s+/g, '');
  return isSizeId(key) ? key : DEFAULT_SIZE_ID;
}

export function getSize(id: unknown): ProductSize {
  const key = normalizeSizeId(id);
  return SIZES.find((s) => s.id === key)!;
}

export function listSizes(): readonly ProductSize[] {
  return SIZES;
}

export function pickTier(sizeId: unknown, units: number): BulkTier {
  const size = getSize(sizeId);
  const qty = Number(units) || 0;
  let matched = size.bulkTiers[0];
  for (const tier of size.bulkTiers) {
    if (qty >= tier.min) matched = tier;
  }
  return matched;
}

export function unitPriceUSD(sizeId: unknown, units: number): number {
  return pickTier(sizeId, units).unitUSD;
}

/** Unit price expressed in tenths of a cent, e.g. $0.0720 → 72. */
export function unitPriceMills(sizeId: unknown, units: number): number {
  return Number((unitPriceUSD(sizeId, units) * 1000).toFixed(4));
}

/** Exact bulk total in cents (tenth-of-a-cent math, no rounding to $0.07). */
export function bulkTotalCents(sizeId: unknown, units: number): number {
  const n = Number(units);
  if (!Number.isFinite(n) || n < MIN_UNITS) return 0;
  return Math.round((n * unitPriceMills(sizeId, n)) / 10);
}

export function kitPriceCents(sizeId: unknown): number {
  return Math.round(getSize(sizeId).kit.priceUSD * 100);
}

export function kitPriceUSD(sizeId: unknown): number {
  return getSize(sizeId).kit.priceUSD;
}

export function kitUnits(sizeId: unknown): number {
  return getSize(sizeId).kit.units;
}

export function sizeLabel(id: unknown): string {
  return getSize(id).label;
}

export function bulkProductName(sizeId: unknown): string {
  return `Force Dowels — ${sizeLabel(sizeId)} Bulk`;
}

export function kitProductName(sizeId: unknown): string {
  const size = getSize(sizeId);
  return `Force Dowels — ${size.label} Kit (${size.kit.units})`;
}

// ── Order lines (shared by cart, checkout API and order e-mails) ───────────

export interface BulkLine { type: 'bulk'; sizeId: SizeId; units: number }
export interface KitLine { type: 'kit'; sizeId: SizeId; qty: number }
export type OrderLine = BulkLine | KitLine;

/** Compact line shape stored in Stripe metadata (500-char limit per value). */
export type CompactLine =
  | { t: 'b'; s: SizeId; u: number }
  | { t: 'k'; s: SizeId; q: number };

type LooseLine = Partial<{
  type: string; t: string; sizeId: string; s: string;
  units: number; u: number; qty: number; q: number;
}>;

export function compactSummaryLines(lines: OrderLine[] = []): CompactLine[] {
  return lines.map((line): CompactLine =>
    line.type === 'bulk'
      ? { t: 'b', s: normalizeSizeId(line.sizeId), u: Number(line.units) }
      : { t: 'k', s: normalizeSizeId(line.sizeId), q: Number(line.qty) },
  );
}

export function expandSummaryLines(compact: unknown = []): OrderLine[] {
  const list: LooseLine[] = Array.isArray(compact) ? compact : [];
  const lines: OrderLine[] = [];
  for (const line of list) {
    if (line.type === 'bulk' || line.t === 'b') {
      lines.push({
        type: 'bulk',
        sizeId: normalizeSizeId(line.sizeId ?? line.s),
        units: Number(line.units ?? line.u ?? 0),
      });
    } else if (line.type === 'kit' || line.t === 'k') {
      lines.push({
        type: 'kit',
        sizeId: normalizeSizeId(line.sizeId ?? line.s),
        qty: Number(line.qty ?? line.q ?? 0),
      });
    }
  }
  return lines;
}

export function formatItemsSummary(lines: LooseLine[] = [], tests = 0): string {
  if (tests > 0) return 'Test Order';
  const parts: string[] = [];
  for (const line of lines) {
    const type = line.type ?? (line.t === 'k' ? 'kit' : line.t === 'b' ? 'bulk' : '');
    const id = line.sizeId ?? line.s;
    if (type === 'bulk') {
      parts.push(`${sizeLabel(id)} bulk ${Number(line.units ?? line.u ?? 0).toLocaleString()}`);
    } else if (type === 'kit') {
      parts.push(`${sizeLabel(id)} kit ×${Number(line.qty ?? line.q ?? 0)}`);
    }
  }
  return parts.join('; ') || 'Custom Order';
}
