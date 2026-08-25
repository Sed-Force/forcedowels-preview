// /api/product-availability.js — public read of per-size in-stock status
import { json, applyCORS } from './_lib/auth.js';
import { getAvailabilityMap } from './_lib/availability.js';

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const availability = await getAvailabilityMap();
    return json(res, 200, { ok: true, availability });
  } catch (err) {
    console.error('product-availability error:', err);
    return json(res, 500, { error: 'Failed to load product availability', message: err.message });
  }
}
