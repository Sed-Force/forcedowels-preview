// /api/contact.js
import { json, applyCORS, verifyAuth } from './_lib/auth.js';
import { Resend } from 'resend';

// -------- Env controls (top ~1–30) --------
const IS_PREVIEW = process.env.VERCEL_ENV === 'preview';
const SEND_MODE  = (process.env.EMAIL_SEND_MODE || 'send').toLowerCase(); // "send" | "disabled"
const PREFIX     = process.env.EMAIL_TAG_PREFIX || (IS_PREVIEW ? '[PREVIEW] ' : '');

const parseList = (v) => String(v || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const CONTACT_RECIPIENTS = parseList(process.env.CONTACT_INBOX).map(s => s.toLowerCase());
const WHITELIST          = parseList(process.env.EMAIL_WHITELIST).map(s => s.toLowerCase());

const HAS_RESEND = !!process.env.RESEND_API_KEY;
const resend = HAS_RESEND ? new Resend(process.env.RESEND_API_KEY) : null;

// -------- Handler --------
export default async function handler(req, res) {
  if (applyCORS(req, res)) return;

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  // Body
  let body = {};
  try {
    const text = await readBody(req);
    body = text ? JSON.parse(text) : {};
  } catch {
    return json(res, 400, { error: 'Invalid JSON body' });
  }

  const { name, email, phone, message } = body;
  if (!name || !email || !message) {
    return json(res, 400, { error: 'Missing required fields: name, email, message' });
  }

  // Optional identity (don’t require auth)
  let identity = null;
  try {
    identity = await verifyAuth(req); // { userId, email }
  } catch { /* not signed in is fine */ }

  // ----- decide whether to send -----
  if (SEND_MODE === 'disabled') {
    return json(res, 200, { ok: true, mode: 'disabled', note: 'Email sending disabled in this env.' });
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

  // Preview whitelist (optional)
  if (IS_PREVIEW && WHITELIST.length) {
    const blocked = CONTACT_RECIPIENTS.filter(to => !WHITELIST.includes(to));
    if (blocked.length) {
      return json(res, 200, { ok: true, mode: 'skipped_by_whitelist', blocked });
    }
  }

  // Compose
  const subject = `${PREFIX}New contact from ${name}${identity?.userId ? ` (user ${identity.userId})` : ''}`;
  const html = `
    <h2>New Contact</h2>
    <p><b>Name:</b> ${escapeHtml(name)}</p>
    <p><b>Email:</b> ${escapeHtml(email)}</p>
    ${phone ? `<p><b>Phone:</b> ${escapeHtml(phone)}</p>` : ''}
    <p><b>Message:</b></p>
    <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
    ${identity ? `<hr/><p><b>Signed-in user:</b> ${escapeHtml(identity.email || '')} (ID: ${identity.userId})</p>` : ''}
  `;

  try {
    // Send to MULTIPLE recipients (array is supported)
    const sent = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: CONTACT_RECIPIENTS,     // e.g., ["owner@…","sales@…","support@…"]
      subject,
      html,
      reply_to: email
    });
    return json(res, 200, { ok: true, id: sent?.id || null, to: CONTACT_RECIPIENTS });
  } catch (err) {
    return json(res, 502, { error: 'Email send failed', detail: err?.message || String(err) });
  }
}

// --- helpers ---
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
