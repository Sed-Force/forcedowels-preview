// /api/stripe-webhook.js
// Listens for checkout.session.completed and emails the customer.
export const config = { runtime: 'nodejs' };

import Stripe from 'stripe';
import { sql, nextCounter } from './_lib/db.js';
import { buildInternationalOrderConfirmationEmail } from './_lib/email/internationalOrderConfirmation.js';
import { buildInternationalInternalNotificationHTML } from './_lib/email/internationalInternalNotification.js';

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'orders@forcedowels.com';
const EMAIL_BCC = process.env.EMAIL_BCC || '';

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

const asJSON = (res, code, obj) => {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj, null, 2));
};

function formatMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  });
}

async function sendViaResend({ to, subject, html, text, bcc }) {
  const body = { from: EMAIL_FROM, to: [to], subject, html };
  if (text) body.text = text;
  if (bcc) body.bcc = bcc;

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
  if (req.method !== 'POST') return asJSON(res, 405, { error: 'Method not allowed' });
  if (!stripe) return asJSON(res, 500, { error: 'Stripe not configured' });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return asJSON(res, 500, { error: 'Missing STRIPE_WEBHOOK_SECRET' });

  // Verify signature
  let event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verify failed:', err?.message || err);
    return asJSON(res, 400, { error: 'invalid_signature' });
  }

  if (event.type !== 'checkout.session.completed') {
    return asJSON(res, 200, { received: true, ignored: event.type });
  }

  try {
    const session = event.data.object;
    const sessionId = session.id;
    const customerEmail = session.customer_details?.email || session.customer_email || '';

    // Retrieve expanded line items
    const full = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });
    const lineItems = full.line_items?.data || [];

    // Separate shipping vs goods
    let shippingCents = 0;
    for (const li of lineItems) {
      const name = (li.description || '').toLowerCase();
      if (name === 'shipping') {
        shippingCents += Number(li.amount_total || 0);
      }
    }

    // Prefer explicit metadata ship_amount if present
    const metaShip = Number(session.metadata?.ship_amount_cents || 0);
    if (Number.isFinite(metaShip) && metaShip > 0) shippingCents = metaShip;

    const totalCents = Number(session.amount_total || 0);
    const subtotalCents = Math.max(0, totalCents - (shippingCents || 0));
    const taxCents = Number(session.total_details?.amount_tax || 0);

    // Parse metadata
    let metaSummary = {};
    try { metaSummary = JSON.parse(session.metadata?.summary || '{}'); } catch {}

    const { bulkUnits = 0, kits = 0, tests = 0 } = metaSummary;
    const shipCarrier = session.metadata?.ship_carrier || '';
    const shipService = session.metadata?.ship_service || '';
    const shippingMethod = [shipCarrier, shipService].filter(Boolean).join(' ');

    const customerName = session.metadata?.customer_name || '';
    const contactName = session.metadata?.contact_name || '';

    // Parse shipping address
    let shippingAddress = {};
    try {
      shippingAddress = JSON.parse(session.metadata?.ship_address || '{}');
    } catch {}

    // Format order date
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
    let invoiceNumber = 0;
    try {
      invoiceNumber = await nextCounter(counterKey);
    } catch (err) {
      console.error('Failed to generate invoice number:', err);
      invoiceNumber = Math.floor(Date.now() / 1000);
    }

    // Update Stripe session with invoice number
    try {
      await stripe.checkout.sessions.update(sessionId, {
        metadata: { ...session.metadata, invoice_number: String(invoiceNumber) }
      });
    } catch (err) {
      console.error('Failed to update Stripe session metadata:', err);
    }

    // Determine order type
    let orderType = 'bulk';
    let itemsSummary = '';
    let quantity = bulkUnits;

    if (tests > 0) {
      orderType = 'test';
      itemsSummary = 'Test Order';
      quantity = 1;
    } else if (bulkUnits > 0) {
      orderType = 'bulk';
      itemsSummary = `Bulk - ${bulkUnits.toLocaleString()} units`;
      quantity = bulkUnits;
    } else if (kits > 0) {
      orderType = 'kit';
      const totalUnits = kits * 300;
      itemsSummary = `Kit - 300 units (${totalUnits}) (Qty: ${totalUnits})`;
      quantity = totalUnits;
    }

    // Save order to database
    try {
      await sql`
        INSERT INTO orders (
          invoice_number,
          session_id,
          customer_email,
          customer_name,
          contact_name,
          quantity,
          items_summary,
          subtotal_cents,
          shipping_cents,
          amount_cents,
          shipping_method,
          shipping_address,
          order_date,
          status
        )
        VALUES (
          ${invoiceNumber},
          ${sessionId},
          ${customerEmail},
          ${customerName || ''},
          ${contactName || ''},
          ${quantity},
          ${itemsSummary},
          ${subtotalCents},
          ${shippingCents},
          ${totalCents},
          ${shippingMethod},
          ${JSON.stringify(shippingAddress)},
          ${new Date(session.created * 1000).toISOString().split('T')[0]},
          ${'completed'}
        )
      `;
      console.log(`[Webhook] Order saved to DB: Invoice #${invoiceNumber}`);
    } catch (dbErr) {
      console.error('[Webhook] Failed to save order to database:', dbErr);
    }

    // Send emails
    const bccList = EMAIL_BCC ? EMAIL_BCC.split(',').map(e => e.trim()) : [];
    const isTestOrder = tests > 0;

    // Customer email
    try {
      const testBadge = isTestOrder ? ' [TEST ORDER]' : '';
      const customerSubject = `Order Confirmation #${invoiceNumber}${testBadge} – Force Dowels`;
      const customerHtml = `
        ${isTestOrder ? '<div style="background:#fbbf24;color:#1b2437;padding:12px;text-align:center;font-weight:bold;">🧪 TEST ORDER - This is a test email</div>' : ''}
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
      console.log(`[Webhook] Customer email sent to ${customerEmail}`);
    } catch (emailErr) {
      console.error('[Webhook] Failed to send customer email:', emailErr);
    }

    // Team notification emails (send to each BCC address individually)
    for (const teamEmail of bccList) {
      try {
        const testBadge = isTestOrder ? ' [TEST]' : '';
        const teamSubject = `New Order #${invoiceNumber}${testBadge} – ${customerName || customerEmail}`;
        const teamHtml = `
          ${isTestOrder ? '<div style="background:#fbbf24;color:#1b2437;padding:12px;text-align:center;font-weight:bold;">🧪 TEST ORDER - Email System Verification</div>' : ''}
          <h1>New Order Received</h1>
          <p><strong>Invoice #${invoiceNumber}</strong></p>
          <p><strong>Customer:</strong> ${customerName || customerEmail}</p>
          <p><strong>Contact:</strong> ${contactName || 'N/A'}</p>
          <p><strong>Email:</strong> ${customerEmail}</p>
          <p><strong>Date:</strong> ${orderDate}</p>
          <p><strong>Items:</strong> ${itemsSummary}</p>
          <p><strong>Subtotal:</strong> ${formatMoney(subtotalCents)}</p>
          <p><strong>Shipping:</strong> ${formatMoney(shippingCents)}</p>
          <p><strong>Tax:</strong> ${formatMoney(taxCents)}</p>
          <p><strong>Total:</strong> ${formatMoney(totalCents)}</p>
          <p><strong>Shipping Method:</strong> ${shippingMethod || 'N/A'}</p>
          <p><strong>Stripe Session:</strong> ${sessionId}</p>
        `;

        await sendViaResend({
          to: teamEmail,
          subject: teamSubject,
          html: teamHtml
        });
        console.log(`[Webhook] Team email sent to ${teamEmail}`);

        // Rate limit: 600ms between emails
        await new Promise(resolve => setTimeout(resolve, 600));
      } catch (emailErr) {
        console.error(`[Webhook] Failed to send team email to ${teamEmail}:`, emailErr);
      }
    }

    return asJSON(res, 200, {
      success: true,
      invoice: invoiceNumber,
      customer_email_sent: true,
      team_emails_sent: bccList.length
    });

  } catch (err) {
    console.error('[Webhook] Error processing event:', err);
    return asJSON(res, 500, { error: 'webhook_processing_failed', message: err.message });
  }
}
