import Stripe from 'stripe';
import { sql } from '../_lib/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // Only allow POST for security
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Ensure address columns exist
    try {
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_address TEXT`;
      console.log('[Backfill] Address columns verified/created');
    } catch (e) {
      console.log('[Backfill] Columns may already exist:', e.message);
    }

    // Get all orders that have a session_id and don't have addresses
    const orders = await sql`
      SELECT invoice_number, session_id, customer_email
      FROM orders
      WHERE session_id IS NOT NULL
        AND session_id != ''
        AND session_id NOT LIKE 'manual_%'
        AND (billing_address IS NULL OR billing_address = '' OR shipping_address IS NULL OR shipping_address = '')
      ORDER BY invoice_number DESC
    `;

    console.log(`[Backfill] Found ${orders.length} orders to backfill`);

    const results = {
      total: orders.length,
      updated: 0,
      failed: 0,
      errors: []
    };

    // Format address helper
    const formatAddress = (addr) => {
      if (!addr || !addr.line1) return '';
      const parts = [
        addr.line1,
        addr.line2,
        addr.city,
        addr.state,
        addr.postal_code,
        addr.country
      ].filter(Boolean);
      return parts.join(', ');
    };

    // Process each order
    for (const order of orders) {
      try {
        console.log(`[Backfill] Processing invoice #${order.invoice_number}, session: ${order.session_id}`);

        // Fetch the session from Stripe
        const session = await stripe.checkout.sessions.retrieve(order.session_id);

        // Extract addresses
        const shippingAddress = session.shipping?.address || session.customer_details?.address || {};
        const billingAddress = session.customer_details?.address || {};

        const shippingAddressStr = formatAddress(shippingAddress);
        const billingAddressStr = formatAddress(billingAddress);

        // Update the order
        await sql`
          UPDATE orders
          SET
            shipping_address = ${shippingAddressStr},
            billing_address = ${billingAddressStr}
          WHERE invoice_number = ${order.invoice_number}
        `;

        results.updated++;
        console.log(`[Backfill] Updated invoice #${order.invoice_number}`);

      } catch (err) {
        console.error(`[Backfill] Failed to update invoice #${order.invoice_number}:`, err.message);
        results.failed++;
        results.errors.push({
          invoice_number: order.invoice_number,
          error: err.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Backfill complete: ${results.updated} updated, ${results.failed} failed`,
      results
    });

  } catch (error) {
    console.error('[Backfill] Error:', error);
    console.error('[Backfill] Error stack:', error.stack);
    return res.status(500).json({
      error: 'Failed to backfill addresses',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
