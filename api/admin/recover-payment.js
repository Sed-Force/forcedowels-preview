// Recover a missed payment and create the order
import Stripe from 'stripe';
import { sql } from '../_lib/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    const paymentIntentId = 'pi_3SPPVOBZKB1NmC8J1yG9mAh6';

    // Get the payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Get the checkout session from the payment intent
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1
    });

    if (sessions.data.length === 0) {
      return res.status(404).json({ error: 'No session found for this payment' });
    }

    const session = sessions.data[0];

    // Get next invoice number
    const counterRows = await sql`
      SELECT counter FROM invoice_counter WHERE id = 1 FOR UPDATE
    `;

    let invoiceNumber;
    if (counterRows.length === 0) {
      await sql`INSERT INTO invoice_counter (id, counter) VALUES (1, 48)`;
      invoiceNumber = 48;
    } else {
      invoiceNumber = counterRows[0].counter;
      await sql`UPDATE invoice_counter SET counter = counter + 1 WHERE id = 1`;
    }

    // Extract order details from session
    const customerName = session.customer_details?.name || 'Unknown';
    const customerEmail = session.customer_details?.email || 'zstrain@calclosets.com';
    const customerPhone = session.customer_details?.phone || '';

    const shippingAddress = session.customer_details?.address || session.shipping_details?.address;
    const shippingAddressStr = shippingAddress
      ? `${shippingAddress.line1 || ''} ${shippingAddress.city || ''}, ${shippingAddress.state || ''}, ${shippingAddress.postal_code || ''}, ${shippingAddress.country || ''}`
      : '';

    const billingAddress = session.customer_details?.address;
    const billingAddressStr = billingAddress
      ? `${billingAddress.line1 || ''} ${billingAddress.city || ''}, ${billingAddress.state || ''}, ${billingAddress.postal_code || ''}, ${billingAddress.country || ''}`
      : '';

    // Get line items
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);

    let itemsSummary = '';
    let quantity = 0;
    let kits = 0;

    for (const item of lineItems.data) {
      if (item.description.includes('Starter Kit')) {
        kits += item.quantity;
        quantity += item.quantity * 300;
        itemsSummary = `Kit - 300 units (${item.quantity * 300}) (Qty: ${item.quantity * 300})`;
      }
    }

    const totalCents = session.amount_total;
    const shippingMethod = session.shipping_cost?.shipping_rate
      ? (await stripe.shippingRates.retrieve(session.shipping_cost.shipping_rate)).display_name
      : 'Standard Shipping';

    // Insert into database
    await sql`
      INSERT INTO orders (
        invoice_number,
        customer_name,
        customer_email,
        customer_phone,
        items_summary,
        shipping_method,
        quantity,
        status,
        order_date,
        amount_cents,
        tracking_number,
        carrier,
        session_id,
        shipping_address,
        billing_address
      ) VALUES (
        ${invoiceNumber},
        ${customerName},
        ${customerEmail},
        ${customerPhone},
        ${itemsSummary},
        ${shippingMethod},
        ${quantity},
        'pending',
        CURRENT_DATE,
        ${totalCents},
        '',
        '',
        ${session.id},
        ${shippingAddressStr},
        ${billingAddressStr}
      )
    `;

    return res.status(200).json({
      success: true,
      invoiceNumber,
      session: {
        id: session.id,
        customer: customerName,
        email: customerEmail,
        amount: totalCents / 100,
        items: itemsSummary
      }
    });

  } catch (err) {
    console.error('Error recovering payment:', err);
    return res.status(500).json({
      error: 'Failed to recover payment',
      message: err.message
    });
  }
}
