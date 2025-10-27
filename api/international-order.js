// /api/international-order.js — Handles international order form submissions
import { json, applyCORS, verifyAuth } from './_lib/auth.js';
import { Resend } from 'resend';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

// ---------- Env controls ----------
const IS_PREVIEW = process.env.VERCEL_ENV === 'preview';
const SEND_MODE  = (process.env.EMAIL_SEND_MODE || 'send').toLowerCase();
const PREFIX     = process.env.EMAIL_TAG_PREFIX || (IS_PREVIEW ? '[PREVIEW] ' : '');

// Branding
const BRAND_BLUE   = process.env.EMAIL_PRIMARY_COLOR || '#1C4A99';
const SITE_BASE    = (process.env.NEXT_PUBLIC_BASE_URL || 'https://forcedowels.com').replace(/\/$/, '');
const LOGO_URL     = process.env.EMAIL_LOGO_URL || `${SITE_BASE}/images/force-dowel-logo.jpg`;
const LOGO_HEIGHT  = Number(process.env.EMAIL_LOGO_HEIGHT || 48);

// Helpers
const parseList = (v) => String(v || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const INTL_ORDER_RECIPIENTS = parseList(process.env.CONTACT_INBOX || 'info@forcedowels.com');
const WHITELIST = parseList(process.env.EMAIL_WHITELIST).map(s => s.toLowerCase());

// Resend client
const HAS_RESEND = !!process.env.RESEND_API_KEY;
const resend = HAS_RESEND ? new Resend(process.env.RESEND_API_KEY) : null;

// Map quantity selections to actual unit counts
const QUANTITY_MAP = {
  'kit-300': { units: 300, type: 'kit', label: 'Ship Kit: 300 dowels' },
  'box-5000': { units: 5000, type: 'bulk', label: 'Standard Box: 5,000 dowels' },
  'box-10000': { units: 10000, type: 'bulk', label: 'Standard Box: 10,000 dowels' },
  'box-15000': { units: 15000, type: 'bulk', label: 'Standard Box: 15,000 dowels' },
  'box-20000': { units: 20000, type: 'bulk', label: 'Standard Box: 20,000 dowels' },
  'box-25000': { units: 25000, type: 'bulk', label: 'Standard Box: 25,000 dowels' }
};

// Pricing functions (matching order page display: 5k-24,999 | 25k-164,999 | 165k+)
function unitPriceMillsFor(units) {
  if (units >= 165000) return 63;  // $0.0630 = 6.3 cents = 63 mills
  if (units >= 25000)  return 67.5;  // $0.0675 = 6.75 cents = 67.5 mills
  return 72;                       // $0.0720 = 7.2 cents = 72 mills
}

function bulkTotalCents(units) {
  if (!Number.isFinite(units) || units < 5000) return 0;
  const mills = unitPriceMillsFor(units);
  const cents = Math.round((units * mills) / 10);
  return cents;
}

function tierLabel(units) {
  if (units >= 165000) return 'Tier: 165,000–960,000';
  if (units >= 25000)  return 'Tier: 25,000–164,999';
  return 'Tier: 5,000–24,999';
}

// ---------- Handler ----------
export default async function handler(req, res) {
  if (applyCORS(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  // Body
  let body = {};
  try {
    const text = await readBody(req);
    body = text ? JSON.parse(text) : {};
  } catch {
    return json(res, 400, { error: 'Invalid JSON body' });
  }

  const {
    action, // 'request' or 'reserve'
    order_type, // 'kit' or 'bulk'
    quantity, // number of kits or units
    units, // total units
    display, // display string for email
    business_name,
    contact_name,
    email,
    phone,
    shipping_address,
    tax_id,
    comments,
    shipping_label
  } = body || {};

  // Validate required fields
  if (!action || !order_type || !quantity || !business_name || !contact_name || !email || !phone || !shipping_address || !tax_id) {
    return json(res, 400, { error: 'Missing required fields' });
  }

  if (action !== 'request' && action !== 'reserve') {
    return json(res, 400, { error: 'Invalid action. Must be "request" or "reserve"' });
  }

  // Optional identity
  let identity = null;
  try { identity = await verifyAuth(req); } catch {}

  // Sending switches / guards
  if (SEND_MODE === 'disabled') {
    return json(res, 200, { ok: true, mode: 'disabled', note: 'Email sending disabled in this environment.' });
  }
  if (!HAS_RESEND) {
    return json(res, 501, {
      error: 'Email service not configured',
      hint: 'Set RESEND_API_KEY, EMAIL_FROM (or set EMAIL_SEND_MODE=disabled)'
    });
  }
  if (!process.env.EMAIL_FROM) {
    return json(res, 501, { error: 'Missing EMAIL_FROM' });
  }
  if (IS_PREVIEW && WHITELIST.length) {
    const blocked = INTL_ORDER_RECIPIENTS.filter(to => !WHITELIST.includes(to));
    if (blocked.length) return json(res, 200, { ok: true, mode: 'skipped_by_whitelist', blocked });
  }

  // Compose email
  const subject = `${PREFIX}International Order ${action === 'reserve' ? '(Stock Reserved)' : 'Request'} - ${business_name}`;

  const html = buildEmailHtml({
    action,
    quantity_display: display || `${quantity} ${order_type === 'kit' ? 'kit(s)' : 'units'}`,
    business_name,
    contact_name,
    email,
    phone,
    shipping_address,
    tax_id,
    comments,
    identityEmail: identity?.email || null,
    identityId: identity?.userId || null,
    BRAND_BLUE,
    LOGO_URL,
    LOGO_HEIGHT
  });

  const text = [
    `International Order ${action === 'reserve' ? '(Stock Reserved)' : 'Request'}`,
    '',
    `Quantity: ${display || quantity}`,
    `Business: ${business_name}`,
    `Contact: ${contact_name}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    '',
    'Shipping Address:',
    shipping_address,
    '',
    `Tax ID: ${tax_id}`,
    comments ? `\nComments: ${comments}` : null,
    '',
    identity?.email ? `Signed-in: ${identity.email}` : null
  ].filter(Boolean).join('\n');

  // Prepare email attachments if shipping label provided
  const attachments = [];
  if (shipping_label && shipping_label.content) {
    // Extract base64 data from data URL
    const matches = shipping_label.content.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      attachments.push({
        filename: shipping_label.filename || 'shipping-label.pdf',
        content: matches[2] // base64 string without the data URL prefix
      });
    }
  }

  // Send email
  try {
    const [primary, ...bccList] = INTL_ORDER_RECIPIENTS;
    const emailPayload = {
      from: process.env.EMAIL_FROM,
      to: primary,
      bcc: bccList,
      subject,
      html,
      text,
      reply_to: email
    };

    // Add attachments if present
    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    const sent = await resend.emails.send(emailPayload);
    console.log('[International Order] Email sent:', sent?.id);

    // If action is 'reserve', create Stripe checkout session
    if (action === 'reserve') {
      try {
        // Build line items using dynamic pricing based on order type
        const line_items = [];
        const totalUnits = units || quantity;

        if (order_type === 'bulk') {
          const cents = bulkTotalCents(quantity);
          if (cents <= 0) {
            return json(res, 400, { error: 'Invalid bulk amount' });
          }
          line_items.push({
            price_data: {
              currency: 'usd',
              unit_amount: cents,
              product_data: {
                name: 'Force Dowels — Bulk (International Order)',
                description: `${tierLabel(quantity)} • ${quantity.toLocaleString()} units • Awaiting shipping quote`,
              },
            },
            quantity: 1,
          });
        } else if (order_type === 'kit') {
          line_items.push({
            price_data: {
              currency: 'usd',
              unit_amount: 3600, // $36 per kit
              product_data: {
                name: 'Force Dowels — Starter Kit (International Order)',
                description: `300 units per kit • Awaiting shipping quote`,
              },
            },
            quantity: quantity, // quantity is the number of kits
          });
        }

        const base = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
        const success_url = `${base || 'https://forcedowels.com'}/order-success.html?session_id={CHECKOUT_SESSION_ID}`;
        const cancel_url = `${base || 'https://forcedowels.com'}/order.html`;

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          line_items,
          success_url,
          cancel_url,
          customer_email: email,
          phone_number_collection: { enabled: true },
          metadata: {
            international_order: 'true',
            business_name,
            contact_name,
            phone,
            tax_id,
            quantity_selection: String(quantity),
            shipping_address,
            awaiting_shipping_quote: 'true',
            units: String(totalUnits),
            order_type: order_type
          }
        });

        return json(res, 200, {
          ok: true,
          emailSent: true,
          emailId: sent?.id || null,
          checkoutUrl: session.url,
          status: 'reserved'
        });
      } catch (stripeErr) {
        console.error('[International Order] Stripe error:', stripeErr);
        // If Stripe fails, still return success since email was sent
        // International orders can be processed manually
        return json(res, 200, {
          ok: true,
          emailSent: true,
          emailId: sent?.id || null,
          requiresManualProcessing: true,
          note: 'Request submitted successfully. Our team will contact you to complete payment and arrange shipping.'
        });
      }
    }

    // For 'request' action, just return success
    return json(res, 200, {
      ok: true,
      emailSent: true,
      emailId: sent?.id || null,
      status: 'requested'
    });

  } catch (err) {
    console.error('[International Order] Email error:', err);
    return json(res, 502, { error: 'Email send failed', detail: err?.message || String(err) });
  }
}

// ---------- Helpers ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildEmailHtml({
  action,
  quantity_display,
  business_name,
  contact_name,
  email,
  phone,
  shipping_address,
  tax_id,
  comments,
  identityEmail,
  identityId,
  BRAND_BLUE,
  LOGO_URL,
  LOGO_HEIGHT
}) {
  const esc = escapeHtml;
  const addressHtml = esc(shipping_address || '').replace(/\n/g, '<br/>');
  const commentsHtml = comments ? esc(comments).replace(/\n/g, '<br/>') : '';

  // Use the display string passed from frontend
  const quantityLabel = esc(quantity_display || 'Not specified');

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; background:#f7f7f7; padding:24px;">
    <div style="max-width:720px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">

      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="padding:16px 20px; background:${BRAND_BLUE}; color:#ffffff; font-size:18px; font-weight:700; line-height:1;">
            International Order ${action === 'reserve' ? '(Stock Reserved)' : 'Request'}
          </td>
          <td align="right" style="padding:10px 20px; background:${BRAND_BLUE};">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
              <tr>
                <td style="background:#ffffff; border:1px solid #e5e7eb; border-radius:9999px; padding:6px;">
                  <img src="${LOGO_URL}" height="${LOGO_HEIGHT}" alt="Force Dowels" style="display:block; border:0; outline:none; text-decoration:none; border-radius:9999px; height:${LOGO_HEIGHT}px; width:auto; line-height:1;">
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${action === 'reserve' ? `
      <div style="padding:16px 20px; background:#fef3c7; border-bottom:1px solid #f59e0b;">
        <p style="margin:0; font-size:14px; color:#78350f;">
          <strong>Stock Reserved:</strong> Customer has completed payment to reserve inventory while awaiting international shipping rates.
        </p>
      </div>` : ''}

      <div style="padding:16px 20px;">
        <h3 style="margin:0 0 12px 0; font-size:16px; color:${BRAND_BLUE};">Order Details</h3>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate; border-spacing:0; font-size:14px; margin-bottom:20px;">
          <tr>
            <td style="width:180px; padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Quantity</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(quantityLabel)}</td>
          </tr>
        </table>

        <h3 style="margin:0 0 12px 0; font-size:16px; color:${BRAND_BLUE};">Business &amp; Contact</h3>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate; border-spacing:0; font-size:14px; margin-bottom:20px;">
          <tr>
            <td style="width:180px; padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Business Name</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(business_name || '')}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Contact Name</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(contact_name || '')}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Email</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;"><a href="mailto:${esc(email)}" style="color:${BRAND_BLUE};">${esc(email || '')}</a></td>
          </tr>
          <tr>
            <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Phone</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(phone || '')}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Tax ID</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(tax_id || '')}</td>
          </tr>
        </table>

        <h3 style="margin:0 0 12px 0; font-size:16px; color:${BRAND_BLUE};">Shipping Address</h3>
        <div style="padding:12px; border:1px solid #e5e7eb; border-radius:8px; background:#f9fafb; margin-bottom:20px; font-size:14px;">
          ${addressHtml}
        </div>

        ${comments ? `
        <h3 style="margin:0 0 12px 0; font-size:16px; color:${BRAND_BLUE};">Additional Comments</h3>
        <div style="padding:12px; border:1px solid #e5e7eb; border-radius:8px; background:#f9fafb; margin-bottom:20px; font-size:14px;">
          ${commentsHtml}
        </div>` : ''}

        ${identityEmail || identityId ? `
        <div style="margin-top:16px; padding:10px 12px; border:1px dashed #d1d5db; border-radius:8px; background:#f9fafb;">
          <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Signed-in user</div>
          <div style="font-size:14px;">
            ${identityEmail ? `Email: ${esc(identityEmail)}<br/>` : ''}
            ${identityId ? `ID: ${esc(identityId)}` : ''}
          </div>
        </div>` : ''}

      </div>
      <div style="padding:12px 20px; color:#6b7280; font-size:12px; border-top:1px solid #e5e7eb;">
        Sent from ForceDowels.com - International Order System
      </div>
    </div>
  </div>`;
}
