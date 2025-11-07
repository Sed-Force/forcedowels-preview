// Manually recover the test order
import Stripe from 'stripe';
import { sql } from '../_lib/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || 'orders@forcedowels.com';
const EMAIL_BCC = process.env.EMAIL_BCC || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function sendViaResend({ to, subject, html }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || 'Resend error');
  return { ok: true, data };
}

export default async function handler(req, res) {
  try {
    const sessionId = 'cs_live_a1LChZ64bAIAShj55FIeVhey8n3kVFTVbMGQ3PmyrUFAS3L9VaZy8jvtOr';

    console.log('[Recover] Fetching session:', sessionId);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Extract customer info
    const customerEmail = session.customer_details?.email || '';
    const customerName = session.metadata?.customer_name || session.customer_details?.name || '';
    const contactName = session.metadata?.contact_name || '';
    const customerPhone = session.customer_details?.phone || session.shipping?.phone || '';

    const totalCents = session.amount_total || 0;
    const subtotalCents = session.amount_subtotal || 0;
    const shippingCents = (session.shipping_cost?.amount_total || 0);

    const shippingAddress = session.shipping?.address || null;
    const billingAddress = session.customer_details?.address || null;

    const shippingAddressStr = shippingAddress ? JSON.stringify(shippingAddress) : '';
    const billingAddressStr = billingAddress ? JSON.stringify(billingAddress) : '';

    const shipCarrier = session.metadata?.ship_carrier || '';
    const shipService = session.metadata?.ship_service || '';
    const shippingMethod = [shipCarrier, shipService].filter(Boolean).join(' • ');

    // Parse items from session metadata
    let summary = { bulkUnits: 0, kits: 0, tests: 0 };
    try {
      if (session.metadata?.summary) {
        summary = JSON.parse(session.metadata.summary);
      }
    } catch (err) {
      console.error('[Recover] Failed to parse summary:', err);
    }

    // Get line items for better summary
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
    let itemsSummary = '';
    let quantity = 0;

    for (const item of lineItems.data) {
      const desc = item.description || '';
      if (desc.toLowerCase().includes('shipping')) continue;
      quantity += item.quantity || 0;
      if (itemsSummary) itemsSummary += ', ';
      itemsSummary += `${desc} (${item.quantity})`;
    }

    console.log('[Recover] Items summary:', itemsSummary);
    console.log('[Recover] Quantity:', quantity);

    // Get next invoice number
    const counterKey = process.env.VERCEL_ENV === 'production' ? 'invoice_prod' : 'invoice_preview';
    const result = await sql`
      INSERT INTO order_counter (id, seq)
      VALUES (${counterKey}, 1)
      ON CONFLICT (id) DO UPDATE SET seq = order_counter.seq + 1
      RETURNING seq
    `;
    const invoiceNumber = result[0].seq;

    console.log('[Recover] Generated invoice number:', invoiceNumber);

    // Insert order
    await sql`
      INSERT INTO orders (
        invoice_number,
        customer_name,
        contact_name,
        customer_email,
        customer_phone,
        items_summary,
        shipping_method,
        quantity,
        status,
        order_date,
        amount_cents,
        subtotal_cents,
        shipping_cents,
        tracking_number,
        carrier,
        session_id,
        shipping_address,
        billing_address
      ) VALUES (
        ${invoiceNumber},
        ${customerName},
        ${contactName},
        ${customerEmail},
        ${customerPhone},
        ${itemsSummary},
        ${shippingMethod},
        ${quantity},
        'pending',
        CURRENT_DATE,
        ${totalCents},
        ${subtotalCents},
        ${shippingCents},
        '',
        ${shipCarrier},
        ${sessionId},
        ${shippingAddressStr},
        ${billingAddressStr}
      )
    `;

    console.log('[Recover] Order saved to database');

    // Send team notification emails
    const bccEmails = EMAIL_BCC.split(',').map(e => e.trim()).filter(Boolean);
    const emailsSent = [];

    console.log('[Recover] Sending emails to:', bccEmails);

    for (const email of bccEmails) {
      try {
        await sendViaResend({
          to: email,
          subject: `🔔 New Test Order #${invoiceNumber} - ${customerName}`,
          html: `
            <h2>New Test Order Received</h2>
            <p><strong>Invoice:</strong> #${invoiceNumber}</p>
            <p><strong>Customer:</strong> ${customerName}</p>
            <p><strong>Contact:</strong> ${contactName || 'N/A'}</p>
            <p><strong>Email:</strong> ${customerEmail}</p>
            <p><strong>Phone:</strong> ${customerPhone || 'N/A'}</p>
            <p><strong>Items:</strong> ${itemsSummary}</p>
            <p><strong>Quantity:</strong> ${quantity} units</p>
            <p><strong>Total:</strong> $${(totalCents / 100).toFixed(2)}</p>
            <p><strong>Shipping:</strong> ${shippingMethod || 'None'}</p>
            <p><em>This is a webhook test order - manually recovered</em></p>
          `
        });
        emailsSent.push(email);
        console.log(`[Recover] Sent email to ${email}`);
        await new Promise(r => setTimeout(r, 600)); // Rate limit
      } catch (emailErr) {
        console.error(`[Recover] Failed to send email to ${email}:`, emailErr);
      }
    }

    // Send customer email
    if (RESEND_API_KEY && customerEmail) {
      try {
        await sendViaResend({
          to: customerEmail,
          subject: `Order Confirmation #${invoiceNumber} - Force Dowels`,
          html: `
            <h2>Thank You for Your Order!</h2>
            <p>Hi ${contactName || customerName},</p>
            <p>Your order has been confirmed.</p>
            <p><strong>Order Number:</strong> #${invoiceNumber}</p>
            <p><strong>Total:</strong> $${(totalCents / 100).toFixed(2)}</p>
            <p><strong>Items:</strong> ${itemsSummary}</p>
            <p>We'll send you another email when your order ships.</p>
            <p>Questions? Contact us at ${EMAIL_FROM}</p>
          `
        });
        console.log(`[Recover] Sent confirmation email to customer: ${customerEmail}`);
      } catch (emailErr) {
        console.error('[Recover] Failed to send customer email:', emailErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Test order recovered successfully',
      invoice_number: invoiceNumber,
      customer_email: customerEmail,
      amount: (totalCents / 100).toFixed(2),
      emails_sent: emailsSent.length,
      customer_email_sent: !!customerEmail
    });

  } catch (err) {
    console.error('[Recover] Error:', err);
    return res.status(500).json({
      error: 'Failed to recover order',
      message: err.message,
      stack: err.stack
    });
  }
}
