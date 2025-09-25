// /api/stripe-webhook.js
// Minimal: on checkout.session.completed, send an email via Resend with top-right logo.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function sendJSON(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'method_not_allowed' });

  // Verify Stripe signature
  let event;
  try {
    const raw = await readRaw(req);
    const sig = req.headers['stripe-signature'];
    const wh = process.env.STRIPE_WEBHOOK_SECRET || '';
    event = wh ? stripe.webhooks.constructEvent(raw, sig, wh) : JSON.parse(raw.toString('utf8'));
  } catch (e) {
    console.error('Invalid webhook:', e);
    return sendJSON(res, 400, { error: 'invalid_webhook' });
  }

  if (event.type !== 'checkout.session.completed') {
    return sendJSON(res, 200, { received: true, ignored: event.type });
  }

  try {
    const session = event.data.object;

    // === Build absolute logo URL (top-right header image) ===
    // IMPORTANT: set NEXT_PUBLIC_BASE_URL in Vercel (Preview) to your preview domain, no trailing slash.
    // Example: https://forcedowels-preview.vercel.app
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const logoUrl =
      baseUrl
        ? `${baseUrl}/images/force-dowel-logo.jpg?v=8`
        // safe fallback to live asset if preview base URL isn't set:
        : 'https://forcedowels.com/images/force-dowel-logo.jpg?v=8';

    // Who to email
    const toEmail = session?.customer_details?.email || process.env.CONTACT_FALLBACK_TO || 'info@forcedowels.com';
    const name = session?.customer_details?.name || 'Customer';

    // Totals (USD)
    const total = Number(session.amount_total || 0) / 100;
    const subtotal = Number(session.amount_subtotal || 0) / 100;
    const shipping = Number(session.shipping_cost?.amount_total || 0) / 100;
    const tax = Number(session.total_details?.amount_tax || (total - subtotal - shipping)) / 100;

    const subject = 'Your Force Dowels order is confirmed';
    const text =
`Hi ${name},

Thanks for your purchase! Your payment was received and your order is confirmed.

Summary:
Subtotal: $${subtotal.toFixed(2)}
Shipping: $${shipping.toFixed(2)}
Tax: $${tax.toFixed(2)}
Total: $${total.toFixed(2)}

We’ll email you tracking details when your order ships.
If you have questions, email info@forcedowels.com.

— Force Dowels`;

    // TOP-RIGHT LOGO: right-aligned cell with inline-styled <img>
    const html = `
  <div style="font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0b1220;color:#e5e7eb;border-radius:12px">
    <table width="100%" style="border-collapse:collapse">
      <tr>
        <td style="text-align:left;font-weight:700;font-size:18px;padding:0 0 6px 0">Order confirmed</td>
        <td style="text-align:right;padding:0 0 6px 0">
          <img src="${logoUrl}" alt="Force Dowels" width="120"
               style="display:block;border-radius:999px;max-width:140px;height:auto">
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0">Hi ${escapeHtml(name)},</p>
    <p style="margin:8px 0 16px">Thanks for your purchase! Your payment was received and your order is confirmed.</p>
    <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:16px">
      <div style="display:flex;justify-content:space-between;margin:4px 0"><span>Subtotal</span><strong>$${subtotal.toFixed(2)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin:4px 0"><span>Shipping</span><strong>$${shipping.toFixed(2)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin:4px 0"><span>Tax</span><strong>$${tax.toFixed(2)}</strong></div>
      <div style="height:1px;background:#1f2937;margin:8px 0"></div>
      <div style="display:flex;justify-content:space-between;margin:4px 0;font-size:16px"><span>Total</span><strong>$${total.toFixed(2)}</strong></div>
    </div>
    <p style="margin:16px 0 0">We’ll email you tracking details when your order ships.</p>
    <p style="margin:8px 0 16px">Questions? Email <a href="mailto:info@forcedowels.com" style="color:#60a5fa">info@forcedowels.com</a>.</p>
    <p style="font-size:12px;color:#9ca3af">If this was a test payment, this message confirms your test checkout completed.</p>
  </div>`;

    const ok = await sendWithResend({
      to: toEmail,
      subject,
      text,
      html
    });

    console.log('order email sent:', ok, 'to:', toEmail);
    return sendJSON(res, 200, { received: true, email_sent: !!ok });
  } catch (e) {
    console.error('handler error:', e);
    return sendJSON(res, 200, { received: true, email_sent: false, error: String(e) });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function sendWithResend({ to, subject, text, html }) {
  try {
    const apiKey = process.env.RESEND_API_KEY || '';
    if (!apiKey) { console.error('Missing RESEND_API_KEY'); return false; }
    const from = process.env.CONFIRMATION_FROM_EMAIL || 'Force Dowels <orders@forcedowels.com>';

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html, reply_to: 'info@forcedowels.com' })
    });
    if (!r.ok) {
      const body = await r.text().catch(()=>'');
      console.error('Resend failed', r.status, body);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Resend error:', e);
    return false;
  }
}
