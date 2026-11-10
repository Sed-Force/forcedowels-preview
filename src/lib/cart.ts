import {
  MAX_UNITS, MIN_UNITS, STEP,
  bulkTotalCents, kitPriceCents, kitUnits, normalizeSizeId,
  type SizeId,
} from './products';

export const CART_STORAGE_KEY = 'fd_cart';
export const CART_EVENT = 'fd_cart_updated';
export const KIT_MIN = 1;
export const KIT_MAX = 999;

export type CartItem =
  | { type: 'bulk'; sizeId: SizeId; units: number }
  | { type: 'kit'; sizeId: SizeId; qty: number };

export const clampBulkUnits = (value: number, max = MAX_UNITS): number => {
  const stepped = Math.round(Number(value) / STEP) * STEP;
  if (!Number.isFinite(stepped) || stepped < MIN_UNITS) return MIN_UNITS;
  return Math.min(stepped, max);
};

export const clampKitQty = (value: number): number => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < KIT_MIN) return KIT_MIN;
  return Math.min(n, KIT_MAX);
};

/** Parse and sanitise a raw localStorage payload into valid cart items. */
export function parseCart(raw: string | null): CartItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const items: CartItem[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const it = entry as Record<string, unknown>;
    if (it.type === 'bulk' && Number(it.units) > 0) {
      items.push({ type: 'bulk', sizeId: normalizeSizeId(it.sizeId), units: clampBulkUnits(Number(it.units)) });
    } else if (it.type === 'kit' && Number(it.qty) > 0) {
      items.push({ type: 'kit', sizeId: normalizeSizeId(it.sizeId), qty: clampKitQty(Number(it.qty)) });
    }
  }
  return items;
}

export const lineTotalCents = (item: CartItem): number =>
  item.type === 'bulk' ? bulkTotalCents(item.sizeId, item.units) : kitPriceCents(item.sizeId) * item.qty;

export const cartSubtotalCents = (items: CartItem[]): number =>
  items.reduce((sum, item) => sum + lineTotalCents(item), 0);

/** Total dowels in the cart (shown on the navbar badge). */
export const cartUnits = (items: CartItem[]): number =>
  items.reduce((sum, item) => sum + (item.type === 'bulk' ? item.units : item.qty * kitUnits(item.sizeId)), 0);

/** Merge duplicate lines per size and per type. */
export function consolidateCart(items: CartItem[]): CartItem[] {
  const bulk = new Map<SizeId, number>();
  const kits = new Map<SizeId, number>();
  for (const item of items) {
    if (item.type === 'bulk') bulk.set(item.sizeId, (bulk.get(item.sizeId) ?? 0) + item.units);
    else kits.set(item.sizeId, (kits.get(item.sizeId) ?? 0) + item.qty);
  }
  return [
    ...[...bulk].map(([sizeId, units]): CartItem => ({ type: 'bulk', sizeId, units: clampBulkUnits(units) })),
    ...[...kits].map(([sizeId, qty]): CartItem => ({ type: 'kit', sizeId, qty })),
  ];
}
