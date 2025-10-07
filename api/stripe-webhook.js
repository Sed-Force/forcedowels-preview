// /api/stripe-webhook.js
// Sends a receipt that SEPARATES Subtotal and Shipping after a successful Checkout.
// Requires env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY,
// ORDER_EMAIL_FROM (e.g. "Force Dowels <orders@forcedowels.com>"), optional ORDER_EMAIL_BCC,
// optional BRAND_LOGO_URL

export const config = { runtime: 'nodejs' };

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const asJSON = (res, code, obj) => {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj, null, 2));
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const fmt = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default async function handler(req, res) {
  if (req.method !== 'POST') return asJSON(res, 405, { error: 'Method not allowed' });

  const sig = req.headers['stripe-signature'];
  if (!sig) return asJSON(res, 400, { error: 'Missing stripe-signature header' });

  let event;
  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(
      raw,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    console.error('Webhook signature error:', e.message);
    return asJSON(res, 400, { error: 'Invalid signature' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const sessionId = event.data.object.id;

      // Re-fetch with line items so we can split Subtotal vs Shipping
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items.data.price.product'],
      });

      const email =
        session.customer_details?.email ||
        session.customer_email ||
        null;

      // Compute shipping from a dedicated "Shipping" line or from metadata fallback
      const items = session.line_items?.data || [];
      let shippingCents = 0;
      for (const li of items) {
        const name =
          li.description ||
          li.price?.product?.name ||
          '';
        if (/shipping/i.test(name) || /^shipping/i.test(name)) {
          shippingCents += Number(li.amount_total || 0);
        }
      }
      if (shippingCents === 0 && session.metadata?.ship_amount_cents) {
        shippingCents = Number(session.metadata.ship_amount_cents) || 0;
      }

      const totalCents = Number(session.amount_total || 0);
      const subtotalCents = Math.max(0, totalCents - shippingCents);
      const taxCents = Number(session.total_details?.amount_tax || 0);

      // Compose email
      const html = `
        <div style="font-family:Inter,system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#e6edf3;background:#0b1623;padding:24px;border-radius:14px">
          <div style="text-align:center;margin-bottom:16px;">
            <img src="${process.env.BRAND_LOGO_URL || 'https://forcedowels.com/images/force-dowel-logo.jpg'}" alt="Force Dowels" height="40" />
          </div>
          <h2 style="margin:0 0 8px 0;color:#fff;">Order confirmed</h2>
          <p style="margin:0 0 16px 0;color:#b7c2cf;">Thanks for your purchase! Your payment was received and your order is confirmed.</p>

          <div style="background:#0f2033;border:1px solid #1c3551;border-radius:10px;padding:16px;">
            <div style="display:flex;justify-content:space-between;margin:6px 0;color:#b7c2cf">
              <span>Subtotal</span><strong style="color:#fff">${fmt(subtotalCents)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin:6px 0;color:#b7c2cf">
              <span>Shipping</span><strong style="color:#fff">${fmt(shippingCents)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin:6px 0;color:#b7c2cf">
              <span>Tax</span><strong style="color:#fff">${fmt(taxCents)}</strong>
            </div>
            <hr style="border:none;border-top:1px solid #1c3551;margin:10px 0" />
            <div style="display:flex;justify-content:space-between;margin:6px 0;color:#b7c2cf">
              <span>Total</span><strong style="color:#fff">${fmt(totalCents)}</strong>
            </div>
          </div>

          <p style="margin:16px 0 0 0;color:#99a6b5;font-size:14px;">
            We'll email you tracking details when your order ships. Questions?
            <a style="color:#ffd166" href="mailto:info@forcedowels.com">info@forcedowels.com</a>
          </p>
        </div>
      `;

      if (email && process.env.RESEND_API_KEY && process.env.ORDER_EMAIL_FROM) {
        await resend.emails.send({
          from: process.env.ORDER_EMAIL_FROM,
          to: email,
          bcc: process.env.ORDER_EMAIL_BCC || undefined,
          subject: 'Your Force Dowels order is confirmed',
          html,
        });
      } else {
        console.warn('Email not sent (missing email or RESEND envs).');
      }
    }

    // Respond 200 for all handled events
    return asJSON(res, 200, { received: true });
  } catch (e) {
    console.error('stripe-webhook error:', e);
    return asJSON(res, 500, { error: 'webhook_failed', detail: e.message });
  }
}
