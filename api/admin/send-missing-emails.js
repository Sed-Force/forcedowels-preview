// Send missing emails for Invoice #48
import Stripe from 'stripe';
import { sql } from '../_lib/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Email configuration
const EMAIL_FROM = process.env.EMAIL_FROM || 'orders@forcedowels.com';
const EMAIL_BCC = process.env.EMAIL_BCC || 'info@forcedowels.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

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

async function sendViaSendgrid({ to, subject, html }) {
  const body = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: EMAIL_FROM },
    subject,
    content: [{ type: 'text/html', value: html }],
  };
  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    return { ok: false, error: txt, status: resp.status };
  }
  return { ok: true };
}

function buildEmailHTML({ invoiceNumber, orderId, email, items, subtotalCents, shippingCents, totalCents, metaSummary, shippingMethod }) {
  const fmtUSD = (cents) => `$${(cents / 100).toFixed(2)}`;
  const itemRows = (items || []).map((it) => `
    <tr>
      <td style="border-bottom:1px solid #eee;padding:8px 0;">${it.description || 'Item'}</td>
      <td style="border-bottom:1px solid #eee;padding:8px 0;text-align:right;">Qty ${it.quantity || 1}</td>
      <td style="border-bottom:1px solid #eee;padding:8px 0;text-align:right;">${fmtUSD(it.amount_total || 0)}</td>
    </tr>
  `).join('');

  const summary = metaSummary ? `
    <div style="margin:20px 0;padding:15px;background:#f8f9fa;border-radius:6px;">
      <strong>Order Details:</strong>
      ${metaSummary.bulkUnits ? `<div>Bulk Units: ${metaSummary.bulkUnits}</div>` : ''}
      ${metaSummary.kits ? `<div>Kits: ${metaSummary.kits} (${metaSummary.kits * 300} dowels)</div>` : ''}
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Force Dowels Order Confirmation</title>
</head>
<body style="font-family:Arial,sans-serif;margin:0;padding:20px;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:30px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
    <h1 style="color:#333;margin-top:0;">Thank You for Your Order!</h1>
    <p style="color:#666;font-size:16px;">We've received your order and will process it shortly.</p>

    <div style="margin:20px 0;padding:15px;background:#f8f9fa;border-radius:6px;">
      <p style="margin:5px 0;"><strong>Invoice Number:</strong> #${invoiceNumber}</p>
      <p style="margin:5px 0;"><strong>Order ID:</strong> ${orderId}</p>
      <p style="margin:5px 0;"><strong>Email:</strong> ${email}</p>
    </div>

    ${summary}

    <table style="width:100%;margin:20px 0;border-collapse:collapse;">
      ${itemRows}
      <tr>
        <td colspan="2" style="padding:8px 0;text-align:right;"><strong>Subtotal:</strong></td>
        <td style="padding:8px 0;text-align:right;"><strong>${fmtUSD(subtotalCents)}</strong></td>
      </tr>
      <tr>
        <td colspan="2" style="padding:8px 0;text-align:right;">Shipping (${shippingMethod || 'Standard'}):</td>
        <td style="padding:8px 0;text-align:right;">${fmtUSD(shippingCents)}</td>
      </tr>
      <tr style="border-top:2px solid #333;">
        <td colspan="2" style="padding:12px 0;text-align:right;"><strong>Total:</strong></td>
        <td style="padding:12px 0;text-align:right;"><strong>${fmtUSD(totalCents)}</strong></td>
      </tr>
    </table>

    <div style="margin:30px 0;padding:20px;background:#e8f5e9;border-radius:6px;">
      <p style="margin:0;color:#2e7d32;"><strong>What's Next?</strong></p>
      <p style="margin:10px 0 0;color:#555;">We'll send you a shipping confirmation with tracking information once your order ships.</p>
    </div>

    <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">

    <p style="color:#999;font-size:14px;text-align:center;margin:0;">
      Force Dowels<br>
      Questions? Contact us at ${EMAIL_FROM}
    </p>
  </div>
</body>
</html>
  `.trim();
}

function buildInternalNotificationHTML({ invoiceNumber, orderId, customerName, customerEmail, orderDate, sessionId, items, subtotalCents, shippingCents, taxCents, totalCents, metaSummary, shippingMethod, shippingAddress, billingAddress }) {
  const fmtUSD = (cents) => `$${(cents / 100).toFixed(2)}`;
  const itemRows = (items || []).map((it) => `
    <tr>
      <td style="border-bottom:1px solid #eee;padding:8px;">${it.description || 'Item'}</td>
      <td style="border-bottom:1px solid #eee;padding:8px;text-align:center;">Qty ${it.quantity || 1}</td>
      <td style="border-bottom:1px solid #eee;padding:8px;text-align:right;">${fmtUSD(it.amount_total || 0)}</td>
    </tr>
  `).join('');

  const summary = metaSummary ? `
    <div style="margin:20px 0;padding:15px;background:#fff3cd;border-radius:6px;">
      <strong>Order Details:</strong>
      ${metaSummary.bulkUnits ? `<div>Bulk Units: ${metaSummary.bulkUnits}</div>` : ''}
      ${metaSummary.kits ? `<div>Kits: ${metaSummary.kits} (${metaSummary.kits * 300} dowels)</div>` : ''}
    </div>
  ` : '';

  const formatAddress = (addr) => {
    if (!addr) return 'N/A';
    return `${addr.line1 || ''} ${addr.line2 || ''}<br>${addr.city || ''}, ${addr.state || ''} ${addr.postal_code || ''}<br>${addr.country || ''}`;
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Order - Invoice #${invoiceNumber}</title>
</head>
<body style="font-family:Arial,sans-serif;margin:0;padding:20px;background:#f5f5f5;">
  <div style="max-width:700px;margin:0 auto;background:#fff;padding:30px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
    <h1 style="color:#d32f2f;margin-top:0;">🔔 New Order Received</h1>

    <div style="margin:20px 0;padding:20px;background:#f8f9fa;border-radius:6px;">
      <h2 style="margin:0 0 15px;color:#333;">Order Information</h2>
      <p style="margin:5px 0;"><strong>Invoice Number:</strong> #${invoiceNumber}</p>
      <p style="margin:5px 0;"><strong>Order ID:</strong> ${orderId}</p>
      <p style="margin:5px 0;"><strong>Order Date:</strong> ${orderDate}</p>
      <p style="margin:5px 0;"><strong>Session ID:</strong> ${sessionId}</p>
    </div>

    <div style="margin:20px 0;padding:20px;background:#e3f2fd;border-radius:6px;">
      <h2 style="margin:0 0 15px;color:#333;">Customer Information</h2>
      <p style="margin:5px 0;"><strong>Name:</strong> ${customerName}</p>
      <p style="margin:5px 0;"><strong>Email:</strong> ${customerEmail}</p>
    </div>

    ${summary}

    <h2 style="color:#333;margin:30px 0 15px;">Order Items</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:10px;text-align:left;border-bottom:2px solid #ddd;">Item</th>
          <th style="padding:10px;text-align:center;border-bottom:2px solid #ddd;">Quantity</th>
          <th style="padding:10px;text-align:right;border-bottom:2px solid #ddd;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <table style="width:100%;margin:20px 0;">
      <tr>
        <td style="padding:8px 0;text-align:right;"><strong>Subtotal:</strong></td>
        <td style="padding:8px 0;text-align:right;width:120px;"><strong>${fmtUSD(subtotalCents)}</strong></td>
      </tr>
      <tr>
        <td style="padding:8px 0;text-align:right;">Shipping (${shippingMethod || 'Standard'}):</td>
        <td style="padding:8px 0;text-align:right;">${fmtUSD(shippingCents)}</td>
      </tr>
      ${taxCents > 0 ? `
      <tr>
        <td style="padding:8px 0;text-align:right;">Tax:</td>
        <td style="padding:8px 0;text-align:right;">${fmtUSD(taxCents)}</td>
      </tr>
      ` : ''}
      <tr style="border-top:2px solid #333;">
        <td style="padding:12px 0;text-align:right;"><strong>Total:</strong></td>
        <td style="padding:12px 0;text-align:right;"><strong>${fmtUSD(totalCents)}</strong></td>
      </tr>
    </table>

    <div style="margin:30px 0;">
      <h2 style="color:#333;margin:0 0 15px;">Shipping Address</h2>
      <div style="padding:15px;background:#f5f5f5;border-radius:6px;">
        ${formatAddress(shippingAddress)}
      </div>
    </div>

    <div style="margin:30px 0;">
      <h2 style="color:#333;margin:0 0 15px;">Billing Address</h2>
      <div style="padding:15px;background:#f5f5f5;border-radius:6px;">
        ${formatAddress(billingAddress)}
      </div>
    </div>

    <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">

    <p style="color:#999;font-size:14px;text-align:center;margin:0;">
      Force Dowels Internal Notification<br>
      This email was automatically generated from the order system.
    </p>
  </div>
</body>
</html>
  `.trim();
}

export default async function handler(req, res) {
  try {
    const invoiceNumber = 48;
    const paymentIntentId = 'pi_3SPPVOBZKB1NmC8J1yG9mAh6';

    // Get order from database
    const orderRows = await sql`
      SELECT * FROM orders WHERE invoice_number = ${invoiceNumber}
    `;

    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRows[0];

    // Get the checkout session from Stripe
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1
    });

    if (sessions.data.length === 0) {
      return res.status(404).json({ error: 'No session found for this payment' });
    }

    const session = sessions.data[0];
    const sessionId = session.id;

    // Get line items
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);

    // Extract data for emails
    const customerName = order.customer_name;
    const customerEmail = order.customer_email;
    const shortId = `#${sessionId.slice(-8)}`;
    const orderDate = order.order_date || new Date().toISOString().split('T')[0];

    // Parse addresses
    const shippingAddress = order.shipping_address ? parseAddress(order.shipping_address) : null;
    const billingAddress = order.billing_address ? parseAddress(order.billing_address) : null;

    // Calculate amounts
    const totalCents = order.amount_cents;
    const subtotalCents = totalCents - 0; // No separate shipping in this order
    const shippingCents = 0;
    const taxCents = 0;

    // Build metadata summary
    const metaSummary = {
      kits: 1,
      bulkUnits: 0
    };

    // Build customer email
    const customerSubject = `Force Dowels Order ${shortId}`;
    const customerHtml = buildEmailHTML({
      invoiceNumber,
      orderId: shortId,
      email: customerEmail,
      items: lineItems.data,
      subtotalCents,
      shippingCents,
      totalCents,
      metaSummary,
      shippingMethod: order.shipping_method
    });

    // Build internal notification email
    const internalSubject = `New Order Received - Invoice #${invoiceNumber}`;
    const internalHtml = buildInternalNotificationHTML({
      invoiceNumber,
      orderId: shortId,
      customerName,
      customerEmail,
      orderDate,
      sessionId,
      items: lineItems.data,
      subtotalCents,
      shippingCents,
      taxCents,
      totalCents,
      metaSummary,
      shippingMethod: order.shipping_method,
      shippingAddress,
      billingAddress
    });

    const results = {
      customer: { sent: false },
      internal: []
    };

    // Send customer email
    if (RESEND_API_KEY) {
      const sent = await sendViaResend({
        to: customerEmail,
        subject: customerSubject,
        html: customerHtml
      });
      results.customer = { sent: sent.ok, detail: sent };
    } else if (SENDGRID_API_KEY) {
      const sent = await sendViaSendgrid({
        to: customerEmail,
        subject: customerSubject,
        html: customerHtml
      });
      results.customer = { sent: sent.ok, detail: sent };
    }

    // Send internal notifications
    if (EMAIL_BCC) {
      const bccEmails = EMAIL_BCC.split(',').map(e => e.trim()).filter(Boolean);

      for (let i = 0; i < bccEmails.length; i++) {
        const email = bccEmails[i];

        // Add 600ms delay between emails to respect rate limits (2 req/sec)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        if (RESEND_API_KEY) {
          const sent = await sendViaResend({
            to: email,
            subject: internalSubject,
            html: internalHtml
          });
          results.internal.push({ email, sent: sent.ok, detail: sent });
        } else if (SENDGRID_API_KEY) {
          const sent = await sendViaSendgrid({
            to: email,
            subject: internalSubject,
            html: internalHtml
          });
          results.internal.push({ email, sent: sent.ok, detail: sent });
        }
      }
    }

    return res.status(200).json({
      success: true,
      invoiceNumber,
      results
    });

  } catch (err) {
    console.error('Error sending missing emails:', err);
    return res.status(500).json({
      error: 'Failed to send emails',
      message: err.message
    });
  }
}

function parseAddress(addressStr) {
  if (!addressStr) return null;

  // Simple address parser - addresses are stored as "line1 city, state, postal, country"
  const parts = addressStr.split(',').map(s => s.trim());

  return {
    line1: parts[0] || '',
    line2: '',
    city: parts[1] || '',
    state: parts[2] || '',
    postal_code: parts[3] || '',
    country: parts[4] || 'US'
  };
}
