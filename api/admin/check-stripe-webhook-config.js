// Check Stripe webhook endpoint configuration
import Stripe from 'stripe';

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

export default async function handler(req, res) {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    // List all webhook endpoints
    const endpoints = await stripe.webhookEndpoints.list({ limit: 10 });

    return res.status(200).json({
      success: true,
      webhook_secret: process.env.STRIPE_WEBHOOK_SECRET ? 'configured' : 'missing',
      endpoints: endpoints.data.map(ep => ({
        id: ep.id,
        url: ep.url,
        status: ep.status,
        enabled_events: ep.enabled_events,
        api_version: ep.api_version,
        created: new Date(ep.created * 1000).toISOString()
      }))
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Failed to check webhook config',
      message: err.message
    });
  }
}
