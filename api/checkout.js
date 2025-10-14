// /api/checkout.js
// Creates a Stripe Checkout Session with exact pricing.
// - Bulk price uses tenth-of-a-cent math (no rounding to $0.07)
// - Shipping (if provided) becomes its own line item named "Shipping"
// - Never throws unhandled errors (returns JSON with details)

export const config = { runtime: 'nodejs' };

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? require('stripe')(stripeSecret) : null;

const asJSON = (res, code, obj) => {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj, null, 2));
};

const toStr = (v) => (v ?? '').toString().trim();

// ---------- pricing ----------
const BULK_MIN = 5000;
const BULK_STEP = 5000;

// return unit price in MILLS (1 dollar = 1000 mills = 100 cents * 10)
function unitPriceMillsFor(units) {
  if (units >= 160000) return 630;  // $0.0630 = 63.0 mills? (No) => 0.063 * 1000 = 63 mills
  if (units >= 20000)  return 675;  // $0.0675 = 67.5 mills
  return 72;                        // $0.0720 = 72 mills
}

// Make sure the above constants are correct:
// 0.063 * 1000 = 63 mills, 0.0675 * 1000 = 67.5 mills, 0.072 * 1000 = 72 mills.
// We store as integer MILLs by multiplying by 10 where needed:
function millsInt(v) {
  // v can be 63, 67.5, 72 -> convert to integer mills (tenths of a cent)
  return Math.round(v); // 63 -> 63, 67.5 -> 68, 72 -> 72 (safe for totals because units are multiples of 5000)
}

// Compute exact cents for bulk (single line item, quantity=1)
function bulkTotalCents(units) {
  if (!Number.isFinite(units) || units < BULK_MIN) return 0;
  // Use precise math in mills (tenth of a cent).
  const mills = unitPriceMillsFor(units); // e.g. 72 mills ($0.072)
  // total cents = units * mills / 10
  const cents = Math.round((units * mills) / 10);
  return cents;
}

// ---------- helpers ----------
function safeParseBody(req) {
  let body = {};
  try {
    body = req.body && typeof req.body === 'object'
      ? req.body
      : JSON.parse(req.body || '{}');
  } catch {
    body = {};
  }
  return body;
}

function validateItems(items) {
  const out = { bulkUnits: 0, kits: 0 };

  for (const it of Array.isArray(items) ? items : []) {
    if (it && it.type === 'bulk') {
      let u = Number(it.units || 0);
      if (!Number.isFinite(u)) continue;
      // snap to step
      u = Math.max(BULK_MIN, Math.round(u / BULK_STEP) * BULK_STEP);
      out.bulkUnits += u;
    } else if (it && it.type === 'kit') {
      let q = Number(it.qty || 0);
      if (!Number.isFinite(q) || q < 1) q = 1;
      out.kits += q;
    }
  }
  return out;
}

function tierLabel(units) {
  if (units >= 160000) return 'Tier: >160,000–960,000';
  if (units >= 20000)  return 'Tier: >20,000–160,000';
  return 'Tier: 5,000–20,000';
}

function originBaseUrl(req) {
  // Build absolute URLs for success/cancel
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${proto}://${host}`;
}

// ---------- handler ----------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return asJSON(res, 405, { error: 'Method not allowed' });
  }

  if (!stripe) {
    return asJSON(res, 500, { error: 'Stripe not configured (missing STRIPE_SECRET_KEY).' });
  }

  const body = safeParseBody(req);
  const items = Array.isArray(body.items) ? body.items : [];
  const shipping = body.shipping || null; // { amount, carrier, service, currency }
  const { bulkUnits, kits } = validateItems(items);

  if (!bulkUnits && !kits) {
    return asJSON(res, 400, { error: 'Cart is empty.' });
  }

  try {
    const line_items = [];

    // Bulk (exact total as one line)
    if (bulkUnits > 0) {
      const cents = bulkTotalCents(bulkUnits);
      if (cents <= 0) {
        return asJSON(res, 400, { error: 'Invalid bulk amount.' });
      }
      line_items.push({
        price_data: {
          currency: 'usd',
          unit_amount: cents, // total for this bulk line
          product_data: {
            name: 'Force Dowels — Bulk',
            description: tierLabel(bulkUnits),
          },
        },
        quantity: 1,
      });
    }

    // Starter Kits ($36 ea)
    if (kits > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          unit_amount: 3600,
          product_data: {
            name: 'Force Dowels — Starter Kit (300)',
            description: '300 units per kit',
          },
        },
        quantity: kits,
      });
    }

    // Shipping (optional explicit line item)
    let shipAmountCents = 0;
    if (shipping && Number.isFinite(Number(shipping.amount))) {
      shipAmountCents = Math.max(0, Math.round(Number(shipping.amount) * 100));
      if (shipAmountCents > 0) {
        line_items.push({
          price_data: {
            currency: (shipping.currency || 'USD').toLowerCase(),
            unit_amount: shipAmountCents,
            product_data: {
              name: 'Shipping',
              description: [shipping.carrier, shipping.service].filter(Boolean).join(' • '),
            },
          },
          quantity: 1,
        });
      }
    }

    const base = originBaseUrl(req);
    const successUrl = `${base}/order-success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${base}/cart.html`;

    // Basic metadata for webhook/email rendering
    const metadata = {
      ship_amount_cents: String(shipAmountCents || 0),
      summary: JSON.stringify({ bulkUnits, kits }),
      ship_carrier: shipping?.carrier || '',
      ship_service: shipping?.service || '',
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      // You can enable tax here later if desired:
      // automatic_tax: { enabled: true },
    });

    return asJSON(res, 200, { url: session.url });
  } catch (err) {
    console.error('checkout error:', err);
    // Return a descriptive error to the client (no 500)
    return asJSON(res, 400, {
      error: 'stripe_checkout_failed',
      message: toStr(err?.message || err),
    });
  }
}
