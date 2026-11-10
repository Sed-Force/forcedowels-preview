// /api/_lib/db.js
import { neon } from '@neondatabase/serverless';

const DB_URL =
  process.env.NEON_DATABASE_URL ||        // created by Vercel Neon integration
  process.env.DATABASE_URL_UNPOOLED ||    // your existing fallback
  process.env.DATABASE_URL;

export const sql = DB_URL ? neon(DB_URL) : null;

export async function ensureCounterTable() {
  if (!sql) throw new Error('No DB URL configured.');
  await sql/*sql*/`
    create table if not exists order_counter (
      id  text primary key,
      seq bigint not null
    );
  `;
}

export async function upsertCounter(key, value) {
  await ensureCounterTable();
  const rows = await sql/*sql*/`
    insert into order_counter (id, seq)
    values (${key}, ${value})
    on conflict (id) do update set seq = excluded.seq
    returning seq;
  `;
  return Number(rows?.[0]?.seq ?? 0);
}

export async function getCounter(key) {
  await ensureCounterTable();
  const rows = await sql/*sql*/`
    select seq from order_counter where id = ${key} limit 1;
  `;
  return Number(rows?.[0]?.seq ?? 0);
}

export async function nextCounter(key) {
  await ensureCounterTable();
  const rows = await sql/*sql*/`
    insert into order_counter (id, seq)
    values (${key}, 1)
    on conflict (id) do update set seq = order_counter.seq + 1
    returning seq;
  `;
  return Number(rows?.[0]?.seq ?? 0);
}
