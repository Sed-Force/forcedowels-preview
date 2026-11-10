// Distributor application notification e-mail (HTML).

export function buildProfessionalEmail({
  company, contact_name, email, phone, website,
  street, city, state, zip, country,
  business_type, years_in_business, resale_tax_id,
  monthly_volume, territory, compatibility, notes,
  submittedDate
}) {
  const logoUrl = process.env.EMAIL_LOGO_URL || 'https://forcedowels-preview.vercel.app/images/LOGO_Wordmark+Icon-WhiteAccent@1024.png';
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
              <p style="margin: 0 0 15px 0; color: #333; font-size: 14px; line-height: 1.6;">
                Please review this distributor application and contact the applicant directly using the information provided above.
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

