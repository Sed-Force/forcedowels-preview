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

// Stripe fractional cents via `unit_amount_decimal` (string, in *cents*).
// $0.072 -> 7.2 cents => "7.2"
function toUnitAmountDecimalString(usd) {
  const cents = usd * 100; // 0.0675 * 100 = 6.75
  return Number(cents.toFixed(4)).toString();
}

function parseBody(req) {
  try {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    if (typeof req.body === 'object' && req.body) return req.body;
  } catch {}
  return {};
}

function baseUrlFrom(req) {
  const xfProto = req.headers['x-forwarded-proto'];
  const xfHost  = req.headers['x-forwarded-host'];
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`.replace(/\/+$/,'');
  if (req.headers.origin) return req.headers.origin.replace(/\/+$/,'');
  if (req.headers.host) return `https://${req.headers.host}`.replace(/\/+$/,'');
  return (process.env.SITE_URL || 'https://forcedowels.com').replace(/\/+$/,'');
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
            unit_amount_decimal: uad, // cents, string (e.g. "7.2", "6.75")
          },
          quantity: units // quantity equals number of units
        });
      }

      if (raw.type === 'kit') {
        let qty = Number(raw.qty || 0);
        if (!Number.isFinite(qty) || qty < 1) qty = 1;

        line_items.push({
          price_data: {
            currency: 'usd',
            product_data: { name: 'Force Dowels — Starter Kit (300)' },
            unit_amount: 3600 // $36.00
          },
          quantity: qty
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
      customer_email: email && typeof email === 'string' ? email : undefined
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    const msg = (err && err.raw && err.raw.message) || err.message || 'Internal error';
    return res.status(500).json({ error: msg, code: err && err.code ? err.code : 'server_error' });
  }
};
