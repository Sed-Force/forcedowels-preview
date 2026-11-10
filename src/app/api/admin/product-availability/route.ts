import { listSizes, normalizeSizeId } from '@/lib/products';
import { getAvailabilityMap, setAvailability } from '@/server/availability';
import { requireAdmin, noStore } from '@/server/adminGuard';
import { errorMessage, jsonError, readJson } from '@/server/http';

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const availability = await getAvailabilityMap();
    const products = listSizes().map((size) => ({
      id: size.id, label: size.label, sku: size.sku, inStock: availability[size.id] !== false,
    }));
    return Response.json({ ok: true, products }, { headers: noStore });
  } catch (err) {
    return jsonError(500, 'Failed to load product availability', { message: errorMessage(err) });
  }
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const body = await readJson<{ sizeId?: string; inStock?: boolean }>(request);
  if (!body?.sizeId || typeof body.inStock !== 'boolean') {
    return jsonError(400, 'sizeId and inStock (boolean) are required');
  }

  try {
    const id = await setAvailability(normalizeSizeId(body.sizeId), body.inStock);
    return Response.json({ ok: true, sizeId: id, inStock: body.inStock });
  } catch (err) {
    console.error('admin product-availability error:', err);
    return jsonError(500, 'Failed to update product availability', { message: errorMessage(err) });
  }
}
