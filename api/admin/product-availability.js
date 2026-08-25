// /api/admin/product-availability.js
// Admin read/write of per-size in-stock status.
import { json, applyCORS } from '../_lib/auth.js';
import { getAvailabilityMap, setAvailability } from '../_lib/availability.js';
import { listSizes, normalizeSizeId } from '../_lib/products.js';

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;

  try {
    if (req.method === 'GET') {
      const availability = await getAvailabilityMap();
      const products = listSizes().map((size) => ({
        id: size.id,
        label: size.label,
        sku: size.sku,
        inStock: availability[size.id] !== false
      }));
      return json(res, 200, { ok: true, products });
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const { sizeId, inStock } = body;

      if (!sizeId || typeof inStock !== 'boolean') {
        return json(res, 400, { error: 'sizeId and inStock (boolean) are required' });
      }

      const id = await setAvailability(normalizeSizeId(sizeId), inStock);
      return json(res, 200, { ok: true, sizeId: id, inStock });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('admin product-availability error:', err);
    return json(res, 500, { error: 'Failed to update product availability', message: err.message });
  }
}
