// Recover all missed payments and create orders
import Stripe from 'stripe';
import { sql } from '../_lib/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Email configuration
const EMAIL_FROM = process.env.EMAIL_FROM || 'orders@forcedowels.com';
const EMAIL_BCC = process.env.EMAIL_BCC || 'info@forcedowels.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function sendViaResend({ to, subject, html }) {
  const body = {
    from: EMAIL_FROM,
    to,
    subject,
    html,
  };
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    return { ok: false, error: txt, status: resp.status };
  }
  const data = await resp.json();
  return { ok: true, data };
}

async function recoverPayment(paymentIntentId) {
  // Get the payment intent
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  // Get the checkout session from the payment intent
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1
  });

  if (sessions.data.length === 0) {
    throw new Error('No session found for this payment');
  }

  const session = sessions.data[0];

  // Check if already exists
  const existingOrders = await sql`
    SELECT invoice_number FROM orders WHERE session_id = ${session.id}
  `;

  if (existingOrders.length > 0) {
    return { skipped: true, invoiceNumber: existingOrders[0].invoice_number, reason: 'already_exists' };
  }

  // Get next invoice number
  const counterKey = process.env.VERCEL_ENV === 'production' ? 'invoice_prod' : 'invoice_preview';

  await sql`
    CREATE TABLE IF NOT EXISTS order_counter (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL DEFAULT 0
    )
  `;

  const counterRows = await sql`
    INSERT INTO order_counter (id, seq)
    VALUES (${counterKey}, 1)
    ON CONFLICT (id) DO UPDATE SET seq = order_counter.seq + 1
    RETURNING seq
  `;

  const invoiceNumber = Number(counterRows[0]?.seq ?? 0);

  // Extract order details from session
  const customerName = session.customer_details?.name || 'Unknown';
  const customerEmail = session.customer_details?.email || 'unknown@forcedowels.com';
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
    } else if (item.description.includes('Force Dowel')) {
      quantity += item.quantity;
      itemsSummary = item.description;
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

  // Send email notification
  const shortId = `#${session.id.slice(-8)}`;
  const subject = `Force Dowels Order ${shortId} - Recovery Notification`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Order Recovery Notification</title>
</head>
<body style="font-family:Arial,sans-serif;margin:0;padding:20px;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:30px;border-radius:8px;">
    <h1 style="color:#d32f2f;">Order Recovery Notice</h1>
    <p>This order was recovered from a missed webhook. The customer's payment was successful but the order was not initially saved to the database.</p>

    <div style="margin:20px 0;padding:15px;background:#fff3cd;border-radius:6px;">
      <p style="margin:5px 0;"><strong>Invoice Number:</strong> #${invoiceNumber}</p>
      <p style="margin:5px 0;"><strong>Customer:</strong> ${customerName}</p>
      <p style="margin:5px 0;"><strong>Email:</strong> ${customerEmail}</p>
      <p style="margin:5px 0;"><strong>Amount:</strong> $${(totalCents / 100).toFixed(2)}</p>
      <p style="margin:5px 0;"><strong>Items:</strong> ${itemsSummary}</p>
    </div>

    <p style="color:#999;font-size:14px;">This order now appears in your admin panel and needs to be fulfilled.</p>
  </div>
</body>
</html>
  `;

  let emailSent = false;
  if (RESEND_API_KEY && EMAIL_BCC) {
    const bccEmails = EMAIL_BCC.split(',').map(e => e.trim()).filter(Boolean);
    if (bccEmails.length > 0) {
      const result = await sendViaResend({
        to: bccEmails[0],
        subject,
        html
      });
      emailSent = result.ok;
    }
  }

  return {
    recovered: true,
    invoiceNumber,
    customerEmail,
    amount: totalCents / 100,
    emailSent
  };
}

export default async function handler(req, res) {
  try {
    // Get list of missed orders
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    const paymentIntents = await stripe.paymentIntents.list({
      created: { gte: thirtyDaysAgo },
      limit: 100
    });

    const results = [];

    for (const pi of paymentIntents.data) {
      if (pi.status === 'succeeded') {
        const sessions = await stripe.checkout.sessions.list({
          payment_intent: pi.id,
          limit: 1
        });

        if (sessions.data.length > 0) {
          const session = sessions.data[0];

          const orderRows = await sql`
            SELECT invoice_number FROM orders WHERE session_id = ${session.id}
          `;

          if (orderRows.length === 0) {
            try {
              const result = await recoverPayment(pi.id);
              results.push({
                payment_intent: pi.id,
                ...result
              });

              // Add delay to respect rate limits
              await new Promise(resolve => setTimeout(resolve, 600));
            } catch (err) {
              results.push({
                payment_intent: pi.id,
                error: err.message
              });
            }
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      recovered: results.length,
      results
    });

  } catch (err) {
    console.error('Error recovering missed orders:', err);
    return res.status(500).json({
      error: 'Failed to recover orders',
      message: err.message
    });
  }
}
