// /api/checkout.js
// Vercel Node.js Serverless Function (CommonJS)

const Stripe = require('stripe');

// ---- helpers --------------------------------------------------

function getBaseUrl(req) {
  // prefer explicit env, else infer from request
  const envUrl = process.env.PUBLIC_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  const proto =
    (req.headers['x-forwarded-proto'] || '').split(',')[0] ||
    (req.connection && req.connection.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// TIERED PRICING (cents)
function unitPriceCentsFor(units) {
  if (units >= 160000) return Math.round(0.063 * 100);   // $0.063
  if (units >= 20000)  return Math.round(0.0675 * 100);  // $0.0675
  return Math.round(0.072 * 100);                        // $0.072
}

// be lenient about parsing to avoid hanging on req.json()
async function parseJsonBody(req) {
  try {
    // If a body parser already ran:
    if (req.body && typeof req.body === 'object') return req.body;

    // Read raw stream and try JSON
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const txt = Buffer.concat(chunks).toString('utf8');
    return txt ? JSON.parse(txt) : {};
  } catch {
    return {};
  }
}

// ---- handler --------------------------------------------------

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    console.error('Missing STRIPE_SECRET_KEY');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' });

  try {
    const body = await parseJsonBody(req);
    const items = Array.isArray(body?.items) ? body.items : [];
    const customerEmail = (body?.email || body?.customerEmail || '').trim() || undefined;

    if (items.length === 0) {
      return res.status(400).json({ error: 'no_items' });
    }

    // Normalize items we understand:
    // bulk example  : { type:'bulk' | sku:'BULK',  units: 50000 }
    // starter kit   : { type:'kit'  | sku:'KIT',   qty:   1     }
    const lineItems = [];

    for (const raw of items) {
      const type = (raw.type || raw.sku || '').toString().toLowerCase();

      if (type === 'bulk' || type === 'force-bulk' || type === 'bulk_dowels' || type === 'bulk-8mm' || type === 'bulk_8mm' || type === 'bulk_') {
        let units = Number(raw.units || raw.qty || raw.quantity || 0);
        if (!Number.isFinite(units) || units <= 0) continue;

        // Stripe expects quantity as an integer (count of something).
        // We model "units" as the quantity; price is per unit in cents from tier.
        const unitAmount = unitPriceCentsFor(units);

        lineItems.push({
          quantity: units,
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Force Dowels — Bulk',
              description: 'Tiered pricing applies automatically',
            },
            unit_amount: unitAmount,
          },
        });
      } else if (type === 'kit' || type === 'starter' || type === 'fd-kit-300' || type === 'fd_kit_300') {
        const kits = Math.max(1, Number(raw.qty || raw.quantity || 0));
        const unitAmount = 3600; // $36.00 per kit
        lineItems.push({
          quantity: kits,
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Force Dowels — Starter Kit (300)',
              description: '300 units per kit',
            },
            unit_amount: unitAmount,
          },
        });
      }
    }

    if (lineItems.length === 0) {
      return res.status(400).json({ error: 'no_valid_items' });
    }

    const baseUrl = getBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      customer_email: customerEmail,
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart.html`,
      // optional: metadata for admin/recon
      metadata: {
        source: 'forcedowels-preview',
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'checkout_failed', message: err.message || 'unknown_error' });
  }
};

// Ensure Node runtime (fixes the old "nodejs18.x" error)
module.exports.config = { runtime: 'nodejs' };
