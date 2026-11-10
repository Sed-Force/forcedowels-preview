// Delete duplicate orders and reset counter
import { sql } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    // Delete invoices #49-53 (duplicates and old orders)
    const result = await sql`
      DELETE FROM orders
      WHERE invoice_number IN (49, 50, 51, 52, 53)
      RETURNING invoice_number
    `;

    // Reset the invoice counter to 48 (so next will be 49)
    const counterKey = process.env.VERCEL_ENV === 'production' ? 'invoice_prod' : 'invoice_preview';

    await sql`
      UPDATE order_counter
      SET seq = 48
      WHERE id = ${counterKey}
    `;

    return res.status(200).json({
      success: true,
      deleted: result.length,
      invoices_deleted: result.map(r => r.invoice_number),
      counter_reset_to: 48,
      next_invoice_will_be: 49
    });

  } catch (err) {
    console.error('Error cleaning up duplicates:', err);
    return res.status(500).json({
      error: 'Failed to cleanup',
      message: err.message
    });
  }
}
