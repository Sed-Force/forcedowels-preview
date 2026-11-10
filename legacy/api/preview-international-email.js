// /api/preview-international-email.js
// Test endpoint to preview the international order confirmation emails (customer + internal)

import { buildInternationalOrderConfirmationEmail } from './_lib/email/internationalOrderConfirmation.js';
import { buildInternationalInternalNotificationHTML } from './_lib/email/internationalInternalNotification.js';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.json({ error: 'Method not allowed' });
  }

  // Sample data for customer email preview
  const customerSampleData = {
    customer_name: 'John Smith',
    order_number: '10234',
    order_date: 'December 15, 2024, 10:30 AM UTC',
    units: 35000,
    unit_usd: '0.0675',
    tier_label: 'Tier: 25,000–164,999',
    line_total: '2362.50',
    subtotal: '2362.50',
    tax: '189.00',
    total: '2551.50',
    ship_name: 'John Smith',
    ship_address1: '123 Business Parkway',
    ship_address2: 'Suite 400',
    ship_city: 'Toronto',
    ship_state: 'ON',
    ship_postal: 'M5H 2N2',
    ship_country: 'Canada',
    order_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://forcedowels.com'}/order-status.html?session=cs_test_example`,
    is_test: true
  };

  // Sample data for internal notification preview
  const internalSampleData = {
    invoiceNumber: '10234',
    orderId: '#cs_test',
    customerName: 'John Smith',
    customerEmail: 'john.smith@example.com',
    customerPhone: '+1 (416) 555-0123',
    orderDate: 'December 15, 2024, 10:30 AM UTC',
    sessionId: 'cs_test_a1b2c3d4e5f6g7h8',
    units: 35000,
    unitPrice: '0.0675',
    tierLabel: 'Tier: 25,000–164,999',
    lineTotal: '2362.50',
    subtotalCents: 236250,
    taxCents: 18900,
    totalCents: 255150,
    orderType: 'bulk',
    shippingAddress: {
      name: 'John Smith',
      line1: '123 Business Parkway',
      line2: 'Suite 400',
      city: 'Toronto',
      state: 'ON',
      postal_code: 'M5H 2N2',
      country: 'Canada',
      phone: '+1 (416) 555-0123'
    },
    billingAddress: {
      line1: '123 Business Parkway',
      line2: 'Suite 400',
      country: 'Canada'
    },
    businessName: 'Acme Corp International',
    taxId: 'CA123456789',
    comments: 'Please use expedited shipping if possible. This order is time-sensitive for our upcoming project.',
    shippingLabel: 'Customer will provide shipping label'
  };

  // Build both emails
  const customerEmailData = buildInternationalOrderConfirmationEmail(customerSampleData);
  const internalEmailHtml = buildInternationalInternalNotificationHTML(internalSampleData);

  // Return HTML for browser preview with both emails
  res.setHeader('Content-Type', 'text/html');
  res.statusCode = 200;
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview: International Order Emails</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #f3f4f6;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .main-header {
      max-width: 1400px;
      margin: 0 auto 30px;
      padding: 20px;
      background: linear-gradient(135deg, #1e3a8a 0%, #1C4A99 100%);
      border-radius: 12px;
      color: white;
      text-align: center;
    }
    .main-header h1 {
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: 700;
    }
    .main-header p {
      margin: 0;
      font-size: 16px;
      opacity: 0.9;
    }
    .preview-container {
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
    }
    @media (max-width: 1200px) {
      .preview-container {
        grid-template-columns: 1fr;
      }
    }
    .email-section {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .section-header {
      margin: 0 0 16px 0;
      padding-bottom: 12px;
      border-bottom: 2px solid #e5e7eb;
    }
    .section-header h2 {
      margin: 0 0 8px 0;
      font-size: 20px;
      color: #111827;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-header p {
      margin: 0;
      color: #6b7280;
      font-size: 14px;
    }
    .section-header .subject {
      margin-top: 8px;
      padding: 8px 12px;
      background: #f9fafb;
      border-radius: 6px;
      font-size: 13px;
    }
    .section-header .subject strong {
      color: #374151;
    }
    .preview-info {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 12px;
      margin-bottom: 16px;
      border-radius: 4px;
    }
    .preview-info strong {
      color: #92400e;
      display: block;
      margin-bottom: 4px;
      font-size: 14px;
    }
    .preview-info p {
      margin: 0;
      color: #78350f;
      font-size: 13px;
      line-height: 1.5;
    }
    .email-preview {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      background: #f9fafb;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-customer {
      background: #dbeafe;
      color: #1e40af;
    }
    .badge-internal {
      background: #fef3c7;
      color: #92400e;
    }
  </style>
</head>
<body>
  <div class="main-header">
    <h1>🌍 International Order Email Preview</h1>
    <p>Review both customer and internal notification emails before deployment</p>
  </div>

  <div class="preview-info" style="max-width: 1400px; margin: 0 auto 30px;">
    <strong>⚠️ Preview Mode</strong>
    <p>These are sample previews using test data. The actual emails will be sent automatically when an international customer completes checkout. Both emails will be sent simultaneously - one to the customer and one to the Force Dowel team.</p>
  </div>

  <div class="preview-container">
    <!-- Customer Email -->
    <div class="email-section">
      <div class="section-header">
        <h2>
          <span>📧</span>
          Customer Confirmation
          <span class="badge badge-customer">Sent to Customer</span>
        </h2>
        <p>This email is sent to the customer who placed the international order</p>
        <div class="subject">
          <strong>Subject:</strong> ${customerEmailData.subject}<br>
          <strong>Preheader:</strong> ${customerEmailData.preheader}
        </div>
      </div>
      <div class="email-preview">
        ${customerEmailData.html}
      </div>
    </div>

    <!-- Internal Notification -->
    <div class="email-section">
      <div class="section-header">
        <h2>
          <span>🔔</span>
          Internal Notification
          <span class="badge badge-internal">Sent to Force Dowel Team</span>
        </h2>
        <p>This email is sent to the Force Dowel team (EMAIL_BCC addresses)</p>
        <div class="subject">
          <strong>Subject:</strong> 🌍 New International Order - Invoice #10234
        </div>
      </div>
      <div class="email-preview">
        ${internalEmailHtml}
      </div>
    </div>
  </div>

  <div style="max-width: 1400px; margin: 40px auto 0; text-align: center; color: #6b7280; font-size: 14px;">
    <p>Invoice numbers are generated sequentially from the database counter.</p>
    <p>Both emails include the same invoice number for tracking consistency.</p>
  </div>
</body>
</html>
  `);
}
