// /api/stripe-webhook.js
// Listens for checkout.session.completed and emails the customer.
export const config = { runtime: 'nodejs' };

import Stripe from 'stripe';
import { sql, nextCounter } from './_lib/db.js';
import { buildOrderConfirmationEmail } from './_lib/email/orderConfirmation.js';
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

function unitPriceMillsFor(units) {
  if (units >= 160000) return 63;   // $0.063
  if (units >= 20000)  return 67.5; // $0.0675
  return 72;                        // $0.072
}

function tierLabel(units) {
  if (units >= 160000) return '160,000–960,000';
  if (units >= 20000)  return '20,000–160,000';
  return '5,000–20,000';
}

function bulkTotalCents(units) {
  if (!Number.isFinite(units) || units < 5000) return 0;
  const mills = unitPriceMillsFor(units);
  return Math.round((units * mills) / 10); // mills->cents
}

function buildInternalNotificationHTML({ invoiceNumber, customerName, customerEmail, customerPhone, orderDate, sessionId, subtotalCents, shippingCents, taxCents, totalCents, metaSummary, shippingMethod, shippingAddress, billingAddress, isTest }) {
  const { bulkUnits = 0, kits = 0, tests = 0 } = metaSummary || {};

  // Build order items table rows
  let itemRows = '';
  if (tests > 0) {
    itemRows = `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">🧪 Webhook Test Order</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">Test</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;">1</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$1.00</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$1.00</td>
      </tr>`;
  } else if (bulkUnits > 0) {
    const unitPrice = bulkTotalCents(bulkUnits) / bulkUnits / 100;
    const tierName = tierLabel(bulkUnits);
    itemRows += `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">Force Dowels</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${tierName}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;">${bulkUnits.toLocaleString()}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${unitPrice.toFixed(4)}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(bulkTotalCents(bulkUnits))}</td>
      </tr>`;
  }

  if (kits > 0) {
    itemRows += `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">Force Dowels</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">Kit - 300 units</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;">300</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$0.12</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$36.00</td>
      </tr>`;
  }

  const logoUrl = process.env.EMAIL_LOGO_URL || `${(process.env.NEXT_PUBLIC_BASE_URL || 'https://forcedowels.com').replace(/\/$/, '')}/images/force-dowel-logo.jpg`;
  const testBanner = isTest ? '<tr><td style="padding:16px;background:#fbbf24;text-align:center;"><h2 style="margin:0;color:#1b2437;">🧪 TEST ORDER - Email System Verification</h2></td></tr>' : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>New Order Received</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:680px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#1C4A99;padding:24px;text-align:center;">
              <img src="${logoUrl}" alt="Force Dowels" style="height:60px;margin:0 auto;border-radius:8px;">
              <h1 style="margin:16px 0 0;color:#ffffff;font-size:24px;font-weight:700;">New Order Received!</h1>
              <p style="margin:8px 0 0;color:#e0e7ff;font-size:14px;">Force Dowels Order Notification</p>
            </td>
          </tr>
          ${testBanner}

          <!-- Success Message -->
          <tr>
            <td style="padding:24px;background:#f0fdf4;border-bottom:1px solid #e5e7eb;">
              <h2 style="margin:0 0 8px;color:#166534;font-size:18px;font-weight:600;">Payment Successful!</h2>
              <p style="margin:0;color:#15803d;font-size:14px;">A new order has been placed and payment has been confirmed.</p>
            </td>
          </tr>

          <!-- Customer Information -->
          <tr>
            <td style="padding:24px;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Customer Information</h3>
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;width:140px;"><strong>Invoice #:</strong></td>
                  <td style="padding:8px 0;color:#1C4A99;font-size:18px;font-weight:700;">${invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Company/Name:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${customerName || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Email:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${customerEmail || 'N/A'}</td>
                </tr>
                ${customerPhone ? `<tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Phone:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${customerPhone}</td>
                </tr>` : ''}
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Order Date:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${orderDate}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Stripe Session:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;font-family:monospace;font-size:12px;">${sessionId}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Order Items -->
          <tr>
            <td style="padding:24px;background:#f9fafb;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Order Items</h3>
              <table role="presentation" style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f3f4f6;">
                    <th style="padding:12px;text-align:left;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Product</th>
                    <th style="padding:12px;text-align:left;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Tier</th>
                    <th style="padding:12px;text-align:center;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Qty</th>
                    <th style="padding:12px;text-align:right;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Unit Price</th>
                    <th style="padding:12px;text-align:right;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Order Summary -->
          <tr>
            <td style="padding:24px;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Order Summary</h3>
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Subtotal:</strong></td>
                  <td style="padding:8px 0;text-align:right;color:#111827;font-size:14px;">${formatMoney(subtotalCents)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Shipping${shippingMethod ? ` (${shippingMethod})` : ''}:</strong></td>
                  <td style="padding:8px 0;text-align:right;color:#111827;font-size:14px;">${formatMoney(shippingCents)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Tax:</strong></td>
                  <td style="padding:8px 0;text-align:right;color:#111827;font-size:14px;">${formatMoney(taxCents)}</td>
                </tr>
                <tr style="border-top:2px solid #e5e7eb;">
                  <td style="padding:12px 0 0;color:#111827;font-size:16px;font-weight:700;"><strong>Total:</strong></td>
                  <td style="padding:12px 0 0;text-align:right;color:#1C4A99;font-size:18px;font-weight:700;">${formatMoney(totalCents)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Shipping Information -->
          <tr>
            <td style="padding:24px;background:#f9fafb;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Shipping Information</h3>
              <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">
                ${shippingAddress.name || customerName || ''}<br>
                ${shippingAddress.line1 || ''}<br>
                ${shippingAddress.line2 ? `${shippingAddress.line2}<br>` : ''}
                ${shippingAddress.city || ''}, ${shippingAddress.state || ''} ${shippingAddress.postal_code || ''}<br>
                ${shippingAddress.country || ''}
              </p>
            </td>
          </tr>

          <!-- Billing Information -->
          <tr>
            <td style="padding:24px;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Billing Information</h3>
              <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">
                ${billingAddress.line1 || billingAddress.city || 'N/A'}<br>
                ${billingAddress.line2 ? `${billingAddress.line2}<br>` : ''}
                ${billingAddress.city ? `${billingAddress.city}, ` : ''}${billingAddress.state || ''} ${billingAddress.postal_code || ''}<br>
                ${billingAddress.country || 'US'}
              </p>
            </td>
          </tr>

          <!-- Action Required -->
          <tr>
            <td style="padding:24px;background:#fef3c7;border-top:1px solid #e5e7eb;">
              <h3 style="margin:0 0 8px;color:#92400e;font-size:16px;font-weight:600;">Action Required</h3>
              <p style="margin:0;color:#78350f;font-size:14px;">Please process this order and prepare it for shipment. The customer has been notified of their successful purchase.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:12px;">This is an automated notification from your Force Dowels order system.</p>
              <p style="margin:8px 0 0;color:#9ca3af;font-size:11px;">© 2025 Force Dowels. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
    const customerPhone = session.customer_details?.phone || '';

    // Parse shipping address
    let shippingAddress = {};
    try {
      shippingAddress = JSON.parse(session.metadata?.ship_address || '{}');
    } catch {}

    // Get billing address from session
    const billingAddress = session.customer_details?.address || {};

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
          ${'pending'}
        )
      `;
      console.log(`[Webhook] Order saved to DB: Invoice #${invoiceNumber}`);
    } catch (dbErr) {
      console.error('[Webhook] Failed to save order to database:', dbErr);
    }

    // Send emails
    const bccList = EMAIL_BCC ? EMAIL_BCC.split(',').map(e => e.trim()) : [];
    const isTestOrder = tests > 0;

    // Customer email - use professional template
    try {
      // Calculate unit price and tier for email
      let unitUsd = '0.0000';
      let tierLabelText = '';
      let units = quantity;

      if (orderType === 'bulk' && bulkUnits >= 5000) {
        const mills = unitPriceMillsFor(bulkUnits);
        unitUsd = (mills / 10000).toFixed(4); // mills to dollars
        tierLabelText = tierLabel(bulkUnits);
      } else if (orderType === 'kit') {
        unitUsd = '36.0000';
        tierLabelText = 'Starter Kit';
        units = kits * 300;
      } else if (orderType === 'test') {
        unitUsd = '1.0000';
        tierLabelText = 'Test Order';
        units = 1;
      }

      const lineTotal = (subtotalCents / 100).toFixed(2);
      const emailData = buildOrderConfirmationEmail({
        customer_name: customerName || contactName || 'Customer',
        order_number: String(invoiceNumber),
        order_date: orderDate,
        units: units,
        unit_usd: unitUsd,
        tier_label: tierLabelText,
        line_total: lineTotal,
        subtotal: (subtotalCents / 100).toFixed(2),
        shipping: (shippingCents / 100).toFixed(2),
        tax: (taxCents / 100).toFixed(2),
        total: (totalCents / 100).toFixed(2),
        ship_name: shippingAddress.name || customerName || '',
        ship_address1: shippingAddress.line1 || '',
        ship_address2: shippingAddress.line2 || '',
        ship_city: shippingAddress.city || '',
        ship_state: shippingAddress.state || '',
        ship_postal: shippingAddress.postal_code || '',
        ship_country: shippingAddress.country || '',
        order_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://forcedowels.com'}/order-status.html?session=${sessionId}`,
        is_test: isTestOrder
      });

      await sendViaResend({
        to: customerEmail,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text
      });
      console.log(`[Webhook] Customer email sent to ${customerEmail}`);
    } catch (emailErr) {
      console.error('[Webhook] Failed to send customer email:', emailErr);
    }

    // Team notification emails (send to each BCC address individually) - use professional template
    for (const teamEmail of bccList) {
      try {
        const testBadge = isTestOrder ? ' [TEST]' : '';
        const teamSubject = `New Order #${invoiceNumber}${testBadge} – ${customerName || customerEmail}`;

        const teamHtml = buildInternalNotificationHTML({
          invoiceNumber,
          customerName: customerName || contactName || customerEmail,
          customerEmail,
          customerPhone,
          orderDate,
          sessionId,
          subtotalCents,
          shippingCents,
          taxCents,
          totalCents,
          metaSummary: { bulkUnits, kits, tests },
          shippingMethod,
          shippingAddress,
          billingAddress,
          isTest: isTestOrder
        });

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
