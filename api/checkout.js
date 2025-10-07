// /api/checkout.js
// Creates a Stripe Checkout Session. Shipping (if provided) is added as a
// separate line item and **tagged** with metadata so emails can split it out.

export const config = { runtime: 'nodejs' };

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Pricing tiers in **cents** (must match cart/order logic)
function unitPriceCentsFor(units) {
  if (units >= 160000) return Math.round(0.063 * 100);   // $0.0630
  if (units >= 20000)  return Math.round(0.0675 * 100);  // $0.0675
  return Math.round(0.072 * 100);                        // $0.0720
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const items = Array.isArray(body.items) ? body.items : [];
  const shipping = body.shipping || null; // { carrier, service, amount, currency }

  if (!items.length) {
    res.status(400).json({ error: 'No items' });
    return;
  }

  const line_items = [];

  for (const it of items) {
    if (it?.type === 'bulk') {
      const units = Number(it.units || 0);
      const unitCents = unitPriceCentsFor(units);
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Force Dowels — Bulk' },
          unit_amount: unitCents, // cents per unit (no rounding errors)
        },
        quantity: units,          // quantity is the unit count
      });
    } else if (it?.type === 'kit') {
      const qty = Math.max(1, Number(it.qty || 0));
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Force Dowels — Starter Kit (300)' },
          unit_amount: 3600, // $36.00 per kit
        },
        quantity: qty,
      });
    }
  }

  // Add shipping as its own line item (tagged so email can split it out)
  if (shipping && Number.isFinite(Number(shipping.amount))) {
    const shipName = `Shipping — ${shipping.carrier || ''} ${shipping.service || ''}`.trim();
    line_items.push({
      price_data: {
        currency: (shipping.currency || 'USD').toLowerCase(),
        product_data: {
          name: shipName,
          // Tag the line so the webhook/email can detect it
          metadata: { fd_kind: 'shipping', carrier: shipping.carrier || '', service: shipping.service || '' },
        },
        unit_amount: Math.round(Number(shipping.amount) * 100),
      },
      quantity: 1,
      // Also tag on price level for older Stripe SDK expansions
      // (Stripe surfaces metadata on price/product differently across APIs)
      // NOTE: price_data.metadata isn't supported; product_data.metadata is.
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items,
    allow_promotion_codes: false,
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/order-success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${process.env.NEXT_PUBLIC_SITE_URL || ''}/cart.html`,
  });

  res.status(200).json({ url: session.url });
}
