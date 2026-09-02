// /api/stripe-webhook.js
// Listens for checkout.session.completed and emails the customer.
export const config = { runtime: 'nodejs' };

import Stripe from 'stripe';
import { sql, nextCounter } from './_lib/db.js';
import { buildOrderConfirmationEmail } from './_lib/email/orderConfirmation.js';
import { buildInternationalOrderConfirmationEmail } from './_lib/email/internationalOrderConfirmation.js';
import { buildInternationalInternalNotificationHTML } from './_lib/email/internationalInternalNotification.js';
import { buildInternalNotificationHTML } from './_lib/email/internalNotification.js';
import { unitPriceForLine } from './_lib/email/orderFormatting.js';
import { deriveNotificationContext } from './_lib/email/orderContext.js';
import {
  kitPriceCents,
  kitUnits,
  pickTier,
  sizeLabel,
  formatItemsSummary
} from './_lib/products.js';

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

    // Derive the notification fields (shared with the order-print PDF endpoint)
    const {
      subtotalCents,
      shippingCents,
      taxCents,
      totalCents,
      metaSummary,
      orderLines,
      shippingMethod,
      shippingAddress,
      billingAddress,
      customerName,
      contactName,
      customerPhone,
      orderDate
    } = deriveNotificationContext(session, lineItems);

    // Check if this is an international order
    const isInternationalOrder = session.metadata?.international_order === 'true';
    const awaitingShippingQuote = session.metadata?.awaiting_shipping_quote === 'true';

    const { bulkUnits = 0, kits = 0, tests = 0 } = metaSummary;

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
    } else {
      itemsSummary = formatItemsSummary(orderLines, tests);
      quantity = orderLines.reduce((sum, line) => {
        if (line.type === 'bulk') return sum + line.units;
        if (line.type === 'kit') return sum + (line.qty * kitUnits(line.sizeId));
        return sum;
      }, 0);
      if (bulkUnits > 0 && kits > 0) orderType = 'mixed';
      else if (kits > 0) orderType = 'kit';
      else orderType = 'bulk';
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

      // Update customers table with aggregated data
      try {
        const orderDate = new Date(session.created * 1000).toISOString().split('T')[0];

        await sql`
          INSERT INTO customers (
            email,
            name,
            phone,
            total_orders,
            total_spent_cents,
            first_order_date,
            last_order_date
          )
          VALUES (
            ${customerEmail},
            ${customerName || ''},
            ${customerPhone || ''},
            1,
            ${totalCents},
            ${orderDate},
            ${orderDate}
          )
          ON CONFLICT (email)
          DO UPDATE SET
            name = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
            phone = COALESCE(NULLIF(EXCLUDED.phone, ''), customers.phone),
            total_orders = customers.total_orders + 1,
            total_spent_cents = customers.total_spent_cents + EXCLUDED.total_spent_cents,
            last_order_date = EXCLUDED.last_order_date
        `;
        console.log(`[Webhook] Customer record updated for ${customerEmail}`);
      } catch (custErr) {
        console.error('[Webhook] Failed to update customer record:', custErr);
      }
    } catch (dbErr) {
      console.error('[Webhook] Failed to save order to database:', dbErr);
    }

    // Send emails
    const bccList = EMAIL_BCC ? EMAIL_BCC.split(',').map(e => e.trim()) : [];
    const isTestOrder = tests > 0;

    // Calculate unit price and tier for email
    let unitUsd = '0.0000';
    let tierLabelText = '';
    let units = quantity;

    if (orderType === 'test') {
      unitUsd = '1.0000';
      tierLabelText = 'Test Order';
      units = 1;
    } else if (orderLines.length === 1 && orderLines[0].type === 'bulk') {
      const line = orderLines[0];
      unitUsd = unitPriceForLine(line).toFixed(4);
      tierLabelText = `${sizeLabel(line.sizeId)} • ${pickTier(line.sizeId, line.units).label}`;
      units = line.units;
    } else if (orderLines.length === 1 && orderLines[0].type === 'kit') {
      const line = orderLines[0];
      unitUsd = (kitPriceCents(line.sizeId) / 100).toFixed(4);
      tierLabelText = `${sizeLabel(line.sizeId)} Starter Kit`;
      units = line.qty * kitUnits(line.sizeId);
    } else {
      unitUsd = (subtotalCents / Math.max(units, 1) / 100).toFixed(4);
      tierLabelText = itemsSummary;
      units = quantity;
    }

    const lineTotal = (subtotalCents / 100).toFixed(2);

    // Customer email - use international template if applicable
    try {
      let emailData;

      if (isInternationalOrder && awaitingShippingQuote) {
        // Use international order confirmation template
        emailData = buildInternationalOrderConfirmationEmail({
          customer_name: customerName || contactName || 'Customer',
          order_number: String(invoiceNumber),
          order_date: orderDate,
          units: units,
          unit_usd: unitUsd,
          tier_label: tierLabelText,
          line_total: lineTotal,
          subtotal: (subtotalCents / 100).toFixed(2),
          tax: (taxCents / 100).toFixed(2),
          total: (totalCents / 100).toFixed(2),
          ship_name: shippingAddress.name || customerName || contactName || '',
          ship_address1: shippingAddress.line1 || '',
          ship_address2: shippingAddress.line2 || '',
          ship_city: shippingAddress.city || '',
          ship_state: shippingAddress.state || '',
          ship_postal: shippingAddress.postal_code || '',
          ship_country: shippingAddress.country || 'International',
          order_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://forcedowels.com'}/order-status.html?session=${sessionId}`,
          is_test: isTestOrder
        });
      } else {
        // Use standard domestic order confirmation template
        emailData = buildOrderConfirmationEmail({
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
      }

      await sendViaResend({
        to: customerEmail,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text
      });
      console.log(`[Webhook] Customer email sent to ${customerEmail} (${isInternationalOrder ? 'International' : 'Domestic'})`);
    } catch (emailErr) {
      console.error('[Webhook] Failed to send customer email:', emailErr);
    }

    // Team notification emails (send to each BCC address individually)
    for (const teamEmail of bccList) {
      try {
        const testBadge = isTestOrder ? ' [TEST]' : '';
        const intlBadge = isInternationalOrder ? ' 🌍 INTERNATIONAL' : '';
        const teamSubject = `New Order #${invoiceNumber}${testBadge}${intlBadge} – ${customerName || customerEmail}`;

        let teamHtml;
        if (isInternationalOrder && awaitingShippingQuote) {
          // Use international internal notification template
          teamHtml = buildInternationalInternalNotificationHTML({
            invoiceNumber,
            customerName: contactName || customerName || customerEmail,
            customerEmail,
            customerPhone,
            orderDate,
            sessionId,
            units: units,
            unitPrice: unitUsd,
            tierLabel: tierLabelText,
            lineTotal: lineTotal,
            subtotalCents,
            taxCents,
            totalCents,
            orderType: orderType,
            shippingAddress: {
              name: shippingAddress.name || contactName || customerName || '',
              line1: shippingAddress.line1 || '',
              line2: shippingAddress.line2 || '',
              city: shippingAddress.city || '',
              state: shippingAddress.state || '',
              postal_code: shippingAddress.postal_code || '',
              country: shippingAddress.country || 'International',
              phone: customerPhone
            },
            billingAddress,
            businessName: session.metadata?.business_name || customerName || '',
            taxId: session.metadata?.tax_id || ''
          });
        } else {
          // Use standard domestic internal notification template
          teamHtml = buildInternalNotificationHTML({
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
            metaSummary,
            shippingMethod,
            shippingAddress,
            billingAddress,
            isTest: isTestOrder
          });
        }

        await sendViaResend({
          to: teamEmail,
          subject: teamSubject,
          html: teamHtml
        });
        console.log(`[Webhook] Team email sent to ${teamEmail} (${isInternationalOrder ? 'International' : 'Domestic'})`);

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
