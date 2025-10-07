// /api/checkout.js  — MASTER (no fractional-cent rounding)
// Creates a Checkout Session where each cart line is priced as a single
// total (quantity=1, unit_amount=totalCents). Shipping is added as its own line.

export const config = { runtime: 'nodejs' };

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SK || '';
let stripe = null;
try {
  // eslint-disable-next-line global-require
  stripe = require('stripe')(STRIPE_KEY);
} catch {
  // Vercel may tree-shake in dev; handled below if missing
}

const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// ---------- Pricing (must match front-end/order logic) ----------
function unitPriceDollarsFor(units) {
  if (units >= 160000) return 0.0630;   // $0.0630
  if (units >= 20000)  return 0.0675;   // $0.0675
  return 0.0720;                        // $0.0720
}
function tierLabel(units) {
  if (units >= 160000) return '160,000–960,000';
  if (units >= 20000)  return '20,000–160,000';
  return '5,000–20,000';
}

const BULK_MIN = 5000, BULK_MAX = 960000, BULK_STEP = 5000;

// snap/guard like the client
function normalizeCart(items) {
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (it?.type === 'bulk') {
      let u = toNum(it.units, BULK_MIN);
      u = Math.round(u / BULK_STEP) * BULK_STEP;
      if (u < BULK_MIN) u = BULK_MIN;
      if (u > BULK_MAX) u = BULK_MAX;
      out.push({ type: 'bulk', units: u });
    } else if (it?.type === 'kit') {
      let q = toNum(it.qty, 1);
      if (q < 1) q = 1;
      out.push({ type: 'kit', qty: q });
    }
  }
  return out;
}

function cents(n) {
  // robust rounding for totals
  return Math.round((Number(n) || 0) * 100);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!stripe || !STRIPE_KEY) {
    res.status(500).json({ error: 'Stripe key not configured' });
    return;
  }

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { body = req.body || {}; }

  const rawItems = body.items || [];
  const items = normalizeCart(rawItems);
  if (!items.length) {
    res.status(400).json({ error: 'Cart empty' });
    return;
  }

  const shippingSel = body.shipping || null; // { carrier, service, amount, currency }

  // --- Build Stripe line_items with total per line (no fractional cents) ---
  const line_items = [];

  for (const it of items) {
    if (it.type === 'bulk') {
      const unit = unitPriceDollarsFor(it.units);
      const total = it.units * unit;           // total dollars for this line
      const totalCents = cents(total);

      line_items.push({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,
          product_data: {
            name: 'Force Dowels — Bulk',
            description: `${it.units.toLocaleString()} units @ $${unit.toFixed(4)}/unit (Tier: ${tierLabel(it.units)})`
          }
        }
      });
    } else if (it.type === 'kit') {
      const total = 36 * it.qty;               // $36.00 per kit
      const totalCents = cents(total);

      line_items.push({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,
          product_data: {
            name: 'Force Dowels — Starter Kit (300)',
            description: `${it.qty} kit${it.qty>1?'s':''} @ $36.00 each`
          }
        }
      });
    }
  }

  // Optional shipping line as its own item (so total matches exactly)
  if (shippingSel && Number.isFinite(Number(shippingSel.amount))) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: (shippingSel.currency || 'USD').toLowerCase(),
        unit_amount: cents(shippingSel.amount),
        product_data: {
          name: `Shipping — ${shippingSel.carrier || ''} ${shippingSel.service || ''}`.trim()
        }
      }
    });
  }

  // Success / cancel URLs
  const origin =
    (req.headers['x-forwarded-proto'] ? `${req.headers['x-forwarded-proto']}://` : 'https://') +
    (req.headers['x-forwarded-host'] || req.headers.host);

  const successUrl = `${origin}/order-success.html?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${origin}/cart.html`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Keep metadata if you want to see shipping choice in Stripe:
      metadata: shippingSel ? {
        ship_carrier: String(shippingSel.carrier || ''),
        ship_service: String(shippingSel.service || ''),
        ship_amount: String(shippingSel.amount || '')
      } : {}
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('Stripe session error:', e);
    res.status(500).json({ error: e.message || 'Stripe error' });
  }
}
