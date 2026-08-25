// /api/_lib/availability.js
// Per-size in-stock/out-of-stock state, toggled from the admin panel.
import { sql } from './db.js';
import { SIZES, normalizeSizeId } from './products.js';

async function ensureAvailabilityTable() {
  if (!sql) throw new Error('Database not configured');
  await sql`
    create table if not exists product_availability (
      size_id text primary key,
      in_stock boolean not null default true,
      updated_at timestamptz not null default now()
    );
  `;
}

// A size with no row is in stock by default (nothing has been marked out yet).
export async function getAvailabilityMap() {
  const map = Object.fromEntries(SIZES.map((s) => [s.id, true]));
  if (!sql) return map;

  await ensureAvailabilityTable();
  const rows = await sql`select size_id, in_stock from product_availability`;
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(map, row.size_id)) {
      map[row.size_id] = row.in_stock;
    }
  }
  return map;
}

export async function isInStock(sizeId) {
  const map = await getAvailabilityMap();
  return map[normalizeSizeId(sizeId)] !== false;
}

export async function setAvailability(sizeId, inStock) {
  const id = normalizeSizeId(sizeId);
  await ensureAvailabilityTable();
  await sql`
    insert into product_availability (size_id, in_stock, updated_at)
    values (${id}, ${inStock}, now())
    on conflict (size_id) do update set in_stock = excluded.in_stock, updated_at = now()
  `;
  return id;
}
