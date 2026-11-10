// Check order table schema
import { sql } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    // Get table schema
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'orders'
      ORDER BY ordinal_position
    `;

    // Get current status of invoice 48
    const order = await sql`
      SELECT invoice_number, status, customer_name, customer_email
      FROM orders
      WHERE invoice_number = 48
    `;

    return res.status(200).json({
      success: true,
      columns: columns,
      invoice_48: order[0] || null
    });

  } catch (err) {
    console.error('Error checking schema:', err);
    return res.status(500).json({
      error: 'Failed to check schema',
      message: err.message
    });
  }
}
