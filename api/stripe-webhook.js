// /api/stripe-webhook.js
import Stripe from 'stripe';
import { buildOrderConfirmationEmail } from './_lib/email/orderConfirmation.js';
import { applyCORS, json } from './_lib/auth.js';
import { nextOrderNumberDB } from './_lib/db.js'; // Neon fallback

// Stripe (TEST or LIVE; taken from env)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  // --- Verify Stripe signature (raw body required) ---
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const raw = await readRaw(req);
    event = whSecret
      ? stripe.webhooks.constructEvent(raw, sig, whSecret)
      : JSON.parse(raw.toString('utf8')); // fallback for local/test if no secret
  } catch (err) {
    return json(res, 400, { error: 'Invalid webhook', detail: err.message });
  }

  // --- Handle checkout completed ---
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      // Get line items (helps compute units if metadata is missing)
      let lineItems = null;
      try {
        lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 50 });
      } catch (e) {
        // non-fatal
      }

      const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
      const toEmail = session?.customer_details?.email || '';
      const customerName = session?.customer_details?.name || 'Customer';

      // Units: prefer metadata, else parse from description "..., 5,000 units"
      let units =
        Number(session?.metadata?.units) ||
        Number(extractUnitsFromLineItems(lineItems)) ||
        0;

      const totalCents = Number(session?.amount_total || 0);
      const subtotalCents = Number(session?.amount_subtotal || 0);
      const shippingCents = Number(session?.shipping_cost?.amount_total || 0);
      const taxCents =
        Number(session?.total_details?.amount_tax || (totalCents - subtotalCents - shippingCents));
      const unitUSD = units > 0 ? totalCents / 100 / units : 0;

      // -------- Human Order # (DB-backed; tries KV/Upstash first) --------
      const seq = await nextOrderNumber(); // -> 1,2,3...
      const pad = Math.max(1, Number(process.env.KV_ORDER_PAD || 2)); // 2 => 01, 4 => 0001
      const prefix = (process.env.ORDER_PREFIX || '').trim(); // e.g., "FD-"
      const humanOrderNo = seq ? `${prefix}${String(seq).padStart(pad, '0')}` : session.id;

      // Address (may be null)
      const addr = session?.customer_details?.address || {};

      // Build payload for email template
      const payload = {
        customer_name: customerName,
        order_number: humanOrderNo,
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
        order_url: baseUrl
          ? `${baseUrl}/order-success.html?session_id=${encodeURIComponent(session.id)}`
          : '',
        is_test: !session.livemode,
        absolute_logo_url: baseUrl ? `${baseUrl}/images/force-dowel-logo.jpg?v=8` : undefined,
      };

      const { subject, text, html } = buildOrderConfirmationEmail(payload);

      // Send via Resend
      const ok = await sendWithResend({
        to: toEmail,
        subject,
        text,
        html,
        headers: { 'X-Entity-Ref-ID': session.id, 'X-Order-No': humanOrderNo },
      });

      // Always ack to stop retries; include basic info for logs
      return json(res, 200, { received: true, email: ok ? 'sent' : 'failed', order_no: humanOrderNo });
    } catch (err) {
      console.error('webhook processing error:', err);
      // Ack so Stripe doesn’t retry forever; inspect logs if needed
      return json(res, 200, { received: true, error: 'processing_failed' });
    }
  }

  // Ack other events
  return json(res, 200, { received: true });
}

/* ----------------- helpers ----------------- */

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function extractUnitsFromLineItems(list) {
  if (!list?.data?.length) return 0;
  const d = list.data[0];
  const s = d?.description || '';
  const m = s.match(/(\d[\d,]*)\s*units/i);
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

// Tries KV/Upstash first; falls back to Neon Postgres counter
async function nextOrderNumber() {
  try {
    // KV / Upstash (optional)
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token) {
      const key = process.env.KV_ORDER_COUNTER_KEY || 'order_seq_preview';
      const resp = await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      const n = Number(data?.result || 0);
      if (n > 0) return n;
    }

    // Neon Postgres fallback
    const key = process.env.KV_ORDER_COUNTER_KEY || 'order_seq_preview';
    return await nextOrderNumberDB(key);
  } catch (e) {
    console.error('Counter error:', e);
    return 0;
  }
}

async function sendWithResend({ to, subject, text, html, headers }) {
  try {
    const apiKey = process.env.RESEND_API_KEY || '';
    if (!apiKey || !to) return false;

    const from = process.env.CONFIRMATION_FROM_EMAIL || 'Force Dowels <orders@forcedowels.com>';
    const replyTo = 'info@forcedowels.com'; // per your preference

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html,
        reply_to: replyTo,
        headers,
      }),
    });

    return resp.ok;
  } catch (e) {
    console.error('Resend error:', e);
    return false;
  }
}
