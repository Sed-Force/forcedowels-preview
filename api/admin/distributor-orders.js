// /api/admin/distributor-orders.js
// Manage distributor purchase history
import { sql } from '../_lib/db.js';

export default async function handler(req, res) {
  if (!sql) {
    return res.status(500).json({ error: 'No database connection' });
  }

  try {
    // Parse body for POST requests
    let body = {};
    if (req.method === 'POST') {
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

    // GET: Fetch orders for a specific distributor
    if (req.method === 'GET') {
      const { distributor_id } = req.query;
      
      if (!distributor_id) {
        return res.status(400).json({ error: 'distributor_id is required' });
      }

      const orders = await sql`
        SELECT 
          id,
          order_id,
          stripe_session_id,
          TO_CHAR(order_date, 'Mon DD, YYYY') as order_date,
          total_amount,
          items,
          status
        FROM distributor_orders
        WHERE distributor_id = ${distributor_id}
        ORDER BY order_date DESC
      `;

      return res.status(200).json({ orders });
    }

    // POST: Add a new order for a distributor
    if (req.method === 'POST') {
      const { distributor_id, order_id, stripe_session_id, total_amount, items, status } = body;

      if (!distributor_id || !order_id) {
        return res.status(400).json({ error: 'distributor_id and order_id are required' });
      }

      const result = await sql`
        INSERT INTO distributor_orders (
          distributor_id, order_id, stripe_session_id, total_amount, items, status
        ) VALUES (
          ${distributor_id}, ${order_id}, ${stripe_session_id || null}, 
          ${total_amount || 0}, ${items || null}, ${status || 'completed'}
        )
        RETURNING id
      `;

      return res.status(200).json({ 
        success: true, 
        message: 'Order added successfully',
        order_id: result[0].id
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error managing distributor orders:', error);
    return res.status(500).json({ 
      error: 'Failed to manage distributor orders',
      message: error.message 
    });
  }
}

