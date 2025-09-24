// /api/_lib/email/orderConfirmation.js
// Returns { subject, preheader, text, html } for an order-confirmation email.

export function buildOrderConfirmationEmail(data = {}) {
  const {
    customer_name = 'Customer',
    order_number = '',
    order_date = new Date().toLocaleDateString(),
    units = 0,
    unit_usd = '0.0000',
    tier_label = '',
    line_total = '0.00',
    subtotal = '0.00',
    shipping = '0.00',
    tax = '0.00',
    total = '0.00',
    ship_name = '',
    ship_address1 = '',
    ship_address2 = '',
    ship_city = '',
    ship_state = '',
    ship_postal = '',
    ship_country = '',
    order_url = '',
    absolute_logo_url = `${(process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')}/images/force-dowel-logo.jpg`,
    is_test = false,
  } = data;

  const subject = `Your Force Dowels order is confirmed — ${order_number}`;
  const preheader = `Thanks for your purchase! We’ll send tracking details as soon as it ships.`;

  // PLAINTEXT — updated to ONLY use email
  const text = [
    `Hi ${customer_name},`,
    ``,
    `Thanks for your order! Your payment was successful.`,
    ``,
    `Order: ${order_number}`,
    `Date: ${order_date}`,
    ``,
    `Items`,
    `- Force Dowels — ${units} units @ $${unit_usd}/unit`,
    `  Line total: $${line_total}`,
    ``,
    `Summary`,
    `Subtotal: $${subtotal}`,
    `Shipping: $${shipping}`,
    `Tax: $${tax}`,
    `Total: $${total}`,
    ``,
    `Shipping To`,
    ship_name,
    ship_address1,
    ship_address2,
    `${ship_city}, ${ship_state} ${ship_postal}`,
    ship_country,
    ``,
    `View your order: ${order_url}`,
    ``,
    `Questions? Email info@forcedowels.com.`,
    `Force Dowel Company • 4455 E Nunneley Rd, Ste 103, Gilbert, AZ 85296`,
    ``,
    is_test ? `TEST MODE: This email confirms a test payment.` : ``,
    ``,
    `Thank you,`,
    `Force Dowel Company`,
  ].filter(Boolean).join('\n');

  // HTML — updated footer to ONLY show the email (no “Reply to this email or …”, no phone)
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Order Confirmation</title>
  <style>
    body{margin:0;padding:0;background:#0b1220;}
    img{border:0;outline:none;text-decoration:none;display:block}
    table{border-collapse:collapse}
    a{color:inherit;text-decoration:none}
    .btn:hover{opacity:.92}
    @media (max-width:600px){ .container{width:100% !important} .px{padding-left:16px!important;padding-right:16px!important} }
  </style>
</head>
<body style="margin:0;padding:0;background:#0b1220;">
  <center role="article" aria-roledescription="email" lang="en" style="width:100%;background:#0b1220;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;background:#0f172a;color:#ffffff;border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden;">
            <tr>
              <td class="px" style="padding:20px 24px;background:#0f172a;border-bottom:1px solid rgba(255,255,255,.08);">
                <table width="100%">
                  <tr>
                    <td align="left">
                      <img src="${absolute_logo_url}" alt="Force Dowel Company" width="160" height="auto" style="border-radius:999px;">
                    </td>
                    <td align="right" style="font:600 14px/1.2 Inter,Segoe UI,Roboto,Arial,sans-serif;opacity:.85;">
                      Order # ${order_number}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${is_test ? `
            <tr>
              <td style="background:#1f2937;color:#fbbf24;padding:10px 24px;font:600 12px/1 Inter,Segoe UI,Roboto,Arial,sans-serif;text-align:center;">
                TEST MODE — This confirms a test payment.
              </td>
            </tr>` : ``}
            <tr>
              <td class="px" style="padding:24px 24px 8px;">
                <h1 style="margin:0 0 6px;font:800 22px/1.25 Inter,Segoe UI,Roboto,Arial,sans-serif;color:#fff;">Thank you for your order! 🎉</h1>
                <p style="margin:0;font:400 14px/1.6 Inter,Segoe UI,Roboto,Arial,sans-serif;color:#cbd5e1;">
                  Hi ${customer_name}, your payment was successful. We’ll email tracking details as soon as your order ships.
                </p>
              </td>
            </tr>
            <tr>
              <td class="px" style="padding:12px 24px 8px;">
                <table role="presentation" width="100%" style="background:#0b1220;border:1px solid rgba(255,255,255,.1);border-radius:10px;">
                  <tr>
                    <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06);">
                      <div style="font:600 14px/1.2 Inter,Segoe UI,Roboto,Arial,sans-serif;color:#fff;">Order Summary</div>
                      <div style="font:400 12px/1.6 Inter,Segoe UI,Roboto,Arial,sans-serif;color:#9ca3af;margin-top:4px;">Placed on ${order_date}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;">
                      <table role="presentation" width="100%">
                        <tr>
                          <td style="font:600 14px/1.4 Inter,Segoe UI,Roboto,Arial,sans-serif;color:#e5e7eb;padding:4px 0;">Force Dowels — ${units} units</td>
                          <td align="right" style="font:600 14px/1.4 Inter,Segoe UI,Roboto,Arial,sans-serif;color:#e5e7eb;padding:4px 0;">$${unit_usd} / unit</td>
                        </tr>
                        <tr>
                          <td style="font:400 13px/1.4 Inter,Segoe UI,Roboto,Arial,sans-serif;color:#9ca3af;padding:2px 0;">${tier_label}</td>
                          <td align="right" style="font:400 13px/1.4 Inter,Segoe UI,Roboto,Arial,sans-serif;color:#9ca3af;padding:2px 0;">Line total: $${line_total}</td>
                        </tr>
                      </table>
                      <table role="presentation" width="100%" style="margin-top:10px;border-top:1px dashed rgba(255,255,255,.1);padding-top:10px;">
                        <tr><td style="font:400 13px;color:#cbd5e1;">Subtotal</td><td align="right" style="font:600 13px;color:#cbd5e1;">$${subtotal}</td></tr>
                        <tr><td style="font:400 13px;color:#cbd5e1;">Shipping</td><td align="right" style="font:600 13px;color:#cbd5e1;">$${shipping}</td></tr>
                        <tr><td style="font:400 13px;color:#cbd5e1;">Tax</td><td align="right" style="font:600 13px;color:#cbd5e1;">$${tax}</td></tr>
                        <tr><td style="font:700 14px;color:#fff;padding-top:6px;">Total</td><td align="right" style="font:800 16px;color:#fff;padding-top:6px;">$${total}</td></tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="px" style="padding:8px 24px 4px;">
                <table role="presentation" width="100%" style="background:#0b1220;border:1px solid rgba(255,255,255,.1);border-radius:10px;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <div style="font:600 14px;color:#fff;margin-bottom:6px;">Shipping To</div>
                      <div style="font:400 13px/1.6;color:#cbd5e1;">
                        ${ship_name}<br>
                        ${ship_address1}${ship_address2 ? `<br>${ship_address2}` : ``}<br>
                        ${ship_city}, ${ship_state} ${ship_postal}<br>
                        ${ship_country}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="px" align="center" style="padding:16px 24px 24px;">
                <a href="${order_url}" class="btn" style="display:inline-block;background:#f6b31a;color:#1b2437;font:700 14px/44px Inter,Segoe UI,Roboto,Arial,sans-serif;padding:0 18px;border-radius:10px;">View order</a>
              </td>
            </tr>
            <tr>
              <td class="px" style="padding:18px 24px;background:#0f172a;border-top:1px solid rgba(255,255,255,.08);">
                <p style="margin:0 0 6px;font:600 12px;color:#e5e7eb;">Need help?</p>
                <p style="margin:0 0 12px;font:400 12px/1.6;color:#9ca3af;">
                  Contact <a href="mailto:info@forcedowels.com" style="color:#f6b31a;">info@forcedowels.com</a>
                </p>
                <p style="margin:0;font:400 11px/1.6;color:#6b7280;">
                  Force Dowel Company • 4455 E Nunneley Rd, Ste 103, Gilbert, AZ 85296
                </p>
              </td>
            </tr>
          </table>
          <div style="height:24px;"></div>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`;

  return { subject, preheader, text, html };
}
