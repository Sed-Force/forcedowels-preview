// /api/checkout.js
// Vercel Node runtime (supported values: "edge", "experimental-edge", "nodejs")
export const config = { runtime: 'nodejs' };

// ---- Tier logic ----
function unitPriceFor(units) {
  if (!units || units <= 0) return 0;
  if (units <= 20000) return 0.072;    // 5,000–20,000
  if (units <= 160000) return 0.0675;  // >20,000–160,000
  return 0.063;                        // >160,000–960,000
}

// ---- Cross-runtime JSON body reader ----
async function readBody(req) {
  if (typeof req?.json === 'function') {
    try { return await req.json(); } catch { return {}; }
  }
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
    if ((req?.method || 'POST') !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const { cart } = await readBody(req);

    // ---- Aggregate cart into "bulkUnits" + "kits" ----
    let bulkUnits = 0;   // number of individual units
    let kits = 0;        // number of 300-unit kits

    if (Array.isArray(cart)) {
      for (const it of cart) {
        const name = String(it?.name || '');
        const sku  = String(it?.sku  || '').toLowerCase();
        const qty  = Number(it?.qty ?? it?.quantity ?? 1);

        // Starter kit identification
        if (sku === 'fd-kit-300' || /kit/i.test(name) || it?.kind === 'kit') {
          if (Number.isFinite(qty) && qty > 0) kits += qty;
          continue;
        }

        // Bulk "units" entry
        if (Number.isFinite(it?.units) && it.units > 0) {
          bulkUnits += Number(it.units);
          continue;
        }

        // Legacy bundle SKUs that represent units
        if (sku === 'force-100') {
          bulkUnits += 5000 * (Number.isFinite(qty) ? qty : 1);
          continue;
        }
        if (sku === 'force-500') {
          bulkUnits += 25000 * (Number.isFinite(qty) ? qty : 1);
          continue;
        }
      }
    }

    // Enforce business rules
    if (bulkUnits < 0) bulkUnits = 0;
    if (bulkUnits > 960000) bulkUnits = 960000;
    // Optional hard step to 5,000s:
    // if (bulkUnits % 5000 !== 0) bulkUnits = Math.floor(bulkUnits / 5000) * 5000;

    const line_items = [];

    // Bulk line (priced per unit using tier)
    if (bulkUnits > 0) {
      const ppu = unitPriceFor(bulkUnits);
      const unit_amount = Math.round(ppu * 100); // cents

      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Force Dowels — Bulk' },
          unit_amount, // cents per unit
        },
        quantity: bulkUnits, // total units
      });
    }

    // Kit line(s) – flat $36.00 each
    if (kits > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Force Dowels Kit — 300 units' },
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

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL; // e.g. https://forcedowels-preview.vercel.app

    if (!STRIPE_SECRET_KEY || !BASE_URL) {
      console.error('Missing env', { hasSecret: !!STRIPE_SECRET_KEY, hasBase: !!BASE_URL });
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

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
