// /api/stripe-webhook.js
import Stripe from 'stripe';
import { buildOrderConfirmationEmail } from './_lib/email/orderConfirmation.js';
import { applyCORS, json } from './_lib/auth.js';

// ---- ENV (Preview/Test) ----
// STRIPE_SECRET_KEY = sk_test_... (already set)
// STRIPE_WEBHOOK_SECRET = whsec_... (TEST mode signing secret)
// RESEND_API_KEY = re_... (Resend API key)
// CONFIRMATION_FROM_EMAIL = "Force Dowels <orders@forcedowels.com>"  (or your verified sender)
// NEXT_PUBLIC_BASE_URL = https://your-preview.vercel.app

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const whSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  const sig = req.headers['stripe-signature'];

  let event;
  let buf;

  try {
    buf = await readRaw(req); // IMPORTANT: raw body for signature verification
    if (whSecret) {
      event = stripe.webhooks.constructEvent(buf, sig, whSecret);
    } else {
      // Fallback (not recommended): accept unverified in test
      event = JSON.parse(buf.toString('utf8'));
    }
  } catch (err) {
    return json(res, 400, { error: 'Invalid webhook', detail: err.message });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      // Pull line items (to recover units if metadata missing)
      let lineItems = null;
      try {
        lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 50 });
      } catch {}

      // Derive values
      const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
      const toEmail = session?.customer_details?.email || '';
      const customerName = session?.customer_details?.name || 'Customer';

      // Units: prefer metadata, else parse from line item description: "Force Dowels — 5,000 units"
      let units =
        Number(session?.metadata?.units) ||
        Number(extractUnitsFromLineItems(lineItems)) ||
        0;

      const totalCents = Number(session?.amount_total || 0);
      const subtotalCents = Number(session?.amount_subtotal || 0);
      const shippingCents =
        Number(session?.shipping_cost?.amount_total || 0);
      const taxCents =
        Number(session?.total_details?.amount_tax || (totalCents - subtotalCents - shippingCents));

      const unitUSD =
        units > 0 ? (totalCents / 100 / units) : 0;

      const orderUrl = baseUrl
        ? `${baseUrl}/order-success.html?session_id=${encodeURIComponent(session.id)}`
        : '';

      const addr = session?.customer_details?.address || {};
      const payload = {
        customer_name: customerName,
        order_number: session.id,
        order_date: new Date().toLocaleDateString(),
        units,
        unit_usd: unitUSD.toFixed(4),
        tier_label: session?.metadata?.tier_label || '',
        line_total: (totalCents / 100).toFixed(2),
        subtotal: (subtotalCents / 100).toFixed(2),
        shipping: (shippingCents / 100).toFixed(2),
        tax: (taxCents / 100).toFixed(2),
        total: (totalCents / 100).toFixed(2),
        ship_name: customerName,
        ship_address1: addr.line1 || '',
        ship_address2: addr.line2 || '',
        ship_city: addr.city || '',
        ship_state: addr.state || '',
        ship_postal: addr.postal_code || '',
        ship_country: addr.country || '',
        order_url: orderUrl,
        is_test: !session.livemode,
        // absolute_logo_url will default using NEXT_PUBLIC_BASE_URL in the template
      };

      const { subject, text, html } = buildOrderConfirmationEmail(payload);

      // Send email via Resend
      const ok = await sendWithResend({
        to: toEmail,
        subject,
        text,
        html,
        headers: { 'X-Entity-Ref-ID': session.id }
      });

      if (!ok) {
        // Email failed, but we still ack the webhook so Stripe doesn't retry forever
        return json(res, 200, { received: true, email: 'failed' });
      }

      return json(res, 200, { received: true, email: 'sent' });
    } catch (err) {
      // Acknowledge to prevent endless retries; log the error body for debugging
      console.error('webhook error:', err);
      return json(res, 200, { received: true, error: 'processing_failed' });
    }
  }

  // Ack all other event types
  return json(res, 200, { received: true });
}

// --- helpers ---

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function extractUnitsFromLineItems(list) {
  if (!list?.data?.length) return 0;
  // Try the first item: description like "Force Dowels — 5,000 units"
  const d = list.data[0];
  const s = d?.description || '';
  const m = s.match(/(\d[\d,]*)\s*units/i);
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

async function sendWithResend({ to, subject, text, html, headers }) {
  try {
    const apiKey = process.env.RESEND_API_KEY || '';
    if (!apiKey) return false;

    const from = process.env.CONFIRMATION_FROM_EMAIL || 'Force Dowels <orders@forcedowels.com>';
    const replyTo = 'info@forcedowels.com'; // per your preference

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html,
        reply_to: replyTo,
        headers
      })
    });

    return resp.ok;
  } catch (e) {
    console.error('Resend error:', e);
    return false;
  }
}
