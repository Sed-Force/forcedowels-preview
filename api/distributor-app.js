// Minimal distributor application endpoint
import { Resend } from 'resend';
import { sql } from './_lib/db.js';
import crypto from 'crypto';

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

    // Try to save to database (but don't fail if it doesn't work)
    let distributorId = null;
    let acceptToken = null;
    let rejectToken = null;
    let acceptUrl = null;
    let rejectUrl = null;

    try {
      if (sql) {
        const fullAddress = [data.street, data.city, data.state, data.zip, data.country]
          .filter(Boolean)
          .join(', ');

        const allDetails = {
          website: data.website,
          title: data.title,
          address: fullAddress,
          business_type: data.business_type,
          years_in_business: data.years_in_business,
          resale_tax_id: data.resale_tax_id,
          monthly_volume: data.monthly_volume,
          compatibility: Array.isArray(data.compatibility) ? data.compatibility.join(', ') : data.compatibility,
          notes: data.notes
        };

        // Ensure tables exist
        await sql`
          CREATE TABLE IF NOT EXISTS distributors (
            id SERIAL PRIMARY KEY,
            company_name TEXT NOT NULL,
            contact_name TEXT,
            email TEXT NOT NULL,
            phone TEXT,
            territory TEXT,
            status TEXT DEFAULT 'pending',
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `;

        await sql`
          CREATE TABLE IF NOT EXISTS distributor_tokens (
            id SERIAL PRIMARY KEY,
            distributor_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            action TEXT NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;

        const result = await sql`
          INSERT INTO distributors (
            company_name,
            contact_name,
            email,
            phone,
            territory,
            status,
            notes
          ) VALUES (
            ${data.company},
            ${data.contact_name},
            ${data.email},
            ${data.phone || null},
            ${data.territory || null},
            'pending',
            ${JSON.stringify(allDetails)}
          )
          RETURNING id
        `;

        distributorId = result[0].id;

        // Generate secure tokens for accept/reject (one-time use)
        acceptToken = crypto.randomBytes(32).toString('hex');
        rejectToken = crypto.randomBytes(32).toString('hex');

        await sql`
          INSERT INTO distributor_tokens (distributor_id, token, action)
          VALUES
            (${distributorId}, ${acceptToken}, 'accept'),
            (${distributorId}, ${rejectToken}, 'reject')
        `;

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://forcedowels-preview.vercel.app';
        acceptUrl = `${baseUrl}/api/distributor-action?token=${acceptToken}`;
        rejectUrl = `${baseUrl}/api/distributor-action?token=${rejectToken}`;
      }
    } catch (dbError) {
      console.error('Database error (continuing without DB):', dbError);
      // Continue without database - email will still be sent
    }

    // Send email
    const resend = new Resend(process.env.RESEND_API_KEY);

    const submittedDate = new Date().toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric'
    });

    const compatibility = Array.isArray(data.compatibility)
      ? data.compatibility.join(', ')
      : (data.compatibility || 'Not specified');

    const htmlEmail = buildProfessionalEmail({
      company: data.company,
      contact_name: data.contact_name,
      email: data.email,
      phone: data.phone,
      website: data.website,
      street: data.street,
      city: data.city,
      state: data.state,
      zip: data.zip,
      country: data.country,
      business_type: data.business_type,
      years_in_business: data.years_in_business,
      resale_tax_id: data.resale_tax_id,
      monthly_volume: data.monthly_volume,
      territory: data.territory,
      compatibility: compatibility,
      notes: data.notes,
      submittedDate: submittedDate,
      acceptUrl: acceptUrl,
      rejectUrl: rejectUrl
    });

    const textEmail = `
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
Compatibility: ${compatibility}

Notes:
${data.notes || 'None'}
    `.trim();

    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: 'info@forcedowels.com',
      subject: `New Distributor Application from ${data.company}`,
      html: htmlEmail,
      text: textEmail,
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

function buildProfessionalEmail({
  company, contact_name, email, phone, website,
  street, city, state, zip, country,
  business_type, years_in_business, resale_tax_id,
  monthly_volume, territory, compatibility, notes,
  submittedDate, acceptUrl, rejectUrl
}) {
  const logoUrl = process.env.EMAIL_LOGO_URL || 'https://forcedowels-preview.vercel.app/images/force-dowel-logo.jpg';
  const brandColor = '#1C4A99';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Distributor Application</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header with Logo -->
          <tr>
            <td align="center" style="padding: 30px 20px; background-color: ${brandColor};">
              <img src="${logoUrl}" alt="Force Dowels Logo" style="max-width: 180px; height: auto; display: block;">
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="padding: 30px 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: ${brandColor}; font-size: 28px; font-weight: bold;">New Distributor Application</h1>
            </td>
          </tr>

          <!-- Introduction -->
          <tr>
            <td style="padding: 0 40px 30px; color: #333333; font-size: 16px; line-height: 1.6;">
              <p style="margin: 0;">A new distributor application has been submitted for your review. Please find the details below:</p>
            </td>
          </tr>

          <!-- Application Summary Box -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f9fa; border-left: 4px solid ${brandColor}; border-radius: 4px;">
                <tr>
                  <td style="padding: 20px;">
                    <h2 style="margin: 0 0 15px 0; color: ${brandColor}; font-size: 18px; font-weight: bold;">Application Summary</h2>
                    <table width="100%" cellpadding="5" cellspacing="0" border="0">
                      <tr>
                        <td style="color: #666; font-size: 14px; padding: 5px 0;"><strong>Business:</strong></td>
                        <td style="color: #333; font-size: 14px; padding: 5px 0;">${company || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td style="color: #666; font-size: 14px; padding: 5px 0;"><strong>Contact:</strong></td>
                        <td style="color: #333; font-size: 14px; padding: 5px 0;">${contact_name || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td style="color: #666; font-size: 14px; padding: 5px 0;"><strong>Submitted:</strong></td>
                        <td style="color: #333; font-size: 14px; padding: 5px 0;">${submittedDate}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Contact Information -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 15px 0; color: ${brandColor}; font-size: 20px; font-weight: bold; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">Contact Information</h2>
              <table width="100%" cellpadding="8" cellspacing="0" border="0" style="font-size: 14px;">
                <tr>
                  <td style="color: #666; width: 180px; vertical-align: top;"><strong>Full Name:</strong></td>
                  <td style="color: #333;">${contact_name || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="color: #666; vertical-align: top;"><strong>Business Name:</strong></td>
                  <td style="color: #333;">${company || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="color: #666; vertical-align: top;"><strong>Phone:</strong></td>
                  <td style="color: #333;">${phone || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="color: #666; vertical-align: top;"><strong>Email:</strong></td>
                  <td style="color: #333;"><a href="mailto:${email}" style="color: ${brandColor}; text-decoration: none;">${email}</a></td>
                </tr>
                ${website ? `<tr>
                  <td style="color: #666; vertical-align: top;"><strong>Website:</strong></td>
                  <td style="color: #333;"><a href="${website}" style="color: ${brandColor}; text-decoration: none;">${website}</a></td>
                </tr>` : ''}
                ${(street || city || state || zip) ? `<tr>
                  <td style="color: #666; vertical-align: top;"><strong>Business Address:</strong></td>
                  <td style="color: #333;">
                    ${street || ''}<br>
                    ${city || ''}${city && state ? ', ' : ''}${state || ''} ${zip || ''}<br>
                    ${country || ''}
                  </td>
                </tr>` : ''}
              </table>
            </td>
          </tr>

          <!-- Business Details -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 15px 0; color: ${brandColor}; font-size: 20px; font-weight: bold; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">Business Details</h2>
              <table width="100%" cellpadding="8" cellspacing="0" border="0" style="font-size: 14px;">
                ${business_type ? `<tr>
                  <td style="color: #666; width: 180px; vertical-align: top;"><strong>Business Type:</strong></td>
                  <td style="color: #333;">${business_type}</td>
                </tr>` : ''}
                ${years_in_business ? `<tr>
                  <td style="color: #666; vertical-align: top;"><strong>Years in Business:</strong></td>
                  <td style="color: #333;">${years_in_business}</td>
                </tr>` : ''}
                ${resale_tax_id ? `<tr>
                  <td style="color: #666; vertical-align: top;"><strong>Resale / Tax ID:</strong></td>
                  <td style="color: #333;">${resale_tax_id}</td>
                </tr>` : ''}
                ${territory ? `<tr>
                  <td style="color: #666; vertical-align: top;"><strong>Territory / Coverage Area:</strong></td>
                  <td style="color: #333;">${territory}</td>
                </tr>` : ''}
                ${monthly_volume ? `<tr>
                  <td style="color: #666; vertical-align: top;"><strong>Estimated Monthly Volume:</strong></td>
                  <td style="color: #333;">${monthly_volume}</td>
                </tr>` : ''}
                ${compatibility ? `<tr>
                  <td style="color: #666; vertical-align: top;"><strong>System Compatibility:</strong></td>
                  <td style="color: #333;">${compatibility}</td>
                </tr>` : ''}
              </table>
            </td>
          </tr>

          <!-- Additional Information -->
          ${notes ? `<tr>
            <td style="padding: 0 40px 30px;">
              <h2 style="margin: 0 0 15px 0; color: ${brandColor}; font-size: 20px; font-weight: bold; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">Additional Information</h2>
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; color: #333; font-size: 14px; line-height: 1.6;">
                ${notes.replace(/\n/g, '<br>')}
              </div>
            </td>
          </tr>` : ''}

          <!-- Action Required -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <h2 style="margin: 0 0 15px 0; color: ${brandColor}; font-size: 20px; font-weight: bold; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">Action Required</h2>
              <p style="margin: 0 0 20px 0; color: #333; font-size: 14px; line-height: 1.6;">
                Please review this distributor application and choose your response:
              </p>

              <!-- Action Buttons -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding: 10px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-right: 10px;">
                          <a href="${acceptUrl}" style="display: inline-block; padding: 14px 32px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                            ✅ Accept Application
                          </a>
                        </td>
                        <td style="padding-left: 10px;">
                          <a href="${rejectUrl}" style="display: inline-block; padding: 14px 32px; background-color: #ef4444; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                            ❌ Decline Application
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0 0; color: #666; font-size: 12px; line-height: 1.6; text-align: center;">
                These links are secure and can only be used once. After taking action, you can contact the applicant directly using the information provided above.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0;">This email was sent from the Force Dowels distributor application form.</p>
              <p style="margin: 5px 0 0 0;">© ${new Date().getFullYear()} Force Dowels. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

