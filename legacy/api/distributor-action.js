// Handle accept/reject actions for distributor applications
import { sql } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { token } = req.query;

  if (!token) {
    return res.status(400).send(renderPage('Error', 'Invalid or missing token.', 'error'));
  }

  try {
    // Check if token exists and hasn't been used
    const tokenResult = await sql`
      SELECT distributor_id, action, used
      FROM distributor_tokens
      WHERE token = ${token}
    `;

    if (tokenResult.length === 0) {
      return res.status(404).send(renderPage('Error', 'Invalid token. This link may have expired.', 'error'));
    }

    const tokenData = tokenResult[0];

    if (tokenData.used) {
      return res.status(400).send(renderPage('Already Processed', 'This application has already been processed.', 'warning'));
    }

    // Get distributor details
    const distributorResult = await sql`
      SELECT company_name, contact_name, email, status
      FROM distributors
      WHERE id = ${tokenData.distributor_id}
    `;

    if (distributorResult.length === 0) {
      return res.status(404).send(renderPage('Error', 'Distributor not found.', 'error'));
    }

    const distributor = distributorResult[0];
    const action = tokenData.action;
    const newStatus = action === 'accept' ? 'approved' : 'rejected';

    // Update distributor status
    await sql`
      UPDATE distributors
      SET status = ${newStatus}, updated_at = NOW()
      WHERE id = ${tokenData.distributor_id}
    `;

    // Mark token as used
    await sql`
      UPDATE distributor_tokens
      SET used = TRUE
      WHERE token = ${token}
    `;

    // Mark the other token (accept/reject) as used too
    await sql`
      UPDATE distributor_tokens
      SET used = TRUE
      WHERE distributor_id = ${tokenData.distributor_id}
      AND token != ${token}
    `;

    // Return success page
    const title = action === 'accept' ? 'Application Accepted' : 'Application Declined';
    const message = action === 'accept' 
      ? `You have successfully accepted the distributor application from <strong>${distributor.company_name}</strong>. The distributor is now approved and will appear on the live site.`
      : `You have declined the distributor application from <strong>${distributor.company_name}</strong>. The application has been marked as rejected.`;

    return res.status(200).send(renderPage(title, message, action === 'accept' ? 'success' : 'info'));

  } catch (error) {
    console.error('Error processing distributor action:', error);
    return res.status(500).send(renderPage('Error', 'An error occurred while processing your request.', 'error'));
  }
}

function renderPage(title, message, type) {
  const colors = {
    success: { bg: '#10b981', icon: '✅' },
    error: { bg: '#ef4444', icon: '❌' },
    warning: { bg: '#f59e0b', icon: '⚠️' },
    info: { bg: '#3b82f6', icon: 'ℹ️' }
  };

  const color = colors[type] || colors.info;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Force Dowels</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 600px;
      width: 100%;
      overflow: hidden;
    }
    .header {
      background: ${color.bg};
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 15px;
    }
    .header h1 {
      font-size: 28px;
      font-weight: 600;
      margin: 0;
    }
    .content {
      padding: 40px 30px;
      text-align: center;
    }
    .content p {
      font-size: 16px;
      line-height: 1.6;
      color: #333;
      margin-bottom: 30px;
    }
    .button {
      display: inline-block;
      background: #1C4A99;
      color: white;
      padding: 12px 30px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      transition: background 0.3s;
    }
    .button:hover {
      background: #153a7a;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px 30px;
      text-align: center;
      color: #666;
      font-size: 14px;
      border-top: 1px solid #e0e0e0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">${color.icon}</div>
      <h1>${title}</h1>
    </div>
    <div class="content">
      <p>${message}</p>
      <a href="https://forcedowels.com" class="button">Return to Force Dowels</a>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Force Dowels. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

