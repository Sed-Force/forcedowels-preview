// /api/stripe-webhook.js
// Listens for checkout.session.completed and emails the customer.
// - Verifies Stripe signature with raw body.
// - Separates Subtotal vs Shipping.
// - Sends email via Resend (preferred) or SendGrid (fallback).

export const config = { runtime: 'nodejs' };

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? require('stripe')(stripeSecret) : null;

const RESEND_API_KEY   = process.env.RESEND_API_KEY;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM       = process.env.EMAIL_FROM || 'orders@forcedowels.com';
const EMAIL_BCC        = process.env.EMAIL_BCC || ''; // optional internal copy

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

const toStr = (v) => (v ?? '').toString().trim();

function formatMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  });
}

// Recompute exact bulk cents (mirrors /api/checkout.js)
const BULK_MIN = 5000;
function unitPriceMillsFor(units) {
  if (units >= 160000) return 63;   // 0.063 * 1000
  if (units >= 20000)  return 67.5; // 0.0675 * 1000
  return 72;                        // 0.072 * 1000
}
function bulkTotalCents(units) {
  if (!Number.isFinite(units) || units < BULK_MIN) return 0;
  const mills = unitPriceMillsFor(units);
  return Math.round((units * mills) / 10); // mills->cents
}

function tierLabel(units) {
  if (units >= 160000) return '>160,000–960,000';
  if (units >= 20000)  return '>20,000–160,000';
  return '5,000–20,000';
}

// Internal notification email for Force Dowels team
function buildInternalNotificationHTML({ invoiceNumber, orderId, customerName, customerEmail, orderDate, sessionId, items, subtotalCents, shippingCents, taxCents, totalCents, metaSummary, shippingMethod, shippingAddress, billingAddress }) {
  const { bulkUnits = 0, kits = 0 } = metaSummary || {};

  // Build order items table rows
  let itemRows = '';
  if (bulkUnits > 0) {
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
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;width:120px;"><strong>Invoice #:</strong></td>
                  <td style="padding:8px 0;color:#1C4A99;font-size:18px;font-weight:700;">${invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;width:120px;"><strong>Name:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${customerName || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Email:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${customerEmail || 'N/A'}</td>
                </tr>
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
                ${customerEmail || ''}<br>
                ${shippingAddress.phone || customerPhone || ''}<br>
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
                ${billingAddress.line1 || ''},<br>
                ${billingAddress.line2 ? `${billingAddress.line2}<br>` : ''}
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

// Customer-facing email
function buildEmailHTML({ invoiceNumber, orderId, email, items, subtotalCents, shippingCents, totalCents, metaSummary, shippingMethod }) {
  const { bulkUnits = 0, kits = 0 } = metaSummary || {};
  let bulkLine = '';
  if (bulkUnits > 0) {
    const unitCentsExact = bulkTotalCents(bulkUnits) / bulkUnits;
    bulkLine = `
      <tr>
        <td style="padding:8px 0;">Force Dowels — Bulk<br>
          <span style="color:#6b7280;">${bulkUnits.toLocaleString()} units • Tier ${tierLabel(bulkUnits)} • ${unitCentsExact.toFixed(4)} $/unit</span>
        </td>
        <td style="text-align:right; padding:8px 0;">${formatMoney(bulkTotalCents(bulkUnits))}</td>
      </tr>`;
  }

  let kitsLine = '';
  if (kits > 0) {
    kitsLine = `
      <tr>
        <td style="padding:8px 0;">Force Dowels — Starter Kit (300)<br>
          <span style="color:#6b7280;">${kits} × $36.00</span>
        </td>
        <td style="text-align:right; padding:8px 0;">${formatMoney(kits * 3600)}</td>
      </tr>`;
  }

  // Build shipping line with method details if available
  let shippingLabel = 'Shipping';
  if (shippingMethod) {
    shippingLabel = `Shipping<br><span style="color:#6b7280;">${shippingMethod}</span>`;
  }

  const shippingLine = `
    <tr>
      <td style="padding:8px 0;">${shippingLabel}</td>
      <td style="text-align:right; padding:8px 0;">${formatMoney(shippingCents)}</td>
    </tr>`;

  const rowsHTML = `${bulkLine}${kitsLine}`;

  return `
  <div style="font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; max-width:640px; margin:0 auto; padding:24px;">
    <h2 style="margin:0 0 6px 0;">Thanks for your order!</h2>
    <p style="margin:0 0 16px 0; color:#6b7280;">We've received your payment and are getting things ready.</p>

    <table role="presentation" style="width:100%; border-collapse:collapse; margin-top:8px;">
      <tr>
        <td style="padding:6px 0; color:#6b7280;">Invoice #:</td>
        <td style="padding:6px 0; text-align:right;"><strong>${invoiceNumber}</strong></td>
      </tr>
      <tr>
        <td style="padding:6px 0; color:#6b7280;">Order:</td>
        <td style="padding:6px 0; text-align:right;"><strong>${orderId}</strong></td>
      </tr>
      <tr>
        <td style="padding:6px 0; color:#6b7280;">Status:</td>
        <td style="padding:6px 0; text-align:right;"><strong>Paid</strong></td>
      </tr>
      <tr>
        <td style="padding:6px 0; color:#6b7280;">Amount:</td>
        <td style="padding:6px 0; text-align:right;"><strong>${formatMoney(totalCents)}</strong></td>
      </tr>
      <tr>
        <td style="padding:6px 0; color:#6b7280;">Email:</td>
        <td style="padding:6px 0; text-align:right;"><strong>${email || '—'}</strong></td>
      </tr>
    </table>

    <hr style="border:none; border-top:1px solid #e5e7eb; margin:16px 0;">

    <h3 style="margin:0 0 8px 0;">Order Details</h3>
    <table role="presentation" style="width:100%; border-collapse:collapse;">
      ${rowsHTML || '<tr><td style="color:#6b7280; padding:8px 0;">No items found</td><td></td></tr>'}
      <tr>
        <td style="padding-top:10px; border-top:1px solid #e5e7eb; color:#6b7280;">Subtotal</td>
        <td style="padding-top:10px; border-top:1px solid #e5e7eb; text-align:right;">${formatMoney(subtotalCents)}</td>
      </tr>
      ${shippingLine}
      <tr>
        <td style="padding-top:10px; border-top:1px solid #e5e7eb;"><strong>Total</strong></td>
        <td style="padding-top:10px; border-top:1px solid #e5e7eb; text-align:right;"><strong>${formatMoney(totalCents)}</strong></td>
      </tr>
    </table>

    <p style="margin-top:18px; color:#6b7280;">If you have any questions, reply to this email.</p>
  </div>`;
}

// Resend (no SDK) — simple fetch
async function sendViaResend({ to, subject, html }) {
  if (!RESEND_API_KEY) return { ok: false, reason: 'missing_resend_key' };
  const payload = { from: EMAIL_FROM, to: Array.isArray(to) ? to : [to], subject, html };
  // Note: BCC removed - internal notifications are sent separately

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const txt = await r.text();
  return { ok: r.ok, status: r.status, body: txt };
}

// SendGrid (no SDK)
async function sendViaSendgrid({ to, subject, html }) {
  if (!SENDGRID_API_KEY) return { ok: false, reason: 'missing_sendgrid_key' };
  const body = {
    personalizations: [{ to: [{ email: to }] }],
    // Note: BCC removed - internal notifications are sent separately
    from: { email: EMAIL_FROM, name: 'Force Dowels' },
    subject,
    content: [{ type: 'text/html', value: html }],
  };
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status, body: await r.text() };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return asJSON(res, 405, { error: 'Method not allowed' });
  if (!stripe) return asJSON(res, 500, { error: 'Stripe not configured (missing STRIPE_SECRET_KEY).' });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return asJSON(res, 500, { error: 'Missing STRIPE_WEBHOOK_SECRET' });

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

    // Total from session; subtotal as total - shipping
    const totalCents = Number(session.amount_total || 0);
    const subtotalCents = Math.max(0, totalCents - (shippingCents || 0));

    // Rehydrate our bulk/kits counts from metadata.summary, if present
    let metaSummary = {};
    try { metaSummary = JSON.parse(session.metadata?.summary || '{}'); } catch {}

    // Extract shipping method from metadata
    const shipCarrier = session.metadata?.ship_carrier || '';
    const shipService = session.metadata?.ship_service || '';
    const shippingMethod = [shipCarrier, shipService].filter(Boolean).join(' ');

    // Extract customer and address information
    const customerName = session.customer_details?.name || session.shipping?.name || '';
    const customerEmail = session.customer_details?.email || session.customer_email || '';
    const customerPhone = session.customer_details?.phone || session.shipping?.phone || '';
    let shippingAddress = session.shipping?.address || session.customer_details?.address || {};

    // Fallback to metadata if Stripe didn't collect address
    if (!shippingAddress?.line1 && session.metadata?.ship_address) {
      try {
        const metaAddress = JSON.parse(session.metadata.ship_address);
        shippingAddress = {
          line1: metaAddress.line1 || '',
          line2: metaAddress.line2 || '',
          city: metaAddress.city || '',
          state: metaAddress.state || '',
          postal_code: metaAddress.postal_code || '',
          country: metaAddress.country || ''
        };
      } catch (e) {
        console.error('Failed to parse shipping address from metadata:', e);
      }
    }

    const billingAddress = session.customer_details?.address || {};
    const taxCents = Number(session.total_details?.amount_tax || 0);

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

    // Generate sequential invoice number
    const counterKey = process.env.VERCEL_ENV === 'production' ? 'invoice_prod' : 'invoice_preview';
    let invoiceNumber = 0;
    try {
      // Dynamic import to avoid module loading issues
      const { nextCounter } = await import('./_lib/db.js');
      invoiceNumber = await nextCounter(counterKey);
    } catch (err) {
      console.error('Failed to generate invoice number:', err);
      // Fallback to timestamp-based number if DB fails
      invoiceNumber = Math.floor(Date.now() / 1000);
    }

    // Update Stripe session metadata with invoice number
    try {
      await stripe.checkout.sessions.update(sessionId, {
        metadata: {
          ...session.metadata,
          invoice_number: String(invoiceNumber)
        }
      });
    } catch (err) {
      console.error('Failed to update Stripe metadata with invoice number:', err);
    }

    // Save order to database
    try {
      const { sql } = await import('./_lib/db.js');
      if (sql) {
        // Build items summary
        const { bulkUnits = 0, kits = 0 } = metaSummary;
        let itemsSummary = '';
        let quantity = 0;
        if (bulkUnits > 0) {
          const tier = bulkUnits >= 165000 ? '165,000+' : bulkUnits >= 25000 ? '25,000-164,999' : '5,000-24,999';
          itemsSummary = `${tier} (${bulkUnits}) (Qty: ${bulkUnits})`;
          quantity = bulkUnits;
        } else if (kits > 0) {
          const totalUnits = kits * 300;
          itemsSummary = `Kit - 300 units (${totalUnits}) (Qty: ${totalUnits})`;
          quantity = totalUnits;
        }

        // Add phone column if it doesn't exist
        try {
          await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT`;
        } catch (e) {
          // Column may already exist, ignore
        }

        // Add address columns if they don't exist
        try {
          await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT`;
          await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_address TEXT`;
        } catch (e) {
          // Columns may already exist, ignore
        }

        // Format addresses as strings
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

        const shippingAddressStr = formatAddress(shippingAddress);
        const billingAddressStr = formatAddress(billingAddress);

        // Try to insert with all columns including addresses
        try {
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
              ${shipCarrier},
              ${sessionId},
              ${shippingAddressStr},
              ${billingAddressStr}
            )
          `;
          console.log(`[Webhook] Saved order #${invoiceNumber} to database with addresses`);
        } catch (insertErr) {
          // If columns don't exist, try without address and phone columns
          console.log('[Webhook] Failed to insert with new columns, trying legacy insert:', insertErr.message);
          await sql`
            INSERT INTO orders (
              invoice_number,
              customer_name,
              customer_email,
              items_summary,
              shipping_method,
              quantity,
              status,
              order_date,
              amount_cents,
              tracking_number,
              carrier,
              session_id
            ) VALUES (
              ${invoiceNumber},
              ${customerName},
              ${customerEmail},
              ${itemsSummary},
              ${shippingMethod},
              ${quantity},
              'pending',
              CURRENT_DATE,
              ${totalCents},
              '',
              ${shipCarrier},
              ${sessionId}
            )
          `;
          console.log(`[Webhook] Saved order #${invoiceNumber} to database (legacy format)`);
        }
      }
    } catch (err) {
      console.error('Failed to save order to database:', err);
      // Don't fail the webhook if database save fails
    }

    // Build + send email
    const shortId = `#${sessionId.slice(-8)}`;
    const subject = `Force Dowels Order ${shortId}`;
    const html = buildEmailHTML({
      invoiceNumber,
      orderId: shortId,
      email: customerEmail,
      items: lineItems,
      subtotalCents,
      shippingCents,
      totalCents,
      metaSummary,
      shippingMethod
    });

    // Send email to customer
    let sent = { ok: false };
    if (RESEND_API_KEY) {
      sent = await sendViaResend({ to: customerEmail || EMAIL_BCC || EMAIL_FROM, subject, html });
    } else if (SENDGRID_API_KEY) {
      sent = await sendViaSendgrid({ to: customerEmail || EMAIL_BCC || EMAIL_FROM, subject, html });
    } else {
      console.warn('No RESEND_API_KEY or SENDGRID_API_KEY set — skipping email send');
      sent = { ok: true, skipped: 'no_email_provider' };
    }

    if (!sent.ok) {
      console.error('Email send failed:', sent);
      // Still ack webhook (don’t retry forever); you can watch logs if needed.
      return asJSON(res, 200, { received: true, email: 'failed', detail: sent });
    }

    // Send internal notification to Force Dowels with different template
    if (EMAIL_BCC) {
      const internalSubject = `New Order Received - Invoice #${invoiceNumber}`;
      const internalHtml = buildInternalNotificationHTML({
        invoiceNumber,
        orderId: shortId,
        customerName,
        customerEmail,
        orderDate,
        sessionId,
        items: lineItems,
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        metaSummary,
        shippingMethod,
        shippingAddress,
        billingAddress
      });

      // Split EMAIL_BCC into array of email addresses
      const bccEmails = EMAIL_BCC.split(',').map(e => e.trim()).filter(Boolean);

      if (RESEND_API_KEY) {
        // Send to each BCC email individually for better deliverability
        for (const email of bccEmails) {
          try {
            await sendViaResend({ to: email, subject: internalSubject, html: internalHtml });
            console.log(`[Webhook] Sent internal notification to ${email}`);
          } catch (err) {
            console.error(`[Webhook] Failed to send internal notification to ${email}:`, err);
          }
        }
      } else if (SENDGRID_API_KEY) {
        // Send to each BCC email individually for better deliverability
        for (const email of bccEmails) {
          try {
            await sendViaSendgrid({ to: email, subject: internalSubject, html: internalHtml });
            console.log(`[Webhook] Sent internal notification to ${email}`);
          } catch (err) {
            console.error(`[Webhook] Failed to send internal notification to ${email}:`, err);
          }
        }
      }
    }

    return asJSON(res, 200, { received: true, email: 'sent' });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return asJSON(res, 200, { received: true, error: 'handler_error', message: toStr(err?.message || err) });
  }
}
