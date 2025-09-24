// /api/_lib/db.js
import { neon } from '@neondatabase/serverless';

// Prefer unpooled URL in serverless environments
const DB_URL =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL;

const sql = DB_URL ? neon(DB_URL) : null;

export async function ensureCounterTable() {
  if (!sql) return;
  await sql/*sql*/`
    create table if not exists order_counter (
      id  text primary key,
      seq bigint not null
    );
  `;
}

// Atomically increment and return the next sequence
export async function nextOrderNumberDB(key = 'order_seq_preview') {
  if (!sql) return 0;
  await ensureCounterTable();
  const rows = await sql/*sql*/`
    insert into order_counter (id, seq)
    values (${key}, 1)
    on conflict (id) do update
      set seq = order_counter.seq + 1
    returning seq;
  `;
  return Number(rows?.[0]?.seq ?? 0);
}
