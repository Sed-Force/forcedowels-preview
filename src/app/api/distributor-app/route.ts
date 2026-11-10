import { buildProfessionalEmail } from '@/server/email/distributorApplication';
import { sql } from '@/server/db';
import { getResend } from '@/server/email';
import { errorMessage, jsonError, readJson } from '@/server/http';

interface DistributorApplication {
  company?: string; contact_name?: string; email?: string; phone?: string; website?: string;
  title?: string; street?: string; city?: string; state?: string; zip?: string; country?: string;
  business_type?: string; years_in_business?: string; resale_tax_id?: string; monthly_volume?: string;
  territory?: string; compatibility?: string[] | string; notes?: string;
}

async function saveApplication(data: DistributorApplication) {
  if (!sql) {
    console.warn('[distributor-app] No database configured; application will only be e-mailed.');
    return null;
  }
  try {
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
      )`;

    const details = {
      website: data.website, title: data.title, street: data.street, city: data.city,
      state: data.state, zip: data.zip, country: data.country,
      business_type: data.business_type, years_in_business: data.years_in_business,
      resale_tax_id: data.resale_tax_id, monthly_volume: data.monthly_volume,
      compatibility: Array.isArray(data.compatibility) ? data.compatibility.join(', ') : data.compatibility,
      additional_notes: data.notes,
    };

    const rows = await sql`
      INSERT INTO distributors (company_name, contact_name, email, phone, territory, status, notes)
      VALUES (${data.company}, ${data.contact_name}, ${data.email}, ${data.phone || null},
              ${data.territory || null}, 'pending', ${JSON.stringify(details, null, 2)})
      RETURNING id`;
    return rows[0]?.id ?? null;
  } catch (err) {
    // The e-mail below still reaches the team, so a DB failure is non-fatal.
    console.error('[distributor-app] Database error:', errorMessage(err));
    return null;
  }
}

export async function POST(request: Request) {
  const data = await readJson<DistributorApplication>(request);
  if (!data) return jsonError(400, 'Invalid JSON body');
  if (!data.company || !data.contact_name || !data.email) {
    return jsonError(400, 'Missing required fields');
  }

  const resend = getResend();
  if (!resend || !process.env.EMAIL_FROM) {
    return jsonError(501, 'Email service not configured', { hint: 'Set RESEND_API_KEY and EMAIL_FROM' });
  }

  await saveApplication(data);

  const compatibility = Array.isArray(data.compatibility)
    ? data.compatibility.join(', ')
    : data.compatibility || 'Not specified';

  const html = buildProfessionalEmail({
    ...data,
    compatibility,
    submittedDate: new Date().toLocaleDateString('en-US'),
  } as Parameters<typeof buildProfessionalEmail>[0]);

  const text = [
    'New Distributor Application',
    '',
    `Company: ${data.company}`,
    `Contact: ${data.contact_name}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone || 'N/A'}`,
    `Website: ${data.website || 'N/A'}`,
    '',
    'Address:',
    `${data.street || ''} ${data.city || ''}, ${data.state || ''} ${data.zip || ''}`,
    data.country || '',
    '',
    `Business Type: ${data.business_type || 'N/A'}`,
    `Years in Business: ${data.years_in_business || 'N/A'}`,
    `Tax ID: ${data.resale_tax_id || 'N/A'}`,
    `Monthly Volume: ${data.monthly_volume || 'N/A'}`,
    `Territory: ${data.territory || 'N/A'}`,
    `Compatibility: ${compatibility}`,
    '',
    `Notes: ${data.notes || 'None'}`,
  ].join('\n');

  try {
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: 'info@forcedowels.com',
      subject: `New Distributor Application from ${data.company}`,
      html,
      text,
      replyTo: data.email,
    });
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, status: 'sent' });
  } catch (err) {
    console.error('[distributor-app] Email error:', errorMessage(err));
    return jsonError(500, 'Failed to send application', { detail: errorMessage(err) });
  }
}
