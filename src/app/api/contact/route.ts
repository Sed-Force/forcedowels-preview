import { emailBranding, escapeHtml, getResend, parseList, subjectPrefix } from '@/server/email';
import { verifyAuth } from '@/server/auth';
import { jsonError, readJson } from '@/server/http';

interface ContactBody {
  name?: string; email?: string; phone?: string; message?: string; inquiryType?: string;
}

const row = (label: string, value: string, top = false) => `
  <tr>
    <td style="${top ? 'vertical-align:top; ' : ''}width:170px; padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>${label}</strong></td>
    <td style="padding:10px 12px; border:1px solid #e5e7eb;">${value}</td>
  </tr>`;

function buildEmailHtml(data: ContactBody, identity: { userId: string | null; email: string | null } | null) {
  const { blue, logoUrl, logoHeight } = emailBranding();
  const esc = escapeHtml;
  const messageHtml = esc(data.message || '').replace(/\n/g, '<br/>');

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; background:#f7f7f7; padding:24px;">
    <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="padding:16px 20px; background:${blue}; color:#ffffff; font-size:18px; font-weight:700; line-height:1;">
            New Contact${data.inquiryType ? ` — ${esc(data.inquiryType)}` : ''}
          </td>
          <td align="right" style="padding:10px 20px; background:${blue};">
            <img src="${logoUrl}" height="${logoHeight}" alt="Force Dowels" style="display:block; border:0; height:${logoHeight}px; width:auto;">
          </td>
        </tr>
      </table>
      <div style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate; border-spacing:0; font-size:14px;">
          ${row('Name', esc(data.name))}
          ${row('Email', esc(data.email))}
          ${data.phone ? row('Phone', esc(data.phone)) : ''}
          ${row('Message', messageHtml, true)}
        </table>
        ${identity ? `
        <div style="margin-top:16px; padding:10px 12px; border:1px dashed #d1d5db; border-radius:8px; background:#f9fafb;">
          <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Signed-in user</div>
          <div style="font-size:14px;">
            ${identity.email ? `Email: ${esc(identity.email)}<br/>` : ''}
            ${identity.userId ? `ID: ${esc(identity.userId)}` : ''}
          </div>
        </div>` : ''}
      </div>
      <div style="padding:12px 20px; color:#6b7280; font-size:12px; border-top:1px solid #e5e7eb;">Sent from ForceDowels.com</div>
    </div>
  </div>`;
}

export async function POST(request: Request) {
  const body = await readJson<ContactBody>(request);
  if (!body) return jsonError(400, 'Invalid JSON body');

  const { name, email, phone, message, inquiryType } = body;
  if (!name || !email || !message) {
    return jsonError(400, 'Missing required fields: name, email, message');
  }

  const identity = await verifyAuth(request);
  const recipients = parseList(process.env.CONTACT_INBOX);

  if ((process.env.EMAIL_SEND_MODE || 'send').toLowerCase() === 'disabled') {
    return Response.json({ ok: true, mode: 'disabled', note: 'Email sending disabled in this environment.' });
  }
  const resend = getResend();
  if (!resend) {
    return jsonError(501, 'Email service not configured', {
      hint: 'Set RESEND_API_KEY, EMAIL_FROM, CONTACT_INBOX (or set EMAIL_SEND_MODE=disabled)',
    });
  }
  if (!process.env.EMAIL_FROM || recipients.length === 0) {
    return jsonError(501, 'Missing EMAIL_FROM or CONTACT_INBOX');
  }

  const subject = [
    `${subjectPrefix()}New contact`,
    inquiryType ? `(${inquiryType})` : null,
    `from ${name}`,
    identity?.userId ? `(user ${identity.userId})` : null,
  ].filter(Boolean).join(' ');

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
    identity?.userId ? `Signed-in id: ${identity.userId}` : null,
  ].filter((line) => line !== null).join('\n');

  // BCC everyone after the first recipient so they cannot see each other.
  const [primary, ...bcc] = recipients;
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: primary,
    bcc,
    subject,
    html: buildEmailHtml(body, identity),
    text,
    replyTo: email,
  });

  if (error) return jsonError(502, 'Email send failed', { detail: error.message });
  return Response.json({ ok: true, id: data?.id ?? null, status: 'sent' });
}
