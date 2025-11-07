// Check the latest test order details
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    const sessionId = 'cs_live_a1LChZ64bAIAShj55FIeVhey8n3kVFTVbMGQ3PmyrUFAS3L9VaZy8jvtOr';

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'total_details', 'payment_intent']
    });

    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 100
    });

    return res.status(200).json({
      success: true,
      session: {
        id: session.id,
        payment_status: session.payment_status,
        status: session.status,
        amount_total: session.amount_total / 100,
        customer_email: session.customer_details?.email,
        customer_phone: session.customer_details?.phone,
        customer_name: session.customer_details?.name,
        shipping: session.shipping,
        metadata: session.metadata,
        payment_intent: session.payment_intent
      },
      line_items: lineItems.data.map(item => ({
        description: item.description,
        amount_total: item.amount_total / 100,
        quantity: item.quantity
      }))
    });
  } catch (err) {
    console.error('Error checking session:', err);
    return res.status(500).json({
      error: 'Failed to check session',
      message: err.message
    });
  }
}
