import { connection } from 'next/server';
import { getAvailabilityMap } from '@/server/availability';
import { errorMessage, jsonError } from '@/server/http';

/** Public read of per-size in-stock status. */
export async function GET() {
  await connection(); // always read live stock; never prerender at build time
  try {
    const availability = await getAvailabilityMap();
    return Response.json({ ok: true, availability });
  } catch (err) {
    console.error('product-availability error:', err);
    return jsonError(500, 'Failed to load product availability', { message: errorMessage(err) });
  }
}
