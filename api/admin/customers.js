// /api/admin/customers.js
// Aggregate customer data with order history from Stripe
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

function formatMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  });
}

function shortId(sessionId = '') {
  const base = sessionId.replace('cs_test_', '').replace('cs_live_', '').replace(/[^a-zA-Z0-9]/g, '');
  return '#' + base.slice(-8).toUpperCase();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all completed checkout sessions
    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
      expand: ['data.line_items']
    });

    // Group orders by customer email
    const customerMap = new Map();

    sessions.data
      .filter(session => session.payment_status === 'paid')
      .forEach(session => {
        const email = session.customer_details?.email || session.customer_email || 'unknown@example.com';
        const name = session.customer_details?.name || session.shipping?.name || '';
        const metadata = session.metadata || {};
        
        if (!customerMap.has(email)) {
          customerMap.set(email, {
            email,
            name,
            orders: [],
            total_spent_cents: 0
          });
        }

        const customer = customerMap.get(email);
        
        // Update name if we have a better one
        if (name && !customer.name) {
          customer.name = name;
        }

        // Add order
        customer.orders.push({
          session_id: session.id,
          order_id: shortId(session.id),
          invoice_number: metadata.invoice_number || 'N/A',
          date: new Date(session.created * 1000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }),
          amount: formatMoney(session.amount_total),
          amount_cents: session.amount_total,
          status: metadata.shipping_status === 'shipped' ? 'shipped' : 'pending',
          created: session.created
        });

        customer.total_spent_cents += session.amount_total || 0;
      });

    // Convert to array and calculate stats
    const customers = Array.from(customerMap.values()).map(customer => {
      // Sort orders by date (newest first)
      customer.orders.sort((a, b) => b.created - a.created);
      
      return {
        email: customer.email,
        name: customer.name,
        order_count: customer.orders.length,
        total_spent: formatMoney(customer.total_spent_cents),
        last_order_date: customer.orders[0]?.date || 'N/A',
        orders: customer.orders.map(order => ({
          order_id: order.order_id,
          invoice_number: order.invoice_number,
          date: order.date,
          amount: order.amount,
          status: order.status
        }))
      };
    });

    // Sort by total spent (highest first)
    customers.sort((a, b) => {
      const aTotal = customerMap.get(a.email).total_spent_cents;
      const bTotal = customerMap.get(b.email).total_spent_cents;
      return bTotal - aTotal;
    });

    res.status(200).json({ customers });
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers', message: err.message });
  }
}

