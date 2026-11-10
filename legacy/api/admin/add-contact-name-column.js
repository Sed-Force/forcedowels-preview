// Add contact_name column to orders table
import { sql } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    // Add contact_name column
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS contact_name TEXT
      `;
    } catch (err) {
      console.log('contact_name column may already exist:', err.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Added contact_name column to orders table'
    });

  } catch (err) {
    console.error('Error adding column:', err);
    return res.status(500).json({
      error: 'Failed to add column',
      message: err.message
    });
  }
}
