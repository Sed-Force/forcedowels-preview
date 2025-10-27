// /api/_lib/email/internationalInternalNotification.js
// Internal notification email for Force Dowel team when international order is placed
// Hybrid template combining standard order details + international shipping information

export function buildInternationalInternalNotificationHTML(data = {}) {
  const {
    invoiceNumber = '',
    orderId = '',
    customerName = '',
    customerEmail = '',
    customerPhone = '',
    orderDate = '',
    sessionId = '',
    units = 0,
    unitPrice = '0.0000',
    tierLabel = '',
    lineTotal = '0.00',
    subtotalCents = 0,
    taxCents = 0,
    totalCents = 0,
    orderType = 'bulk',
    shippingAddress = {},
    billingAddress = {},
    // International-specific fields
    businessName = '',
    taxId = '',
    comments = '',
    shippingLabel = '',
  } = data;

  const formatMoney = (cents) => {
    return (Number(cents || 0) / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    });
  };

  const logoUrl = `${(process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')}/images/force-dowel-logo.jpg`;

  // Build order items row
  let itemRow = '';
  if (orderType === 'bulk') {
    itemRow = `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">Force Dowels — Bulk</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${tierLabel}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;">${units.toLocaleString()}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${unitPrice}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${lineTotal}</td>
      </tr>`;
  } else if (orderType === 'kit') {
    const kitQty = Math.floor(units / 300);
    itemRow = `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">Force Dowels — Starter Kit (300)</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">Kit</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;">${kitQty} kit${kitQty > 1 ? 's' : ''}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$36.00</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${lineTotal}</td>
      </tr>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>New International Order Received</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:680px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#1C4A99;padding:24px;text-align:center;">
              <img src="${logoUrl}" alt="Force Dowels" style="height:60px;margin:0 auto;border-radius:8px;">
              <h1 style="margin:16px 0 0;color:#ffffff;font-size:24px;font-weight:700;">New International Order Received!</h1>
              <p style="margin:8px 0 0;color:#e0e7ff;font-size:14px;">🌍 International Order — Awaiting Shipping Quote</p>
            </td>
          </tr>

          <!-- Success Message -->
          <tr>
            <td style="padding:24px;background:#f0fdf4;border-bottom:1px solid #e5e7eb;">
              <h2 style="margin:0 0 8px;color:#166534;font-size:18px;font-weight:600;">Payment Successful!</h2>
              <p style="margin:0;color:#15803d;font-size:14px;">A new international order has been placed and payment has been confirmed. Customer is awaiting shipping quote.</p>
            </td>
          </tr>

          <!-- International Order Alert -->
          <tr>
            <td style="padding:24px;background:#fef3c7;border-bottom:1px solid #e5e7eb;">
              <h2 style="margin:0 0 8px;color:#92400e;font-size:18px;font-weight:600;">⚠️ Action Required: Provide Shipping Quote</h2>
              <p style="margin:0;color:#78350f;font-size:14px;">
                <strong>This is an international order.</strong> The customer has paid for the product but is waiting for a custom shipping quote.
                Please calculate international shipping rates and send the quote to the customer within 1–3 business days.
              </p>
            </td>
          </tr>

          <!-- Customer Information -->
          <tr>
            <td style="padding:24px;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Customer Information</h3>
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;width:140px;"><strong>Invoice #:</strong></td>
                  <td style="padding:8px 0;color:#1C4A99;font-size:18px;font-weight:700;">${invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Business Name:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${businessName || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Contact Name:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${customerName || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Email:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${customerEmail || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Phone:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${customerPhone || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Tax ID:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${taxId || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Order Date:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;">${orderDate}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Stripe Session:</strong></td>
                  <td style="padding:8px 0;color:#111827;font-size:14px;font-family:monospace;font-size:12px;">${sessionId}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Order Items -->
          <tr>
            <td style="padding:24px;background:#f9fafb;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Order Items</h3>
              <table role="presentation" style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f3f4f6;">
                    <th style="padding:12px;text-align:left;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Product</th>
                    <th style="padding:12px;text-align:left;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Tier</th>
                    <th style="padding:12px;text-align:center;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Qty</th>
                    <th style="padding:12px;text-align:right;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Unit Price</th>
                    <th style="padding:12px;text-align:right;color:#374151;font-size:13px;font-weight:600;border-bottom:2px solid #e5e7eb;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRow}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Order Summary -->
          <tr>
            <td style="padding:24px;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Order Summary</h3>
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Subtotal:</strong></td>
                  <td style="padding:8px 0;text-align:right;color:#111827;font-size:14px;">${formatMoney(subtotalCents)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#f59e0b;font-size:14px;"><strong>Shipping:</strong></td>
                  <td style="padding:8px 0;text-align:right;color:#f59e0b;font-size:14px;font-weight:600;">⏳ PENDING QUOTE</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Tax:</strong></td>
                  <td style="padding:8px 0;text-align:right;color:#111827;font-size:14px;">${formatMoney(taxCents)}</td>
                </tr>
                <tr style="border-top:2px solid #e5e7eb;">
                  <td style="padding:12px 0 0;color:#111827;font-size:16px;font-weight:700;"><strong>Total Paid:</strong></td>
                  <td style="padding:12px 0 0;text-align:right;color:#1C4A99;font-size:18px;font-weight:700;">${formatMoney(totalCents)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Shipping Information -->
          <tr>
            <td style="padding:24px;background:#f9fafb;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Shipping Information</h3>
              <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">
                ${shippingAddress.name || customerName || ''}<br>
                ${customerEmail || ''}<br>
                ${shippingAddress.phone || customerPhone || ''}<br>
                ${shippingAddress.line1 || ''}<br>
                ${shippingAddress.line2 ? `${shippingAddress.line2}<br>` : ''}
                ${shippingAddress.city || ''}, ${shippingAddress.state || ''} ${shippingAddress.postal_code || ''}<br>
                ${shippingAddress.country || ''}
              </p>
              ${shippingLabel ? `
              <div style="margin-top:12px;padding:12px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;">
                <p style="margin:0;color:#78350f;font-size:13px;"><strong>Shipping Label Preference:</strong> ${shippingLabel}</p>
              </div>` : ''}
            </td>
          </tr>

          <!-- Billing Information -->
          <tr>
            <td style="padding:24px;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Billing Information</h3>
              <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">
                ${billingAddress.line1 || ''},<br>
                ${billingAddress.line2 ? `${billingAddress.line2}<br>` : ''}
                ${billingAddress.country || 'US'}
              </p>
            </td>
          </tr>

          <!-- Additional Comments -->
          ${comments ? `
          <tr>
            <td style="padding:24px;background:#f9fafb;">
              <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid #1C4A99;padding-bottom:8px;">Additional Comments</h3>
              <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;white-space:pre-wrap;">${comments}</p>
            </td>
          </tr>` : ''}

          <!-- Next Steps -->
          <tr>
            <td style="padding:24px;background:#1e3a8a;">
              <h3 style="margin:0 0 12px;color:#dbeafe;font-size:16px;font-weight:600;">📋 Next Steps</h3>
              <ol style="margin:0;padding-left:20px;color:#bfdbfe;font-size:14px;line-height:1.8;">
                <li>Calculate international shipping rates for ${units.toLocaleString()} units to ${shippingAddress.country || 'destination'}</li>
                <li>Create shipping quote invoice/payment link</li>
                <li>Email customer at <strong style="color:#ffffff;">${customerEmail}</strong> within 1–3 business days</li>
                <li>Once shipping payment received, process and prepare order for shipment</li>
              </ol>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;">
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
