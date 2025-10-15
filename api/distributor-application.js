// /api/distributor-application.js — Handles distributor application form submissions
import { json, applyCORS, verifyAuth } from './_lib/auth.js';
import { Resend } from 'resend';

// ---------- Env controls ----------
const IS_PREVIEW = process.env.VERCEL_ENV === 'preview';
const SEND_MODE  = (process.env.EMAIL_SEND_MODE || 'send').toLowerCase(); // "send" | "disabled"
const PREFIX     = process.env.EMAIL_TAG_PREFIX || (IS_PREVIEW ? '[PREVIEW] ' : '');

// Branding (override via env for easy tweaks)
const BRAND_BLUE   = process.env.EMAIL_PRIMARY_COLOR || '#1C4A99';
const SITE_BASE    = (process.env.NEXT_PUBLIC_BASE_URL || 'https://forcedowels.com').replace(/\/$/, '');
const LOGO_URL     = process.env.EMAIL_LOGO_URL || `${SITE_BASE}/images/force-dowel-logo.jpg`;
const LOGO_HEIGHT  = Number(process.env.EMAIL_LOGO_HEIGHT || 48);

// Helpers for comma lists
const parseList = (v) => String(v || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Send to info@forcedowels.com
const DISTRIBUTOR_RECIPIENTS = ['info@forcedowels.com'];
const WHITELIST = parseList(process.env.EMAIL_WHITELIST).map(s => s.toLowerCase());

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

  // Extract all form fields
  const {
    company, website, contact_name, title, email, phone,
    street, city, state, zip, country,
    business_type, years_in_business, resale_tax_id,
    monthly_volume, territory, compatibility,
    notes, agree
  } = body || {};

  // Validate required fields
  if (!company || !contact_name || !email) {
    return json(res, 400, { error: 'Missing required fields: company, contact_name, email' });
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
      hint: 'Set RESEND_API_KEY, EMAIL_FROM (or set EMAIL_SEND_MODE=disabled)'
    });
  }
  if (!process.env.EMAIL_FROM) {
    return json(res, 501, { error: 'Missing EMAIL_FROM' });
  }
  if (IS_PREVIEW && WHITELIST.length) {
    const blocked = DISTRIBUTOR_RECIPIENTS.filter(to => !WHITELIST.includes(to));
    if (blocked.length) return json(res, 200, { ok: true, mode: 'skipped_by_whitelist', blocked });
  }

  // Compose
  const subject = `${PREFIX}New Distributor Application from ${company}`;

  const html = buildEmailHtml({
    company, website, contact_name, title, email, phone,
    street, city, state, zip, country,
    business_type, years_in_business, resale_tax_id,
    monthly_volume, territory, compatibility,
    notes,
    identityEmail: identity?.email || null,
    identityId: identity?.userId || null,
    BRAND_BLUE, LOGO_URL, LOGO_HEIGHT
  });

  const text = [
    'New Distributor Application',
    '',
    '=== Company & Contact ===',
    `Company Name: ${company}`,
    website ? `Website: ${website}` : null,
    `Primary Contact: ${contact_name}`,
    title ? `Title/Role: ${title}` : null,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    '',
    '=== Business Address ===',
    street ? `Street: ${street}` : null,
    city ? `City: ${city}` : null,
    state ? `State: ${state}` : null,
    zip ? `ZIP: ${zip}` : null,
    country ? `Country: ${country}` : null,
    '',
    '=== Business Profile ===',
    business_type ? `Business Type: ${business_type}` : null,
    years_in_business ? `Years in Business: ${years_in_business}` : null,
    resale_tax_id ? `Resale/Tax ID: ${resale_tax_id}` : null,
    monthly_volume ? `Estimated Monthly Volume: ${monthly_volume}` : null,
    territory ? `Territories/Regions: ${territory}` : null,
    compatibility ? `Compatibility: ${Array.isArray(compatibility) ? compatibility.join(', ') : compatibility}` : null,
    '',
    notes ? `=== Additional Notes ===\n${notes}` : null,
    '',
    identity?.email ? `Signed-in email: ${identity.email}` : null,
    identity?.userId ? `Signed-in id: ${identity.userId}` : null
  ].filter(Boolean).join('\n');

  // Send to info@forcedowels.com
  try {
    const sent = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: DISTRIBUTOR_RECIPIENTS,
      subject,
      html,
      text,
      reply_to: email
    });
    return json(res, 200, { ok: true, id: sent?.id || null, to: DISTRIBUTOR_RECIPIENTS, status: 'sent' });
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

function buildEmailHtml({
  company, website, contact_name, title, email, phone,
  street, city, state, zip, country,
  business_type, years_in_business, resale_tax_id,
  monthly_volume, territory, compatibility,
  notes,
  identityEmail, identityId,
  BRAND_BLUE, LOGO_URL, LOGO_HEIGHT
}) {
  const esc = escapeHtml;
  const notesHtml = notes ? esc(notes).replace(/\n/g, '<br/>') : '';
  const compatArray = Array.isArray(compatibility) ? compatibility : (compatibility ? [compatibility] : []);

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; background:#f7f7f7; padding:24px;">
    <div style="max-width:720px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">

      <!-- Header bar with brand blue + SMALL pill logo on right -->
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="padding:16px 20px; background:${BRAND_BLUE}; color:#ffffff; font-size:18px; font-weight:700; line-height:1;">
            New Distributor Application
          </td>
          <td align="right" style="padding:10px 20px; background:${BRAND_BLUE};">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
              <tr>
                <td style="background:#ffffff; border:1px solid #e5e7eb; border-radius:9999px; padding:6px;">
                  <img src="${LOGO_URL}"
                       height="${LOGO_HEIGHT}"
                       alt="Force Dowels"
                       style="display:block; border:0; outline:none; text-decoration:none; border-radius:9999px; height:${LOGO_HEIGHT}px; width:auto; line-height:1;">
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <div style="padding:16px 20px;">
        <!-- Company & Contact -->
        <h3 style="margin:0 0 12px 0; font-size:16px; color:${BRAND_BLUE};">Company &amp; Contact</h3>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate; border-spacing:0; font-size:14px; margin-bottom:20px;">
          <tr>
            <td style="width:180px; padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Company Name</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(company || '')}</td>
          </tr>
          ${website ? `
          <tr>
            <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Website</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;"><a href="${esc(website)}" style="color:${BRAND_BLUE};">${esc(website)}</a></td>
          </tr>` : ''}
          <tr>
            <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Primary Contact</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(contact_name || '')}</td>
          </tr>
          ${title ? `
          <tr>
            <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Title/Role</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(title)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Email</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;"><a href="mailto:${esc(email)}" style="color:${BRAND_BLUE};">${esc(email || '')}</a></td>
          </tr>
          ${phone ? `
          <tr>
            <td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Phone</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(phone)}</td>
          </tr>` : ''}
        </table>

        <!-- Business Address -->
        ${street || city || state || zip || country ? `
        <h3 style="margin:0 0 12px 0; font-size:16px; color:${BRAND_BLUE};">Business Address</h3>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate; border-spacing:0; font-size:14px; margin-bottom:20px;">
          ${street ? `<tr><td style="width:180px; padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Street</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(street)}</td></tr>` : ''}
          ${city ? `<tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>City</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(city)}</td></tr>` : ''}
          ${state ? `<tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>State</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(state)}</td></tr>` : ''}
          ${zip ? `<tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>ZIP</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(zip)}</td></tr>` : ''}
          ${country ? `<tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Country</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(country)}</td></tr>` : ''}
        </table>` : ''}

        <!-- Business Profile -->
        <h3 style="margin:0 0 12px 0; font-size:16px; color:${BRAND_BLUE};">Business Profile</h3>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate; border-spacing:0; font-size:14px; margin-bottom:20px;">
          ${business_type ? `<tr><td style="width:180px; padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Business Type</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(business_type)}</td></tr>` : ''}
          ${years_in_business ? `<tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Years in Business</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(years_in_business)}</td></tr>` : ''}
          ${resale_tax_id ? `<tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Resale/Tax ID</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(resale_tax_id)}</td></tr>` : ''}
          ${monthly_volume ? `<tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Monthly Volume</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(monthly_volume)}</td></tr>` : ''}
          ${territory ? `<tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Territories</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(territory)}</td></tr>` : ''}
          ${compatArray.length > 0 ? `<tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Compatibility</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${compatArray.map(esc).join(', ')}</td></tr>` : ''}
        </table>

        ${notes ? `
        <h3 style="margin:0 0 12px 0; font-size:16px; color:${BRAND_BLUE};">Additional Notes</h3>
        <div style="padding:12px; border:1px solid #e5e7eb; border-radius:8px; background:#f9fafb; margin-bottom:20px; font-size:14px;">
          ${notesHtml}
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
        Sent from ForceDowels.com Distributor Application
      </div>
    </div>
  </div>`;
}

