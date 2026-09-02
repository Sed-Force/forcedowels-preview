// /api/_lib/email/internalNotification.js
// Internal "New Order Received" notification email for the Force Dowels team (domestic orders).

import { kitPriceCents, kitUnits, pickTier, sizeLabel } from '../products.js';
import { formatMoney, lineTotalCents, resolveOrderLines, unitPriceForLine } from './orderFormatting.js';

export function buildInternalNotificationHTML({ invoiceNumber, customerName, customerEmail, customerPhone, orderDate, sessionId, subtotalCents, shippingCents, taxCents, totalCents, metaSummary, shippingMethod, shippingAddress, billingAddress, isTest, showDownloadButton = true }) {
  const { tests = 0 } = metaSummary || {};
  const orderLines = resolveOrderLines(metaSummary);

  // Build order items table rows
  let itemRows = '';
  if (tests > 0) {
    itemRows = `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;word-break:break-word;">🧪 Webhook Test Order</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;word-break:break-word;">Test</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;">1</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$1.00</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$1.00</td>
      </tr>`;
  } else {
    for (const line of orderLines) {
      if (line.type === 'bulk') {
        const unitPrice = unitPriceForLine(line);
        const tierName = pickTier(line.sizeId, line.units).label;
        itemRows += `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;word-break:break-word;">Force Dowels — ${sizeLabel(line.sizeId)}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;word-break:break-word;">${tierName}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;">${line.units.toLocaleString()}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${unitPrice.toFixed(4)}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(lineTotalCents(line))}</td>
      </tr>`;
      } else if (line.type === 'kit') {
        const unitsPerKit = kitUnits(line.sizeId);
        const kitPrice = kitPriceCents(line.sizeId) / 100;
        itemRows += `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;word-break:break-word;">Force Dowels — ${sizeLabel(line.sizeId)}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;word-break:break-word;">Kit - ${unitsPerKit} units</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;">${line.qty} kit${line.qty > 1 ? 's' : ''}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${kitPrice.toFixed(2)}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(lineTotalCents(line))}</td>
      </tr>`;
      }
    }
  }

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://forcedowels.com').replace(/\/$/, '');
  const logoUrl = process.env.EMAIL_LOGO_URL || `${baseUrl}/images/LOGO_Wordmark+Icon-WhiteAccent@1024.png`;
  const downloadUrl = `${baseUrl}/api/order-print?session=${encodeURIComponent(sessionId || '')}`;
  const testBanner = isTest ? '<tr><td style="padding:16px;background:#fbbf24;text-align:center;"><h2 style="margin:0;color:#1b2437;">🧪 TEST ORDER - Email System Verification</h2></td></tr>' : '';
  const downloadRow = showDownloadButton ? `
          <!-- Download -->
          <tr>
            <td class="fd-sec" style="padding:20px 24px;background:#ffffff;border-bottom:1px solid #e5e7eb;text-align:center;">
              <a href="${downloadUrl}" target="_blank" style="display:inline-block;background:#1C4A99;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 32px;border-radius:6px;">Download PDF</a>
              <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;">Opens an A4 print view of this notification.</p>
            </td>
          </tr>` : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>New Order Received</title>
  <style>
    body { -webkit-text-size-adjust: 100%; }
    .fd-items { table-layout: fixed; }
    .fd-items th, .fd-items td { word-break: break-word; }
    @media only screen and (max-width: 600px) {
      .fd-sec { padding: 16px !important; }
      .fd-items th, .fd-items td { padding: 8px 6px !important; font-size: 12px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#1C4A99;padding:24px;text-align:center;">
              <img src="${logoUrl}" alt="Force Dowels" style="height:60px;margin:0 auto;">
              <h1 style="margin:16px 0 0;color:#ffffff;font-size:24px;font-weight:700;">New Order Received!</h1>
              <p style="margin:8px 0 0;color:#e0e7ff;font-size:14px;">Force Dowels Order Notification</p>
            </td>
          </tr>
          ${testBanner}

          <!-- Success Message -->
          <tr>
            <td class="fd-sec" style="padding:24px;background:#f0fdf4;border-bottom:1px solid #e5e7eb;">
              <h2 style="margin:0 0 8px;color:#166534;font-size:18px;font-weight:600;">Payment Successful!</h2>
              <p style="margin:0;color:#15803d;font-size:14px;">A new order has been placed and payment has been confirmed.</p>
            </td>
          </tr>

          ${downloadRow}

          <!-- Customer Information -->
          <tr>
            <td class="fd-sec" style="padding:24px;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Customer Information</h3>
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;width:140px;"><strong>Invoice #:</strong></td>
                  <td style="padding:8px 0;color:#1C4A99;font-size:18px;font-weight:700;">${invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Company/Name:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${customerName || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Email:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${customerEmail || 'N/A'}</td>
                </tr>
                ${customerPhone ? `<tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Phone:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${customerPhone}</td>
                </tr>` : ''}
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Order Date:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${orderDate}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Stripe Session:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-family:monospace;font-size:12px;word-break:break-all;">${sessionId}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Order Items -->
          <tr>
            <td class="fd-sec" style="padding:24px;background:#f9fafb;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Order Items</h3>
              <table role="presentation" class="fd-items" style="width:100%;table-layout:fixed;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f3f4f6;">
                    <th style="width:30%;padding:12px;text-align:left;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;word-break:break-word;">Product</th>
                    <th style="width:24%;padding:12px;text-align:left;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;word-break:break-word;">Tier</th>
                    <th style="width:14%;padding:12px;text-align:center;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Qty</th>
                    <th style="width:16%;padding:12px;text-align:right;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Unit Price</th>
                    <th style="width:16%;padding:12px;text-align:right;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Order Summary -->
          <tr>
            <td class="fd-sec" style="padding:24px;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Order Summary</h3>
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Subtotal:</strong></td>
                  <td style="padding:8px 0;text-align:right;color:#111827;font-size:14px;">${formatMoney(subtotalCents)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Shipping${shippingMethod ? ` (${shippingMethod})` : ''}:</strong></td>
                  <td style="padding:8px 0;text-align:right;color:#111827;font-size:14px;">${formatMoney(shippingCents)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Tax:</strong></td>
                  <td style="padding:8px 0;text-align:right;color:#111827;font-size:14px;">${formatMoney(taxCents)}</td>
                </tr>
                <tr style="border-top:2px solid #e5e7eb;">
                  <td style="padding:12px 0 0;color:#111827;font-size:16px;font-weight:700;"><strong>Total:</strong></td>
                  <td style="padding:12px 0 0;text-align:right;color:#1C4A99;font-size:18px;font-weight:700;">${formatMoney(totalCents)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Shipping Information -->
          <tr>
            <td class="fd-sec" style="padding:24px;background:#f9fafb;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Shipping Information</h3>
              <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">
                ${shippingAddress.name || customerName || ''}<br>
                ${shippingAddress.line1 || ''}<br>
                ${shippingAddress.line2 ? `${shippingAddress.line2}<br>` : ''}
                ${shippingAddress.city || ''}, ${shippingAddress.state || ''} ${shippingAddress.postal_code || ''}<br>
                ${shippingAddress.country || ''}
              </p>
            </td>
          </tr>

          <!-- Billing Information -->
          <tr>
            <td class="fd-sec" style="padding:24px;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Billing Information</h3>
              <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">
                ${billingAddress.line1 || billingAddress.city || 'N/A'}<br>
                ${billingAddress.line2 ? `${billingAddress.line2}<br>` : ''}
                ${billingAddress.city ? `${billingAddress.city}, ` : ''}${billingAddress.state || ''} ${billingAddress.postal_code || ''}<br>
                ${billingAddress.country || 'US'}
              </p>
            </td>
          </tr>

          <!-- Action Required -->
          <tr>
            <td class="fd-sec" style="padding:24px;background:#fef3c7;border-top:1px solid #e5e7eb;">
              <h3 style="margin:0 0 8px;color:#92400e;font-size:16px;font-weight:600;">Action Required</h3>
              <p style="margin:0;color:#78350f;font-size:14px;">Please process this order and prepare it for shipment. The customer has been notified of their successful purchase.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="fd-sec" style="padding:24px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:12px;">This is an automated notification from your Force Dowels order system.</p>
              <p style="margin:8px 0 0;color:#9ca3af;font-size:11px;">© 2025 Force Dowels. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
