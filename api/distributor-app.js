// Minimal distributor application endpoint
import { Resend } from 'resend';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Read body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    const data = JSON.parse(body);

    // Validate
    if (!data.company || !data.contact_name || !data.email) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Send email
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const emailBody = `
New Distributor Application

Company: ${data.company}
Contact: ${data.contact_name}
Email: ${data.email}
Phone: ${data.phone || 'N/A'}
Website: ${data.website || 'N/A'}

Address:
${data.street || ''} ${data.city || ''}, ${data.state || ''} ${data.zip || ''}
${data.country || ''}

Business Type: ${data.business_type || 'N/A'}
Years in Business: ${data.years_in_business || 'N/A'}
Tax ID: ${data.resale_tax_id || 'N/A'}
Monthly Volume: ${data.monthly_volume || 'N/A'}
Territory: ${data.territory || 'N/A'}
Compatibility: ${Array.isArray(data.compatibility) ? data.compatibility.join(', ') : 'N/A'}

Notes:
${data.notes || 'None'}
    `.trim();

    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: 'info@forcedowels.com',
      subject: `New Distributor Application from ${data.company}`,
      text: emailBody,
      reply_to: data.email
    });

    res.status(200).json({ ok: true, status: 'sent' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Failed to send application',
      detail: error.message 
    });
  }
}

