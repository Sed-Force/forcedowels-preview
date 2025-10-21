// /api/pricing.js — source of truth for tiered unit pricing
import { json, applyCORS } from './_lib/auth.js';

const STEP = 5000;
const MIN_UNITS = 5000;
const MAX_UNITS = 960000;

// Special test product
const TEST_PRODUCT = { units: 1, unitUSD: 1.00, label: 'Test Product - $1' };

// Edit tier numbers here if pricing changes
const TIERS = [
  { max: 20000,   unitUSD: 0.072,  requiresAuth: false, label: '5,000–20,000' },
  { max: 160000,  unitUSD: 0.0675, requiresAuth: true,  label: '20,000–160,000' },
  { max: 960000,  unitUSD: 0.063,  requiresAuth: true,  label: '160,000–960,000' }
];

const toCents = (usd) => Math.round(usd * 100);

function pickTier(units) {
  for (const t of TIERS) if (units <= t.max) return t;
  return null;
}

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;

  let units = 0;
  if (req.method === 'GET') {
    units = Number(req.query.units || 0);
  } else if (req.method === 'POST') {
    try {
      const raw = await readBody(req);
      units = Number((raw && JSON.parse(raw).units) || 0);
    } catch { return json(res, 400, { error: 'Invalid JSON body' }); }
  } else {
    return json(res, 405, { error: 'Method not allowed' });
  }

  // Handle test product (1 unit for $1)
  if (units === TEST_PRODUCT.units) {
    return json(res, 200, {
      ok: true,
      units: TEST_PRODUCT.units,
      unitUSD: TEST_PRODUCT.unitUSD,
      unitCents: toCents(TEST_PRODUCT.unitUSD),
      totalCents: toCents(TEST_PRODUCT.units * TEST_PRODUCT.unitUSD),
      requiresAuth: false,
      tierLabel: TEST_PRODUCT.label
    });
  }

  if (!Number.isFinite(units) || units < MIN_UNITS || units > MAX_UNITS || units % STEP !== 0) {
    return json(res, 400, { error: `Quantity must be between ${MIN_UNITS} and ${MAX_UNITS} in ${STEP}-unit increments.` });
  }

  const tier = pickTier(units);
  if (!tier) return json(res, 400, { error: 'No tier matches the requested quantity.' });

  const unitUSD = tier.unitUSD;
  const totalCents = toCents(units * unitUSD);

  return json(res, 200, {
    ok: true,
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
