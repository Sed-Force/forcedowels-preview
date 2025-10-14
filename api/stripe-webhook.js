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

function buildEmailHTML({ orderId, email, items, subtotalCents, shippingCents, totalCents, metaSummary, shippingMethod }) {
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
  if (EMAIL_BCC) payload.bcc = [EMAIL_BCC];

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
    personalizations: [{ to: [{ email: to }], ...(EMAIL_BCC ? { bcc: [{ email: EMAIL_BCC }] } : {}) }],
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

    // Build + send email
    const shortId = `#${sessionId.slice(-8)}`;
    const subject = `Force Dowels Order ${shortId}`;
    const html = buildEmailHTML({
      orderId: shortId,
      email: customerEmail,
      items: lineItems,
      subtotalCents,
      shippingCents,
      totalCents,
      metaSummary,
      shippingMethod
    });

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

    return asJSON(res, 200, { received: true, email: 'sent' });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return asJSON(res, 200, { received: true, error: 'handler_error', message: toStr(err?.message || err) });
  }
}
