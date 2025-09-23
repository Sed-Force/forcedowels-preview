// /api/checkout.js — MASTER (supports SKUs and tiered bulk checkout)
import { json, applyCORS, verifyAuth } from './_lib/auth.js';
import Stripe from 'stripe';

// ---------- Stripe ----------
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

// ---------- Fixed SKU allowlist (optional legacy packs) ----------
const ALLOWLIST = [
  process.env.STRIPE_PRICE_FORCE_100, // your $360.00 (5,000 units) TEST price ID
  process.env.STRIPE_PRICE_FORCE_500  // your $1,687.50 (25,000 units) TEST price ID
].filter(Boolean);

// Map browser SKUs -> Price IDs
const PRICE_BY_SKU = {
  'force-100': process.env.STRIPE_PRICE_FORCE_100,
  'force-500': process.env.STRIPE_PRICE_FORCE_500
};

// Optional shipping rates (shr_...)
const SHIPPING_RATES = String(process.env.STRIPE_SHIPPING_RATE_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// ---------- Tier config (mirror of /api/pricing.js) ----------
const STEP = 5000;
const MIN_UNITS = 5000;
const MAX_UNITS = 960000;
const TIERS = [
  { max: 20000,   unitUSD: 0.072,  requiresAuth: false, label: '5,000–20,000' },
  { max: 160000,  unitUSD: 0.0675, requiresAuth: true,  label: '20,000–160,000' },
  { max: 960000,  unitUSD: 0.063,  requiresAuth: true,  label: '160,000–960,000' }
];

function pickTier(units) {
  for (const t of TIERS) if (units <= t.max) return t;
  return null;
}
const toCents = (usd) => Math.round(usd * 100);

// ---------- Handler ----------
export default async function handler(req, res) {
  if (applyCORS(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!stripe) return json(res, 501, { error: 'Stripe not configured (set STRIPE_SECRET_KEY)' });

  // Parse body
  let body = {};
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : {};
  } catch { return json(res, 400, { error: 'Invalid JSON body' }); }

  // Optional identity (do not require for small tiers)
  let identity = null;
  try { identity = await verifyAuth(req); } catch {}

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host || ''}`).replace(/\/$/, '');
  const success_url = `${baseUrl}/order-success.html?session_id={CHECKOUT_SESSION_ID}`;
  const cancel_url = `${baseUrl}/order.html#cart`;

  // ------- Path A: BULK tiered checkout (preferred) -------
  if (typeof body.units === 'number') {
    const units = Number(body.units || 0);
    if (!Number.isFinite(units) || units < MIN_UNITS || units > MAX_UNITS || units % STEP !== 0) {
      return json(res, 400, { error: `Quantity must be between ${MIN_UNITS} and ${MAX_UNITS} in ${STEP}-unit increments.` });
    }
    const tier = pickTier(units);
    if (!tier) return json(res, 400, { error: 'No tier matches quantity.' });

    if (tier.requiresAuth && !identity?.userId) {
      return json(res, 401, { error: 'auth_required', message: 'Please sign in to order more than 20,000 units.' });
    }

    const totalCents = toCents(units * tier.unitUSD);

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          quantity: 1, // charge total as single line item (fractional-cent unit prices are handled)
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Force Dowels — ${units.toLocaleString()} units`,
              description: `${tier.label} @ $${tier.unitUSD.toFixed(4)}/unit`
            },
            unit_amount: totalCents
          }
        }],
        allow_promotion_codes: true,
        automatic_tax: { enabled: true },
        shipping_address_collection: { allowed_countries: ['US', 'CA'] },
        shipping_options: SHIPPING_RATES.map(id => ({ shipping_rate: id })),
        customer_email: identity?.email || undefined,
        client_reference_id: identity?.userId || undefined,
        success_url,
        cancel_url
      });
      return json(res, 200, { ok: true, url: session.url });
    } catch (err) {
      return json(res, 502, { error: 'Stripe session failed', detail: err?.message || String(err) });
    }
  }

  // ------- Path B: Fixed SKUs (legacy packs) -------
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return json(res, 400, { error: 'Cart is empty' });

  const line_items = [];
  for (const it of items) {
    const qty = Math.max(1, Number(it.quantity || 1));
    const priceFromSku = it.sku ? PRICE_BY_SKU[it.sku] : null;
    const price = String(it.priceId || priceFromSku || '');

    if (!price) return json(res, 400, { error: `Missing price for item (sku=${it.sku || 'n/a'})` });
    if (!ALLOWLIST.includes(price)) return json(res, 400, { error: `Disallowed priceId: ${price}` });

    line_items.push({ price, quantity: qty });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      shipping_options: SHIPPING_RATES.map(id => ({ shipping_rate: id })),
      customer_email: identity?.email || undefined,
      client_reference_id: identity?.userId || undefined,
      success_url,
      cancel_url
    });
    return json(res, 200, { ok: true, url: session.url });
  } catch (err) {
    return json(res, 502, { error: 'Stripe session failed', detail: err?.message || String(err) });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

