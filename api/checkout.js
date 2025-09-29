// api/checkout.js
export const config = { runtime: 'nodejs' }; // <-- important: not "edge" and not "nodejs18.x"

import Stripe from 'stripe';

// ----- server-side tier table (authoritative) -----
const TIERS = [
  { min: 5000,   max: 20000,  ppu: 0.072 },   // $0.072
  { min: 20000,  max: 160000, ppu: 0.0675 },  // $0.0675
  { min: 160000, max: 960000, ppu: 0.063 },   // $0.063
];

const KIT_UNIT_CENTS = 3600; // $36.00

function ppuForUnits(units) {
  const u = Number(units) || 0;
  const tier = TIERS.find(t => u >= t.min && u <= t.max);
  return tier ? tier.ppu : 0;
}

function detectBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers.host || '';
  const envBase = process.env.NEXT_PUBLIC_BASE_URL; // use if you set it
  return envBase || `${proto}://${host}`;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  try { return JSON.parse(raw); } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY env var' });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const body = await readJsonBody(req);
    const baseUrl = detectBaseUrl(req);

    // Expecting payload like:
    // {
    //   bulk: { units, /* client unitPrice & amountCents ignored */ } | null,
    //   kit:  { qty, unitCents, amountCents } | null
    // }
    // We recompute authoritative amounts on the server.
    let bulkUnits = 0;
    let kitQty = 0;

    if (body?.bulk?.units)   bulkUnits = Math.max(0, Number(body.bulk.units) || 0);
    if (body?.kit?.qty)      kitQty    = Math.max(0, Number(body.kit.qty)  || 0);

    // Build line items
    const line_items = [];

    if (bulkUnits > 0) {
      // Compute total cents for bulk as ONE item (avoid fractional-cent unit amounts)
      const ppu = ppuForUnits(bulkUnits);
      if (!ppu) return res.status(400).json({ error: 'Bulk units out of allowed range (5,000–960,000)' });

      const totalCents = Math.max(1, Math.round(bulkUnits * ppu * 100)); // integer cents, at least 1
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Force Dowels — Bulk',
            description: `${bulkUnits.toLocaleString()} units @ $${ppu.toFixed(4)}/unit`
          },
          // charge total as a single line (quantity: 1)
          unit_amount: totalCents,
        },
        quantity: 1,
      });
    }

    if (kitQty > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Force Dowels Kit — 300 units' },
          unit_amount: KIT_UNIT_CENTS,
        },
        quantity: kitQty,
      });
    }

    if (line_items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const success_url = `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url  = `${baseUrl}/cart.html`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url,
      cancel_url,
      // Optional: collect shipping address if you plan to ship
      // shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      // automatic_tax: { enabled: false },
      // metadata: { ... } // You can add order info here if you like
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('CHECKOUT_ERROR', err);
    // Surface a safe error to the browser
    return res.status(500).json({ error: 'Checkout failed. See function logs for details.' });
  }
}
