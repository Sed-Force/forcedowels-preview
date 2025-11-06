// Minimal webhook to test if basic structure works
export const config = { runtime: 'nodejs' };

import Stripe from 'stripe';
import { sql, nextCounter } from './_lib/db.js';
import { buildInternationalOrderConfirmationEmail } from './_lib/email/internationalOrderConfirmation.js';
import { buildInternationalInternalNotificationHTML } from './_lib/email/internationalInternalNotification.js';

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

export default async function handler(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Minimal webhook works with ALL imports',
    has_stripe: !!stripe,
    has_sql: !!sql,
    has_nextCounter: !!nextCounter,
    has_email_builders: !!(buildInternationalOrderConfirmationEmail && buildInternationalInternalNotificationHTML)
  });
}
