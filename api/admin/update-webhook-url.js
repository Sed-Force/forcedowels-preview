// Update Stripe webhook endpoint URL and enable it
import Stripe from 'stripe';

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

export default async function handler(req, res) {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const webhookId = 'we_1RaitQBZKB1NmC8JOLPi7WvF';
    const newUrl = 'https://forcedowels-preview.vercel.app/api/stripe-webhook';

    // Update the webhook endpoint
    const updated = await stripe.webhookEndpoints.update(webhookId, {
      url: newUrl,
      disabled: false,
      enabled_events: ['checkout.session.completed']
    });

    return res.status(200).json({
      success: true,
      message: 'Webhook endpoint updated and enabled',
      endpoint: {
        id: updated.id,
        url: updated.url,
        status: updated.status,
        enabled_events: updated.enabled_events
      }
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Failed to update webhook',
      message: err.message
    });
  }
}
