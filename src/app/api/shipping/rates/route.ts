import { UnifiedShippingService } from '@/server/unified-shipping-service';
import { errorMessage, jsonError, readJson } from '@/server/http';

interface RatesRequest {
  to?: { city?: string; state?: string; country?: string; postal?: string; zip?: string };
  items?: Array<{ type: string; units?: number; qty?: number }>;
}

export async function GET() {
  return Response.json({
    endpoint: '/api/shipping/rates',
    method: 'POST',
    description: 'Get shipping rates from the appropriate carrier based on quantity',
    routing: {
      USPS: 'Small parcels and kits (< 5,000 units)',
      UPS: 'Medium to large parcels (5,000 - 79,999 units)',
      TQL: 'Freight/pallets (80,000+ units)',
    },
  });
}

export async function POST(request: Request) {
  const body = await readJson<RatesRequest>(request);
  const { items, to } = body ?? {};

  if (!Array.isArray(items) || !to) {
    return jsonError(400, 'Invalid request', { details: 'items (array) and to (object) are required' });
  }
  for (const field of ['city', 'state', 'country'] as const) {
    if (!to[field]) {
      return jsonError(400, 'Invalid destination address', { details: `Missing required field: ${field}` });
    }
  }
  if (!to.postal && !to.zip) {
    return jsonError(400, 'Invalid destination address', { details: 'Either postal or zip is required' });
  }
  if (items.length === 0) {
    return jsonError(400, 'Invalid request', { details: 'items array cannot be empty' });
  }

  try {
    const result = await new UnifiedShippingService().getShippingRates(to, items);
    return Response.json(result);
  } catch (err) {
    console.error('[Rates API] Unexpected error:', err);
    return jsonError(500, 'Shipping rate request failed', { details: errorMessage(err) });
  }
}
