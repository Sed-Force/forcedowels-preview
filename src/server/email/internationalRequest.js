// International order request notification e-mail (HTML).

function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function buildEmailHtml({
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
    <div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">

      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="padding:16px 20px; background:${BRAND_BLUE}; color:#ffffff; font-size:18px; font-weight:700; line-height:1;">
            International Order ${action === 'reserve' ? '(Stock Reserved)' : 'Request'}
          </td>
          <td align="right" style="padding:10px 20px; background:${BRAND_BLUE};">
            <img src="${LOGO_URL}" height="${LOGO_HEIGHT}" alt="Force Dowels" style="display:block; border:0; outline:none; text-decoration:none; height:${LOGO_HEIGHT}px; width:auto; line-height:1;">
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
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="table-layout:fixed; border-collapse:separate; border-spacing:0; font-size:14px; margin-bottom:20px; word-break:break-word;">
          <tr>
            <td style="width:34%; padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Quantity</strong></td>
            <td style="padding:10px 12px; border:1px solid #e5e7eb;">${esc(quantityLabel)}</td>
          </tr>
        </table>

        <h3 style="margin:0 0 12px 0; font-size:16px; color:${BRAND_BLUE};">Business &amp; Contact</h3>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="table-layout:fixed; border-collapse:separate; border-spacing:0; font-size:14px; margin-bottom:20px; word-break:break-word;">
          <tr>
            <td style="width:34%; padding:10px 12px; border:1px solid #e5e7eb; background:#f0f4ff;"><strong>Business Name</strong></td>
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
        <div style="padding:12px; border:1px solid #e5e7eb; border-radius:8px; background:#f9fafb; margin-bottom:20px; font-size:14px; word-break:break-word;">
          ${addressHtml}
        </div>

        ${comments ? `
        <h3 style="margin:0 0 12px 0; font-size:16px; color:${BRAND_BLUE};">Additional Comments</h3>
        <div style="padding:12px; border:1px solid #e5e7eb; border-radius:8px; background:#f9fafb; margin-bottom:20px; font-size:14px; word-break:break-word;">
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
