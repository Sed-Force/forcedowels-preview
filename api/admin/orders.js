// /api/admin/orders.js
// Fetch all orders from database (includes historical orders)
import { sql } from '../_lib/db.js';

function formatMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!sql) {
      throw new Error('Database not configured');
    }

    // Fetch all orders from database, sorted by invoice number descending (newest first)
    const rows = await sql`
      SELECT
        invoice_number,
        customer_name,
        customer_email,
        items_summary,
        shipping_method,
        quantity,
        status,
        order_date,
        amount_cents,
        tracking_number,
        carrier,
        shipped_date,
        session_id
      FROM orders
      ORDER BY invoice_number DESC
    `;

    const orders = rows.map(row => {
      // Format the order date
      const orderDate = new Date(row.order_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      // Format shipped date if available
      const shippedDate = row.shipped_date
        ? new Date(row.shipped_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          })
        : null;

      return {
        session_id: row.session_id || `hist_${row.invoice_number}`,
        order_id: `#${row.invoice_number}`,
        invoice_number: row.invoice_number,
        customer_email: row.customer_email,
        customer_name: row.customer_name,
        order_date: orderDate,
        amount: formatMoney(row.amount_cents),
        amount_cents: row.amount_cents,
        items_summary: row.items_summary,
        quantity: row.quantity,
        status: row.status,
        carrier: row.carrier || '',
        tracking_number: row.tracking_number || '',
        shipping_method: row.shipping_method,
        shipped_date: shippedDate,
        created_timestamp: new Date(row.order_date).getTime() / 1000
      };
    });

    res.status(200).json({ orders });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders', message: err.message });
  }
}

