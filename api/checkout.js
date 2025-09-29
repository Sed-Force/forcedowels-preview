// api/checkout.js
export const config = {
  runtime: 'nodejs18.x' // or omit; your project "engines" is Node 22, Vercel will map
};

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

function dollars(n) { return `$${n.toFixed(2)}`; }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { bulk, kit } = req.body || {};
    const line_items = [];

    // Bulk line as a single computed-amount item (quantity = 1)
    if (bulk && bulk.amountCents > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Force Dowels — Bulk',
            description: `Units: ${bulk.units.toLocaleString()} @ ${dollars(bulk.unitPrice)}/unit`,
            metadata: {
              units: String(bulk.units),
              unit_price: String(bulk.unitPrice),
            }
          },
          unit_amount: bulk.amountCents, // integer cents
        },
        quantity: 1,
      });
    }

    // Kit line (300 units per kit, $36 each)
    if (kit && kit.amountCents > 0 && kit.qty > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Force Dowels Kit — 300 units',
          },
          unit_amount: kit.unitCents || 3600,
        },
        quantity: kit.qty,
      });
    }

    if (!line_items.length) {
      res.status(400).json({ error: 'Cart is empty' });
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA'], // adjust if needed
      },
      success_url: `${baseUrl}/success.html?cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart.html`,
      metadata: {
        source: 'forcedowels-cart',
      }
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('checkout error', err);
    res.status(500).send(err?.message || 'Checkout error');
  }
}
