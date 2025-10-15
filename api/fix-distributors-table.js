// Fix distributors table schema
import { sql } from './_lib/db.js';

export default async function handler(req, res) {
  if (!sql) {
    return res.status(500).json({ error: 'No database connection' });
  }

  try {
    // Drop the old table and recreate with correct schema
    await sql`DROP TABLE IF EXISTS distributors CASCADE`;
    await sql`DROP TABLE IF EXISTS distributor_tokens CASCADE`;
    
    // Create distributors table with correct schema
    await sql`
      CREATE TABLE distributors (
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

    // Create tokens table
    await sql`
      CREATE TABLE distributor_tokens (
        id SERIAL PRIMARY KEY,
        distributor_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        action TEXT NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    return res.status(200).json({ 
      success: true, 
      message: 'Distributors table recreated successfully with correct schema'
    });
  } catch (error) {
    console.error('Error fixing table:', error);
    return res.status(500).json({ 
      error: 'Failed to fix table',
      detail: error.message 
    });
  }
}

