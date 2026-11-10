// Check Invoice #45 Stripe session details
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    const sessionId = 'cs_live_b1yKjqK8miYWXJThDlNwuggplxmfFTUoorBNXtUCIPe7O00WONx8nNvQZn';

    // Get the full session details
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'total_details']
    });

    // Get line items
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 100
    });

    return res.status(200).json({
      success: true,
      session: {
        id: session.id,
        amount_subtotal: session.amount_subtotal / 100,
        amount_total: session.amount_total / 100,
        shipping_cost: session.shipping_cost,
        total_details: session.total_details,
        metadata: session.metadata
      },
      line_items: lineItems.data.map(item => ({
        description: item.description,
        amount_total: item.amount_total / 100,
        amount_subtotal: item.amount_subtotal / 100,
        quantity: item.quantity
      }))
    });

  } catch (err) {
    console.error('Error checking invoice:', err);
    return res.status(500).json({
      error: 'Failed to check invoice',
      message: err.message
    });
  }
}
