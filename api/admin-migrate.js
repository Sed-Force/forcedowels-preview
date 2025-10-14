// /api/admin-migrate.js

function send(res, code, data) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  try {
    // Dynamic import to avoid module loading issues
    const { sql, ensureCounterTable, upsertCounter, getCounter, nextCounter } = await import('./_lib/db.js');

    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

    const token = req.query.token || req.headers['x-admin-token'];
    if (!process.env.ADMIN_SEED_TOKEN || token !== process.env.ADMIN_SEED_TOKEN) {
      return send(res, 401, { error: 'unauthorized' });
    }

    const action = String(req.query.action || 'help');
    const schema = (req.query.schema || 'public').toString();
    const table  = (req.query.table  || 'orders').toString();
    const key    = (req.query.key    || '').toString();
    const value  = Number(req.query.value || 0);

    if (!sql) return send(res, 500, { error: 'No database URL configured.' });

    switch (action) {
      case 'help':
        return send(res, 200, {
          ok: true,
          actions: {
            counter_init:  '/api/admin-migrate?action=counter_init&token=…',
            seed_preview:  '/api/admin-migrate?action=seed&key=order_seq_preview&value=0&token=…',
            seed_prod:     '/api/admin-migrate?action=seed&key=order_seq_prod&value=30&token=…',
            show_preview:  '/api/admin-migrate?action=show&key=order_seq_preview&token=…',
            show_prod:     '/api/admin-migrate?action=show&key=order_seq_prod&token=…',
            test_next:     '/api/admin-migrate?action=next&key=order_seq_preview&token=…',
            add_ship_cols: '/api/admin-migrate?action=add_shipping_cols&schema=public&table=orders&token=…'
          }
        });

      case 'counter_init': {
        await ensureCounterTable();
        return send(res, 200, { ok: true, created: 'order_counter' });
      }

      case 'seed': {
        if (!key) return send(res, 400, { error: 'missing key' });
        const seq = await upsertCounter(key, value);
        return send(res, 200, { ok: true, key, seq });
      }

      case 'show': {
        if (!key) return send(res, 400, { error: 'missing key' });
        const seq = await getCounter(key);
        return send(res, 200, { ok: true, key, seq });
      }

      case 'next': {
        if (!key) return send(res, 400, { error: 'missing key' });
        const seq = await nextCounter(key);
        return send(res, 200, { ok: true, key, seq_after_increment: seq });
      }

      case 'add_shipping_cols': {
        // Safe, idempotent ALTERs (runs only if columns are missing)
        await sql/*sql*/`
          alter table ${sql(schema)}.${sql(table)}
          add column if not exists carrier_name     varchar(100),
          add column if not exists carrier_service  varchar(100),
          add column if not exists carrier_tracking varchar(100);
        `;
        return send(res, 200, { ok: true, altered: `${schema}.${table}`, added: ['carrier_name','carrier_service','carrier_tracking'] });
      }

      default:
        return send(res, 400, { error: 'unknown action', action });
    }
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'server_error', detail: String(err) });
  }
}
