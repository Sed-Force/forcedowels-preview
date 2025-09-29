// /api/checkout.js  (Node runtime)
// Creates a Stripe Checkout Session from cart items.
// ENV required:
//   STRIPE_SECRET_KEY
//   NEXT_PUBLIC_BASE_URL   (e.g. https://forcedowels-preview.vercel.app)

const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const items = Array.isArray(body?.items) ? body.items : [];

    // Normalize cart
    let bulkUnits = 0;
    let kitQty = 0;
    for (const it of items) {
      if (it.type === 'bulk') bulkUnits += Number(it.units || 0);
      if (it.type === 'kit')  kitQty   += Number(it.qty || 0);
    }

    // Tiered pricing for BULK
    const ppuForUnits = (u) => {
      if (u >= 160000) return 0.063;
      if (u >= 20000)  return 0.0675;
      if (u >= 5000)   return 0.072;
      return 0;
    };

    const line_items = [];

    if (bulkUnits >= 5000) {
      const ppu = ppuForUnits(bulkUnits);
      const totalCents = Math.round(bulkUnits * ppu * 100); // charge as single line
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Force Dowels — Bulk',
            description: `${bulkUnits.toLocaleString()} units @ $${ppu.toFixed(4)}/unit`
          },
          unit_amount: totalCents
        },
        quantity: 1
      });
    }

    if (kitQty > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Force Dowels Kit — 300 units',
            description: 'Starter kit'
          },
          unit_amount: 3600
        },
        quantity: kitQty
      });
    }

    if (!line_items.length) {
      res.status(400).json({ error: 'Cart is empty' });
      return;
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: `${base}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/cart.html`,
      allow_promotion_codes: true
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
