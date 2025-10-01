// Force Dowels — Stripe Checkout (Vercel Node function)
// Accepts items like:
//   { type: 'bulk', units: 5000 }
//   { type: 'kit',  qty: 1 }

const stripe = require('stripe')(
  process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SK
);

// Pin Vercel runtime (avoid "nodejs18.x" error)
module.exports.config = { runtime: 'nodejs' };

// ---- Pricing / guards ----
const BULK_MIN = 5000;
const BULK_MAX = 960000;
const BULK_STEP = 5000;

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function snapToStep(n, step) { return Math.round(n / step) * step; }

// Returns USD per-unit price as a JS number (e.g. 0.072)
function pricePerUnitUSD(units) {
  if (units >= 160000) return 0.063;
  if (units >= 20000)  return 0.0675;
  return 0.072;
}

// Stripe supports fractional cents via `unit_amount_decimal` (string, in *cents*).
// For $0.072 -> 7.2 cents, so "7.2"
function toUnitAmountDecimalString(usd) {
  const cents = usd * 100;                // e.g. 0.0675 * 100 = 6.75
  // keep up to 4 decimals to be safe
  return Number(cents.toFixed(4)).toString();
}

function parseBody(req) {
  if (!req || typeof req !== 'object') return {};
  if (req.body == null) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  // vercel often gives parsed object already
  return req.body;
}

function baseUrlFrom(req) {
  const origin =
    process.env.SITE_URL ||
    (req.headers && (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
      ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
      : (req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : 'https://forcedowels.com'))));

  return origin.replace(/\/+$/, '');
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      return res.json({ error: 'Method not allowed' });
    }

    if (!stripe) {
      return res.status(500).json({ error: 'Stripe key missing on server' });
    }

    const { items, email } = parseBody(req);

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items in request' });
    }

    // Normalize & validate items, then build Stripe line_items
    const line_items = [];

    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;

      if (raw.type === 'bulk') {
        let units = Number(raw.units || 0);
        if (!Number.isFinite(units)) units = BULK_MIN;
        units = snapToStep(units, BULK_STEP);
        units = clamp(units, BULK_MIN, BULK_MAX);

        const usd = pricePerUnitUSD(units);
        const uad = toUnitAmountDecimalString(usd); // decimal *cents* string

        line_items.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Force Dowels — Bulk (${units.toLocaleString()} units)`,
            },
            // Stripe expects unit_amount_decimal in *cents* as string
            unit_amount_decimal: uad,
          },
          quantity: units, // quantity = number of units
        });
      }

      if (raw.type === 'kit') {
        let qty = Number(raw.qty || 0);
        if (!Number.isFinite(qty) || qty < 1) qty = 1;

        line_items.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Force Dowels — Starter Kit (300)',
            },
            unit_amount: 3600, // $36.00
          },
          quantity: qty,
        });
      }
    }

    if (line_items.length === 0) {
      return res.status(400).json({ error: 'No valid items to charge' });
    }

    const base = baseUrlFrom(req);
    const success_url = `${base}/success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url  = `${base}/cart.html`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      allow_promotion_codes: true,
      automatic_tax: { enabled: false },
      success_url,
      cancel_url,
      customer_email: email && typeof email === 'string' ? email : undefined,
      // You can add shipping address collection later if needed:
      // shipping_address_collection: { allowed_countries: ['US', 'CA'] },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err && err.message, err && err.stack);
    // Try to surface Stripe error message safely
    const msg = (err && err.raw && err.raw.message) || err.message || 'Internal error';
    return res.status(500).json({ error: msg });
  }
};
