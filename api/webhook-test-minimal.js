// Minimal webhook to test if basic structure works
export const config = { runtime: 'nodejs' };

import Stripe from 'stripe';

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

export default async function handler(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Minimal webhook works',
    has_stripe: !!stripe
  });
}
