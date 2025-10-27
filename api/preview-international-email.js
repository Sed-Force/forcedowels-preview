// /api/preview-international-email.js
// Test endpoint to preview the international order confirmation email

import { buildInternationalOrderConfirmationEmail } from './_lib/email/internationalOrderConfirmation.js';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.json({ error: 'Method not allowed' });
  }

  // Sample data for preview
  const sampleData = {
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

  // Build the email
  const emailData = buildInternationalOrderConfirmationEmail(sampleData);

  // Return HTML for browser preview
  res.setHeader('Content-Type', 'text/html');
  res.statusCode = 200;
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview: International Order Email</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #f3f4f6;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .preview-header {
      max-width: 800px;
      margin: 0 auto 20px;
      padding: 16px;
      background: white;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .preview-header h1 {
      margin: 0 0 8px 0;
      font-size: 20px;
      color: #111827;
    }
    .preview-header p {
      margin: 0;
      color: #6b7280;
      font-size: 14px;
    }
    .preview-info {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 12px;
      margin-top: 12px;
      border-radius: 4px;
    }
    .preview-info strong {
      color: #92400e;
      display: block;
      margin-bottom: 4px;
    }
    .preview-info p {
      margin: 0;
      color: #78350f;
      font-size: 13px;
    }
    .email-container {
      max-width: 800px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <div class="preview-header">
    <h1>📧 International Order Email Preview</h1>
    <p><strong>Subject:</strong> ${emailData.subject}</p>
    <p><strong>Preheader:</strong> ${emailData.preheader}</p>

    <div class="preview-info">
      <strong>⚠️ Preview Mode</strong>
      <p>This is a sample preview using test data. The actual email will be sent automatically when an international customer completes checkout.</p>
    </div>
  </div>

  <div class="email-container">
    ${emailData.html}
  </div>
</body>
</html>
  `);
}
