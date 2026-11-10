// /api/admin/update-order-status.js
// Simple endpoint to update order status (for manual corrections)
import { sql } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { invoice_number, status } = req.body;

    if (!invoice_number) {
      return res.status(400).json({ error: 'Missing invoice_number' });
    }

    if (!status || !['pending', 'shipped', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Update order status
    const rows = await sql`
      UPDATE orders
      SET status = ${status},
          updated_at = NOW()
      WHERE invoice_number = ${invoice_number}
      RETURNING invoice_number, status, customer_email
    `;

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({
      success: true,
      message: `Order #${invoice_number} status updated to ${status}`,
      order: rows[0]
    });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ error: 'Failed to update order status', message: err.message });
  }
}
