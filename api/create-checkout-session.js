// /api/create-checkout-session.js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

// Map your in-site SKUs to Stripe Price IDs via env vars
const PRICE_MAP = {
  'force-100': process.env.STRIPE_PRICE_FORCE_100,  // pack of 5,000 (you set this up)
  'force-500': process.env.STRIPE_PRICE_FORCE_500,  // pack of 25,000
  'FD-KIT-300': process.env.STRIPE_PRICE_FD_KIT_300 // starter kit (optional)
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ error: 'method_not_allowed' });
  }

  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) throw new Error('no items');

    const line_items = items.map(({ sku, qty }) => {
      const price = PRICE_MAP[sku];
      if (!price) throw new Error(`Unknown sku: ${sku}`);
      return { price, quantity: Math.max(1, Number(qty||1)), adjustable_quantity: { enabled: false } };
    });

    const base = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const success_url = `${base || 'https://forcedowels.com'}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url  = `${base || 'https://forcedowels.com'}/cart.html`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url,
      cancel_url,
      shipping_address_collection: { allowed_countries: ['US', 'CA'] }
    });

    res.statusCode = 200;
    res.json({ url: session.url });
  } catch (e) {
    console.error('create-checkout-session error:', e);
    res.statusCode = 400;
    res.json({ error: String(e) });
  }
}
