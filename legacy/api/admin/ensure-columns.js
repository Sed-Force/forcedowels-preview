import { sql } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const results = [];

    // Add customer_phone column
    try {
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT`;
      results.push({ column: 'customer_phone', status: 'added or already exists' });
    } catch (e) {
      results.push({ column: 'customer_phone', status: 'error', error: e.message });
    }

    // Add shipping_address column
    try {
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT`;
      results.push({ column: 'shipping_address', status: 'added or already exists' });
    } catch (e) {
      results.push({ column: 'shipping_address', status: 'error', error: e.message });
    }

    // Add billing_address column
    try {
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_address TEXT`;
      results.push({ column: 'billing_address', status: 'added or already exists' });
    } catch (e) {
      results.push({ column: 'billing_address', status: 'error', error: e.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Database columns ensured',
      results
    });
  } catch (error) {
    console.error('[Ensure Columns] Error:', error);
    return res.status(500).json({
      error: 'Failed to ensure columns',
      details: error.message
    });
  }
}
