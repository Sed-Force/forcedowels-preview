// /api/stripe-webhook.js
// Node 22 / Vercel Edge-Compatible serverless function

import Stripe from 'stripe';
// Uses your existing template + DB helpers if you added them earlier.
// If you haven't, it's still safe because the kill-switch will return before they run.
import { buildOrderConfirmationEmail } from './_lib/email/orderConfirmation.js';
import { ensureCounterTable, nextCounter } from './_lib/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

// ---------- small helpers ----------
function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// ---------- main handler ----------
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  // Verify Stripe signature
  let event;
  try {
    const raw = await readRaw(req);
    const sig = req.headers['stripe-signature'];
    const whsec = process.env.STRIPE_WEBHOOK_SECRET || '';
    event = whsec
      ? stripe.webhooks.constructEvent(raw, sig, whsec)
      : JSON.parse(raw.toString('utf8')); // local/testing fallback
  } catch (e) {
    console.error('webhook signature/parse error:', e);
    return json(res, 400, { error: 'invalid_webhook', detail: String(e.message || e) });
  }

  if (event.type !== 'checkout.session.completed') {
    // Acknowledge other events quietly
    return json(res, 200, { received: true, ignored: event.type });
  }

  const session = event.data.object;

  // ============================================
  // STEP 2 — KILL-SWITCH (approx line ~85)
  // ============================================
  if (process.env.ORDER_EMAILS_DISABLED === '1') {
    console.log('[webhook] order emails disabled via env; acknowledging only', {
      session_id: session.id,
      livemode: session.livemode
    });
    return json(res, 200, { received: true, email_sent: false, reason: 'disabled_by_env' });
  }
  // ============================================

  // ---------- normal path (runs only when kill-switch is OFF) ----------
  try {
    // (A) pull line items (optional; helps compute units)
    let lineItems = null;
    try {
      lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 50 });
    } catch (e) {
      console.warn('listLineItems failed:', e.message);
    }

    // (B) compute units (metadata first, else parse "…, 5,000 units" from description)
    let units = Number(session?.metadata?.units || 0);
    if (!units && lineItems?.data?.[0]?.description) {
      const m = lineItems.data[0].description.match(/(\d[\d,]*)\s*units/i);
      if (m) units = Number(m[1].replace(/,/g, ''));
    }

    // (C) human order number using your Neon helper (safe if helper exists)
    await ensureCounterTable();
    const key = process.env.KV_ORDER_COUNTER_KEY || 'order_seq_preview';
    const seq = await nextCounter(key);
    const pad = Math.max(1, Number(process.env.KV_ORDER_PAD || 2)); // 2 -> 01, 4 -> 0001
    const prefix = (process.env.ORDER_PREFIX || '').trim();        // e.g., "FD-"
    const humanOrderNo = seq ? `${prefix}${String(seq).padStart(pad, '0')}` : session.id;

    // (D) totals & address
    const total = Number(session.amount_total || 0) / 100;
    const subtotal = Number(session.amount_subtotal || 0) / 100;
    const shipping = Number(session.shipping_cost?.amount_total || 0) / 100;
    const tax = Number(
      session.total_details?.amount_tax || (total - subtotal - shipping)
    ) / 100;
    const unitUSD = units ? total / units : 0;

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const toEmail = session?.customer_details?.email || '';
    const name = session?.customer_details?.name || 'Customer';

    // (E) build email payload for your existing template
    const payload = {
      customer_name: name,
      order_number: humanOrderNo,
      order_date: new Date().toLocaleDateString(),
      units,
      unit_usd: unitUSD.toFixed(4),
      tier_label: session?.metadata?.tier_label || '',
      line_total: total.toFixed(2),
      subtotal: subtotal.toFixed(2),
      shipping: shipping.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      ship_name: name,
      ship_address1: session?.customer_details?.address?.line1 || '',
      ship_address2: session?.customer_details?.address?.line2 || '',
      ship_city: session?.customer_details?.address?.city || '',
      ship_state: session?.customer_details?.address?.state || '',
      ship_postal: session?.customer_details?.address?.postal_code || '',
      ship_country: session?.customer_details?.address?.country || '',
      order_url: baseUrl
        ? `${baseUrl}/order-success.html?session_id=${encodeURIComponent(session.id)}`
        : '',
      is_test: !session.livemode,
      absolute_logo_url: baseUrl ? `${baseUrl}/images/force-dowel-logo.jpg?v=8` : undefined
    };

    const { subject, text, html } = buildOrderConfirmationEmail(payload);

    // (F) send via Resend
    const sent = await sendWithResend({
      to: toEmail || process.env.CONTACT_FALLBACK_TO || 'info@forcedowels.com',
      subject,
      text,
      html,
      headers: { 'X-Order-No': humanOrderNo, 'X-Stripe-Session': session.id }
    });

    console.log('[webhook] email result', { sent, to: toEmail, order_no: humanOrderNo });
    return json(res, 200, { received: true, email_sent: !!sent, order_no: humanOrderNo });
  } catch (e) {
    console.error('[webhook] handler error:', e);
    // Acknowledge to stop retries; inspect logs if needed
    return json(res, 200, { received: true, error: String(e) });
  }
}

// ---------- resend helper ----------
async function sendWithResend({ to, subject, text, html, headers }) {
  try {
    const apiKey = process.env.RESEND_API_KEY || '';
    if (!apiKey) { console.error('Missing RESEND_API_KEY'); return false; }

    // Use the same from you verified in Resend (contact form sender is fine too)
    const from = process.env.CONFIRMATION_FROM_EMAIL || 'Force Dowels <orders@forcedowels.com>';

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html,
        reply_to: 'info@forcedowels.com',
        headers
      })
    });

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('Resend failed', r.status, body);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Resend error', e);
    return false;
  }
}
