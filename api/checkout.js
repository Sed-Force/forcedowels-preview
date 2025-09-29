// /api/checkout.js
// Vercel Node runtime, Web API-compatible handler

export const config = { runtime: 'nodejs' }; // <= supported value

function unitPriceFor(units) {
  if (!units || units <= 0) return 0;
  if (units <= 20000) return 0.072;
  if (units <= 160000) return 0.0675;
  return 0.063; // up to 960k
}

// Parse body for both Web API Request and Node req
async function readBody(req) {
  // Web API request has .json()
  if (typeof req?.json === 'function') {
    try { return await req.json(); } catch { return {}; }
  }
  // Node IncomingMessage (Vercel serverless classic)
  return await new Promise((resolve) => {
    try {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
      });
    } catch {
      resolve({});
    }
  });
}

export default async function handler(req) {
  try {
    const method = req?.method || 'POST';
    if (method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const { cart } = await readBody(req);

    // ---- Aggregate cart into bulkUnits + kits ----
    let bulkUnits = 0;
    let kits = 0;

    if (Array.isArray(cart)) {
      for (const it of cart) {
        const sku = String(it?.sku || '').toLowerCase();

        // Kits
        if (sku === 'fd-kit-300' || it?.kind === 'kit' || /kit/i.test(it?.name || '')) {
          const q = Number(it?.qty ?? it?.quantity ?? 1);
          if (Number.isFinite(q) && q > 0) kits += q;
          continue;
        }

        // Bulk by units
        if (Number.isFinite(it?.units)) {
          bulkUnits += Math.max(0, Number(it.units));
          continue;
        }

        // Legacy SKUs that represent bundles of units
        if (sku === 'force-100') {
          const q = Number(it?.qty ?? it?.quantity ?? 1);
          bulkUnits += 5000 * (Number.isFinite(q) ? q : 1);
          continue;
        }
        if (sku === 'force-500') {
          const q = Number(it?.qty ?? it?.quantity ?? 1);
          bulkUnits += 25000 * (Number.isFinite(q) ? q : 1);
          continue;
        }
      }
    }

    // Enforce your rules
    if (bulkUnits < 0) bulkUnits = 0;
    if (bulkUnits > 960000) bulkUnits = 960000;
    // (Optional) enforce 5,000-unit steps:
    // if (bulkUnits % 5000 !== 0) bulkUnits = Math.floor(bulkUnits / 5000) * 5000;

    const line_items = [];

    // Bulk line
    if (bulkUnits > 0) {
      const ppu = unitPriceFor(bulkUnits);
      const unit_amount = Math.round(ppu * 100); // cents
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Force Dowels — Bulk',
          },
          unit_amount,
        },
        quantity: bulkUnits, // quantity = number of units
      });
    }

    // Kit line(s)
    if (kits > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Force Dowels Kit — 300 units',
          },
          unit_amount: 3600, // $36.00
        },
        quantity: kits,
      });
    }

    if (line_items.length === 0) {
      return new Response(JSON.stringify({ error: 'Cart is empty' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Env checks
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL; // e.g. https://forcedowels-preview.vercel.app
    if (!STRIPE_SECRET_KEY || !BASE_URL) {
      console.error('Missing env: STRIPE_SECRET_KEY or NEXT_PUBLIC_BASE_URL');
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Lazy import Stripe works in both ESM/CJS contexts on Vercel
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      success_url: `${BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/cart.html`,
      metadata: {
        bulk_units: String(bulkUnits),
        kits: String(kits),
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('checkout error', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
