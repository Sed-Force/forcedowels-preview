// Check for orders in Stripe that don't exist in database
import Stripe from 'stripe';
import { sql } from '../_lib/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    // Get all successful payment intents from the last 30 days
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

    const paymentIntents = await stripe.paymentIntents.list({
      created: { gte: thirtyDaysAgo },
      limit: 100
    });

    const missedOrders = [];

    for (const pi of paymentIntents.data) {
      if (pi.status === 'succeeded') {
        // Get the checkout session
        const sessions = await stripe.checkout.sessions.list({
          payment_intent: pi.id,
          limit: 1
        });

        if (sessions.data.length > 0) {
          const session = sessions.data[0];

          // Check if this session exists in our database
          const orderRows = await sql`
            SELECT invoice_number FROM orders WHERE session_id = ${session.id}
          `;

          if (orderRows.length === 0) {
            missedOrders.push({
              payment_intent: pi.id,
              session_id: session.id,
              amount: pi.amount / 100,
              customer_email: session.customer_details?.email || 'Unknown',
              created: new Date(pi.created * 1000).toISOString()
            });
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      total_payments: paymentIntents.data.length,
      missed_orders: missedOrders.length,
      orders: missedOrders
    });

  } catch (err) {
    console.error('Error checking missed orders:', err);
    return res.status(500).json({
      error: 'Failed to check missed orders',
      message: err.message
    });
  }
}
