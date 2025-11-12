// Recover the latest test order
import Stripe from 'stripe';
import { sql, nextCounter } from '../_lib/db.js';

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'orders@forcedowels.com';
const EMAIL_BCC = process.env.EMAIL_BCC || '';

function formatMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  });
}

async function sendViaResend({ to, subject, html }) {
  const body = { from: EMAIL_FROM, to: [to], subject, html };

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status, body: await r.text() };
}

export default async function handler(req, res) {
  try {
    const sessionId = 'cs_live_a1kriRpN2MMl6TZD96nP1sF1ou4R8VsUB6XKEJLku3VMopFryNfQURUBEu';

    // Retrieve session
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });

    const customerEmail = session.customer_details?.email || '';
    const totalCents = Number(session.amount_total || 0);

    const orderDate = new Date(session.created * 1000).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short'
    });

    // Generate invoice number
    const counterKey = process.env.VERCEL_ENV === 'production' ? 'invoice_prod' : 'invoice_preview';
    const invoiceNumber = await nextCounter(counterKey);

    // Save to database
    await sql`
      INSERT INTO orders (
        invoice_number,
        session_id,
        customer_email,
        customer_name,
        contact_name,
        order_type,
        quantity,
        items_summary,
        subtotal_cents,
        shipping_cents,
        tax_cents,
        total_cents,
        shipping_method,
        shipping_address,
        order_date,
        status
      )
      VALUES (
        ${invoiceNumber},
        ${sessionId},
        ${customerEmail},
        ${'Test Customer'},
        ${''},
        ${'test'},
        ${1},
        ${'Test Order'},
        ${100},
        ${0},
        ${0},
        ${100},
        ${''},
        ${'{}'},
        ${new Date(session.created * 1000).toISOString()},
        ${'completed'}
      )
    `;

    // Send customer email
    const customerSubject = `Order Confirmation #${invoiceNumber} [TEST ORDER] – Force Dowels`;
    const customerHtml = `
      <div style="background:#fbbf24;color:#1b2437;padding:12px;text-align:center;font-weight:bold;">🧪 TEST ORDER - This is a test email</div>
      <h1>Thank you for your order!</h1>
      <p>Order #${invoiceNumber}</p>
      <p>Date: ${orderDate}</p>
      <p>Total: ${formatMoney(totalCents)}</p>
      <p>We'll process your order and send you tracking information soon.</p>
    `;

    await sendViaResend({
      to: customerEmail,
      subject: customerSubject,
      html: customerHtml
    });

    // Send team emails
    const bccList = EMAIL_BCC ? EMAIL_BCC.split(',').map(e => e.trim()) : [];
    const emailResults = [];

    for (const teamEmail of bccList) {
      const teamSubject = `New Order #${invoiceNumber} [TEST] – Test Customer`;
      const teamHtml = `
        <div style="background:#fbbf24;color:#1b2437;padding:12px;text-align:center;font-weight:bold;">🧪 TEST ORDER - Email System Verification</div>
        <h1>New Order Received</h1>
        <p><strong>Invoice #${invoiceNumber}</strong></p>
        <p><strong>Customer:</strong> Test Customer</p>
        <p><strong>Email:</strong> ${customerEmail}</p>
        <p><strong>Date:</strong> ${orderDate}</p>
        <p><strong>Items:</strong> Test Order</p>
        <p><strong>Total:</strong> ${formatMoney(totalCents)}</p>
      `;

      await sendViaResend({
        to: teamEmail,
        subject: teamSubject,
        html: teamHtml
      });

      emailResults.push(teamEmail);
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    return res.status(200).json({
      success: true,
      invoice: invoiceNumber,
      customer_email: customerEmail,
      team_emails_sent: emailResults
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Recovery failed',
      message: err.message,
      stack: err.stack
    });
  }
}
