import {
  MAX_UNITS, MIN_UNITS, STEP,
  bulkTotalCents, getSize, listSizes, normalizeSizeId, pickTier, unitPriceUSD,
} from '@/lib/products';
import { jsonError, readJson } from '@/server/http';

function priceQuote(units: number, rawSize: unknown) {
  if (!Number.isFinite(units) || units < MIN_UNITS || units > MAX_UNITS || units % STEP !== 0) {
    return jsonError(400, `Quantity must be between ${MIN_UNITS} and ${MAX_UNITS} in ${STEP}-unit increments.`);
  }
  const sizeId = normalizeSizeId(rawSize);
  const size = getSize(sizeId);
  const tier = pickTier(sizeId, units);
  const unitUSD = unitPriceUSD(sizeId, units);

  return Response.json({
    ok: true,
    sizeId: size.id,
    sizeLabel: size.label,
    units,
    unitUSD,
    unitCents: Math.round(unitUSD * 100),
    totalCents: bulkTotalCents(sizeId, units),
    requiresAuth: tier.requiresAuth,
    tierLabel: tier.label,
  });
}

/** Source of truth for tiered unit pricing (catalog when no quantity is given). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get('catalog') === '1' || (!params.get('units') && !params.get('size'))) {
    return Response.json({ ok: true, sizes: listSizes() });
  }
  return priceQuote(Number(params.get('units') || 0), params.get('size'));
}

export async function POST(request: Request) {
  const body = await readJson<{ units?: number; size?: string }>(request);
  if (!body) return jsonError(400, 'Invalid JSON body');
  return priceQuote(Number(body.units || 0), body.size);
}
