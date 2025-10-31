// Quick diagnostic endpoint to check Invoice #45
import { sql } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    const rows = await sql`
      SELECT
        invoice_number,
        customer_name,
        status,
        order_date,
        shipped_date,
        updated_at,
        created_at
      FROM orders
      WHERE invoice_number = 45
    `;

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invoice #45 not found' });
    }

    return res.status(200).json({
      invoice: rows[0],
      note: 'This shows the current database state of Invoice #45'
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Database query failed',
      message: err.message
    });
  }
}
