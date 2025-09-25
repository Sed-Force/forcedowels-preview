// /api/stripe-webhook.js
// Sends order confirmation via Resend with a big logo aligned to the top-right corner (email-safe tables).

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

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

    // Absolute logo URL
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const logoUrl =
      process.env.NEXT_PUBLIC_LOGO_URL
      || (baseUrl ? `${baseUrl}/images/force-dowel-logo.jpg` : '')
      || 'https://forcedowels.com/images/force-dowel-logo.jpg';

    // 2x size (adjust via EMAIL_LOGO_WIDTH env if needed)
    const logoW = Number(process.env.EMAIL_LOGO_WIDTH || 240);

    // Recipient & totals
    const toEmail = session?.customer_details?.email || process.env.CONTACT_FALLBACK_TO || 'info@forcedowels.com';
    const name = session?.customer_details?.name || 'Customer';
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
Questions? Email info@forcedowels.com.

— Force Dowels`;

    // EMAIL-SAFE HEADER: left text + right-aligned logo with fixed cell width.
    const html = `
  <div style="font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0b1220;color:#e5e7eb;border-radius:12px">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse">
      <tr>
        <td style="font-weight:700;font-size:18px;padding:0 0 6px 0;text-align:left;">
          Order confirmed
        </td>
        <td width="${logoW}" align="right" valign="top" style="padding:0;">
          <table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;">
            <tr>
              <td style="padding:0;">
                <img
                  src="${logoUrl}"
                  alt="Force Dowels"
                  width="${logoW}"
                  style="display:block;border:0;outline:none;text-decoration:none;height:auto;border-radius:999px;"
                >
              </td>
            </tr>
          </table>
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

    const ok = await sendWithResend({ to: toEmail, subject, text, html });
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
