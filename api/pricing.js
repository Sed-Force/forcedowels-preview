// /api/pricing.js — returns unit price + total for a given quantity of units
import { json, applyCORS } from './_lib/auth.js';

// Config (you can move to env later if you want)
const STEP = 5000;               // order in 5k increments
const MIN_UNITS = 5000;
const MAX_UNITS = 960000;

// Tiers (USD per unit)
const TIERS = [
  { max: 20000,   unitUSD: 0.072, requiresAuth: false, label: '5,000–20,000' },
  { max: 160000,  unitUSD: 0.0675, requiresAuth: true,  label: '20,000–160,000' },
  { max: 960000,  unitUSD: 0.063, requiresAuth: true,   label: '160,000–960,000' }
];

function pickTier(units) {
  for (const t of TIERS) if (units <= t.max) return t;
  return null;
}

function toCents(amountUSD) {
  // round to nearest cent to avoid floating error
  return Math.round(amountUSD * 100);
}

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;
  const u = Number((req.method === 'GET' ? req.query.units : (await readBody(req)).units) || 0);

  if (!Number.isFinite(u) || u < MIN_UNITS || u > MAX_UNITS || u % STEP !== 0) {
    return json(res, 400, { error: `Quantity must be between ${MIN_UNITS} and ${MAX_UNITS} in ${STEP}-unit increments.` });
  }

  const tier = pickTier(u);
  if (!tier) return json(res, 400, { error: 'No tier matches the requested quantity.' });

  const unitUSD = tier.unitUSD;
  const totalCents = toCents(u * unitUSD);

  return json(res, 200, {
    ok: true,
    units: u,
    unitUSD,
    unitCents: toCents(unitUSD),    // mostly for display; fractional cents will round
    totalCents,
    requiresAuth: tier.requiresAuth,
    tierLabel: tier.label
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}
