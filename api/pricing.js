// /api/pricing.js — source of truth for tiered unit pricing
import { json, applyCORS } from './_lib/auth.js';
import {
  STEP,
  MIN_UNITS,
  MAX_UNITS,
  normalizeSizeId,
  pickTier,
  unitPriceUSD,
  bulkTotalCents,
  listSizes,
  getSize
} from './_lib/products.js';

const toCents = (usd) => Math.round(usd * 100);

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;

  let units = 0;
  let sizeId = '';
  if (req.method === 'GET') {
    if (req.query.catalog === '1' || (!req.query.units && !req.query.size)) {
      return json(res, 200, {
        ok: true,
        sizes: listSizes()
      });
    }
    units = Number(req.query.units || 0);
    sizeId = normalizeSizeId(req.query.size);
  } else if (req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      units = Number(body.units || 0);
      sizeId = normalizeSizeId(body.size);
    } catch { return json(res, 400, { error: 'Invalid JSON body' }); }
  } else {
    return json(res, 405, { error: 'Method not allowed' });
  }

  if (!Number.isFinite(units) || units < MIN_UNITS || units > MAX_UNITS || units % STEP !== 0) {
    return json(res, 400, { error: `Quantity must be between ${MIN_UNITS} and ${MAX_UNITS} in ${STEP}-unit increments.` });
  }

  const size = getSize(sizeId);
  const tier = pickTier(sizeId, units);
  if (!tier) return json(res, 400, { error: 'No tier matches the requested quantity.' });

  const unitUSD = unitPriceUSD(sizeId, units);
  const totalCents = bulkTotalCents(sizeId, units);

  return json(res, 200, {
    ok: true,
    sizeId: size.id,
    sizeLabel: size.label,
    units,
    unitUSD,
    unitCents: toCents(unitUSD),
    totalCents,
    requiresAuth: tier.requiresAuth,
    tierLabel: tier.label
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
