// api/checkout.js — CommonJS, safe on Vercel Node runtime
const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      console.error('Missing STRIPE_SECRET_KEY (Preview/Production env?)');
      res.status(500).json({ error: 'Server misconfig: STRIPE_SECRET_KEY not set' });
      return;
    }

    const stripe = new Stripe(key, { apiVersion: '2024-06-20' });

    const { bulk, kit } = req.body || {};
    const line_items = [];

    // Bulk line (we pass a computed one-off price)
    if (bulk && Number(bulk.amountCents) > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Force Dowels — Bulk',
            description: `Units: ${Number(bulk.units).toLocaleString()} @ $${Number(bulk.unitPrice).toFixed(4)}/unit`,
            metadata: {
              units: String(bulk.units ?? ''),
              unit_price: String(bulk.unitPrice ?? ''),
            },
          },
          unit_amount: Number(bulk.amountCents), // integer cents
        },
        quantity: 1,
      });
    }

    // Kit line — defaults to $36.00
    if (kit && Number(kit.amountCents) > 0 && Number(kit.qty) > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Force Dowels Kit — 300 units' },
          unit_amount: Number(kit.unitCents ?? 3600),
        },
        quantity: Number(kit.qty),
      });
    }

    if (!line_items.length) {
      res.status(400).json({ error: 'Cart is empty' });
      return;
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      success_url: `${baseUrl}/success.html?cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart.html`,
      metadata: { source: 'forcedowels-cart' },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('checkout error:', err);
    res.status(500).json({ error: 'Checkout error', detail: String(err?.message || err) });
  }
};

