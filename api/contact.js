// /api/contact.js — MASTER (brand header + logo + BCC + preview switches)
import { json, applyCORS, verifyAuth } from './_lib/auth.js';
import { Resend } from 'resend';

// ---------- Env controls ----------
const IS_PREVIEW = process.env.VERCEL_ENV === 'preview';
const SEND_MODE  = (process.env.EMAIL_SEND_MODE || 'send').toLowerCase(); // "send" | "disabled"
const PREFIX     = process.env.EMAIL_TAG_PREFIX || (IS_PREVIEW ? '[PREVIEW] ' : '');

// Branding (override via env for easy tweaks)
const BRAND_BLUE = process.env.EMAIL_PRIMARY_COLOR || '#1C4A99';
const SITE_BASE  = (process.env.NEXT_PUBLIC_BASE_URL || 'https://forcedowels.com').replace(/\/$/, '');
const LOGO_URL   = process.env.EMAIL_LOGO_URL || `${SITE_BASE}/images/force-dowel-logo.jpg?v=8`;

// Helpers for comma lists (CONTACT_INBOX, EMAIL_WHITELIST)
const parseList = (v) => String(v || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const CONTACT_RECIPIENTS = parseList(process.env.CONTACT_INBOX).map(s => s.toLowerCase());
const WHITELIST          = parseList(process.env.EMAIL_WHITELIST).map(s => s.toLowerCase());

// Resend client
const HAS_RESEND = !!process.env.RESEND_API_KEY;
const resend = HAS_RESEND ? new Resend(process.env.RESEND_API_KEY) : null;

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

  const { name, email, phone, message, inquiryType } = body || {};
  if (!name || !email || !message) {
    return json(res, 400, { error: 'Missing required fields: name, email, message' });
  }

  // Optional identity (do not require auth)
  let identity = null;
  try { identity = await verifyAuth(req); } catch {}

  // Sending switches / guards
  if (SEND_MODE === 'disabled') {
    return json(res, 200, { ok: true, mode: 'disabled', note: 'Email sending disabled in this environment.' });
  }
  if (!HAS_RESEND) {
    return json(res, 501, {
      error: 'Email service not configured',
      hint: 'Set RESEND_API_KEY, EMAIL_FROM, CONTACT_INBOX (or set EMAIL_SEND_MODE=disabled)'
    });
  }
  if (!process.env.EMAIL_FROM || CONTACT_RECIPIENTS.length === 0) {
    return json(res, 501, { error: 'Missing EMAIL_FROM or CONTACT_INBOX' });
  }
  if (IS_PREVIEW && WHITELIST.length) {
    const blocked = CONTACT_RECIPIENTS.filter(to => !WHITELIST.includes(to));
    if (blocked.length) return json(res, 200, { ok: true, mode: 'skipped_by_whitelist', blocked });
  }

  // Compose
  const subjBits = [
    PREFIX + 'New contact',
    inquiryType ? `(${String(inquiryType)})` : null,
    `from ${name}`,
    identity?.userId ? `(user ${identity.userId})` : null
  ].filter(Boolean);
  const subject = subjBits.join(' ');

  const html = buildEmailHtml({
    name, email, phone, message, inquiryType,
    identityEmail: identity?.email || null,
    identityId: identity?.userId || null,
    BRAND_BLUE, LOGO_URL
  });

  const text = [
    'New Contact',
    inquiryType ? `Type: ${inquiryType}` : null,
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    '',
    'Message:',
    message,
    '',
    identity?.email ? `Signed-in email: ${identity.email}` : null,
    identity?.userId ? `Signed-in id: ${identity.userId}` : null
  ].filter(Boolean).join('\n');

  // Send with BCC to hide recipients from each other
  const [primary, ...bccList] = CONTACT_RECIPIENTS;
  try {
    const sent = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: primary,
      bcc: bccList,
      subject,
      html,
      text,
      reply_to: email
    });
    return json(res, 200, { ok: true, id: sent?.id || null, to: [primary, ...bccList], status: 'sent' });
  } catch (err) {
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

function buildEmailHtml({ name, email, phone, message, inquiryType, identityEmail, identityId, BRAND_BLUE, LOGO_URL }) {
  const esc = escapeHtml;
  const msgHtml = esc(message || '').replace(/\n/g, '<br/>');

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; background:#f7f7f7; padding:24px;">
    <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">

      <!-- Header bar with brand blue + right-aligned logo -->
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="padding:16px 20px; background:${BRAND_BLUE}; color:#ffffff; font-size:18px; font-weight:700; line-height:1;">
            New Contact${inquiryType ? ` — ${esc(inquiryType)}` : ''}
          </td>
          <td align="right" style="padding:12px 20px; background:${BRAND_BLUE};">
            <img src="${LOGO_URL}" width="120" alt="Force Dowels" style="display:block; border:0; outline:none; text-decoration:none; height:auto;">
          </td>
        </tr>
      </table>

      <div style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate; border-spacing:0; font-size:14px;">
          <tr>
            <td style="width:170px; padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Name</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(name || '')}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Email</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(email || '')}</td>
          </tr>
          ${phone ? `
          <tr>
            <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Phone</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(phone)}</td>
          </tr>` : ''}
          <tr>
            <td style="vertical-align:top; padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Message</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${msgHtml}</td>
          </tr>
        </table>

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
        Sent from ForceDowels.com
      </div>
    </div>
  </div>`;
}
