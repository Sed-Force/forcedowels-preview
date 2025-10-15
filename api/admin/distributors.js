// /api/admin/distributors.js
// Manage distributor database
import { sql } from '../_lib/db.js';

// Ensure distributors table exists
async function ensureDistributorsTable() {
  if (!sql) throw new Error('No DB URL configured.');
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
    );
  `;
}

export default async function handler(req, res) {
  try {
    await ensureDistributorsTable();

    // Parse body for POST/PUT requests
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      const bodyText = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(data));
      });
      try {
        body = JSON.parse(bodyText);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }

    if (req.method === 'GET') {
      // Fetch all distributors
      const distributors = await sql`
        SELECT
          id,
          company_name,
          contact_name,
          email,
          phone,
          territory,
          status,
          notes,
          TO_CHAR(created_at, 'Mon DD, YYYY') as created_at
        FROM distributors
        ORDER BY created_at DESC
      `;

      console.log('Fetched distributors:', distributors.length, 'records');
      return res.status(200).json({ distributors });
    }

    if (req.method === 'POST') {
      // Add new distributor
      const { company_name, contact_name, email, phone, territory, status, notes } = body;

      if (!company_name || !email) {
        return res.status(400).json({ error: 'Company name and email are required' });
      }

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
          ${company_name},
          ${contact_name || null},
          ${email},
          ${phone || null},
          ${territory || null},
          ${status || 'pending'},
          ${notes || null}
        )
        RETURNING id
      `;

      return res.status(201).json({ 
        success: true, 
        id: result[0].id,
        message: 'Distributor added successfully' 
      });
    }

    if (req.method === 'PUT') {
      // Update distributor
      const { id, company_name, contact_name, email, phone, territory, status, notes } = body;

      console.log('PUT request received:', { id, status, company_name });

      if (!id) {
        return res.status(400).json({ error: 'Distributor ID is required' });
      }

      const result = await sql`
        UPDATE distributors
        SET
          company_name = ${company_name},
          contact_name = ${contact_name || null},
          email = ${email},
          phone = ${phone || null},
          territory = ${territory || null},
          status = ${status},
          notes = ${notes || null},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, status
      `;

      console.log('Update result:', result);

      return res.status(200).json({
        success: true,
        message: 'Distributor updated successfully',
        updated: result[0]
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('Error managing distributors:', err);
    return res.status(500).json({ error: 'Failed to manage distributors', message: err.message });
  }
}

