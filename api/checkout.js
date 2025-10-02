// /api/checkout.js  (Vercel Node runtime)
const Stripe = require('stripe');

function unitPriceCentsFor(units) {
  if (units >= 160000) return Math.round(0.063 * 100);   // $0.0630
  if (units >= 20000)  return Math.round(0.0675 * 100);  // $0.0675
  return Math.round(0.072 * 100);                        // $0.0720
}
const BULK_MIN  = 5000;
const BULK_MAX  = 960000;
const BULK_STEP = 5000;

// Build absolute URL fallback (for success/cancel)
function originFromReq(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https');
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

  const stripe = new Stripe(key, { apiVersion: '2023-10-16' });

  try {
    const { items = [], shipping = null, destination = null } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items' });
    }

    // Normalize + validate
    const norm = [];
    for (const raw of items) {
      if (!raw) continue;
      if (raw.type === 'bulk') {
        let u = Number(raw.units || 0);
        if (!Number.isFinite(u)) continue;
        u = Math.round(u / BULK_STEP) * BULK_STEP;
        if (u < BULK_MIN) u = BULK_MIN;
        if (u > BULK_MAX) u = BULK_MAX;
        norm.push({ type: 'bulk', units: u });
      } else if (raw.type === 'kit') {
        let q = Number(raw.qty || 0);
        if (!Number.isFinite(q) || q < 1) q = 1;
        norm.push({ type: 'kit', qty: Math.floor(q) });
      }
    }
    if (!norm.length) return res.status(400).json({ error: 'No valid items' });

    // Build Stripe line_items (dynamic price_data)
    const line_items = [];
    for (const it of norm) {
      if (it.type === 'bulk') {
        const unitCents = unitPriceCentsFor(it.units);
        // Make it a single line item with exact amount (units * unitCents)
        line_items.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Force Dowels — Bulk',
              description: `${it.units.toLocaleString()} units @ $${(unitCents/100).toFixed(4)}/unit`,
            },
            unit_amount: unitCents, // cents per unit
          },
          quantity: it.units,
        });
      } else {
        line_items.push({
          price_data: {
            currency: 'usd',
            product_data: { name: 'Force Dowels — Starter Kit (300)' },
            unit_amount: 3600, // $36.00
          },
          quantity: it.qty,
        });
      }
    }

    // Optional: add shipping as a separate line item when you pass it from cart
    if (shipping && Number.isFinite(Number(shipping.amount)) && Number(shipping.amount) >= 0) {
      const amt = Math.round(Number(shipping.amount) * 100); // dollars -> cents if needed
      // If the front-end already stores dollars, convert; if it stores number in USD already, remove *100 above.
      // We’ll accept both: if amount < 1000 we treat it as dollars; tweak:
      const cents = shipping.amount >= 1000 ? Math.round(shipping.amount) : amt;

      line_items.push({
        price_data: {
          currency: (shipping.currency || 'USD').toLowerCase(),
          product_data: {
            name: `Shipping — ${shipping.carrier || 'Carrier'} ${shipping.service || ''}`.trim(),
          },
          unit_amount: cents,
        },
        quantity: 1,
      });
    }

    // URLs
    const origin = originFromReq(req);
    const success_url = process.env.CHECKOUT_SUCCESS_URL || `${origin}/success.html`;
    const cancel_url  = process.env.CHECKOUT_CANCEL_URL  || `${origin}/cart.html`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      success_url,
      cancel_url,
      // Optional shipping address collection (if you want Stripe to capture address)
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'MX'],
      },
      metadata: {
        // Helpful for webhooks/emails
        payload: JSON.stringify({ items: norm, shipping, destination }),
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Server error creating session' });
  }
}

// Vercel runtime flag
module.exports = handler;
module.exports.config = { runtime: 'nodejs' };
