// /api/seed-invoice-counter.js
// One-time script to seed the invoice counter to 41 so next invoice is 42
export const config = { runtime: 'nodejs' };

import { upsertCounter } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple auth check - require a secret token
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== process.env.ADMIN_SEED_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const counterKey = process.env.VERCEL_ENV === 'production' ? 'invoice_prod' : 'invoice_preview';
    const result = await upsertCounter(counterKey, 41);

    res.status(200).json({
      ok: true,
      message: `Invoice counter set to 41. Next invoice will be #42`,
      counterKey,
      currentValue: result
    });
  } catch (err) {
    console.error('Failed to seed invoice counter:', err);
    res.status(500).json({ error: 'Failed to seed counter', details: err.message });
  }
}
