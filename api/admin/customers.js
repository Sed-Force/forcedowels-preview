// /api/admin/customers.js
// Fetch customer data from database with order history
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

    // Add phone column to customers if it doesn't exist
    try {
      await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT`;
    } catch (e) {
      // Column may already exist, ignore
    }

    // Fetch all customers with their stats
    const customersData = await sql`
      SELECT
        email,
        name,
        phone,
        total_orders,
        total_spent_cents,
        first_order_date,
        last_order_date
      FROM customers
      ORDER BY total_spent_cents DESC
    `;

    // Fetch all orders for each customer
    const customers = [];

    for (const customer of customersData) {
      const orders = await sql`
        SELECT
          invoice_number,
          order_date,
          amount_cents,
          status,
          items_summary
        FROM orders
        WHERE LOWER(customer_email) = LOWER(${customer.email})
        ORDER BY invoice_number DESC
      `;

      customers.push({
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        order_count: customer.total_orders,
        total_spent: formatMoney(customer.total_spent_cents),
        first_order_date: new Date(customer.first_order_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }),
        last_order_date: new Date(customer.last_order_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }),
        orders: orders.map(order => ({
          order_id: `#${order.invoice_number}`,
          invoice_number: order.invoice_number,
          date: new Date(order.order_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }),
          amount: formatMoney(order.amount_cents),
          status: order.status,
          items: order.items_summary
        }))
      });
    }

    res.status(200).json({ customers });
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers', message: err.message });
  }
}

