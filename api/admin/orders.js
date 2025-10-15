// /api/admin/orders.js
// Fetch all orders from Stripe checkout sessions
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
    // Fetch all completed checkout sessions (last 100)
    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
      expand: ['data.line_items']
    });

    const orders = sessions.data
      .filter(session => session.payment_status === 'paid')
      .map(session => {
        const metadata = session.metadata || {};
        const status = metadata.shipping_status === 'shipped' ? 'shipped' : 'pending';
        const trackingNumber = metadata.tracking_number || '';
        const carrier = metadata.carrier || '';
        const invoiceNumber = metadata.invoice_number || 'N/A';

        // Get customer info
        const customerEmail = session.customer_details?.email || session.customer_email || 'N/A';
        const customerName = session.customer_details?.name || session.shipping?.name || '';

        // Format date
        const orderDate = new Date(session.created * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });

        // Get items summary
        const lineItems = session.line_items?.data || [];
        let itemsSummary = '';

        if (lineItems.length > 0) {
          itemsSummary = lineItems.map(item => {
            const name = item.description || item.price?.product?.name || 'Item';
            const qty = item.quantity || 1;
            return qty > 1 ? `${name} (${qty})` : name;
          }).join(', ');
        } else {
          itemsSummary = 'No items';
        }

        return {
          session_id: session.id,
          order_id: shortId(session.id),
          invoice_number: invoiceNumber,
          customer_email: customerEmail,
          customer_name: customerName,
          order_date: orderDate,
          amount: formatMoney(session.amount_total),
          items_summary: itemsSummary,
          status: status,
          carrier: carrier,
          tracking_number: trackingNumber,
          created_timestamp: session.created
        };
      })
      .sort((a, b) => {
        // Sort by date (newest first)
        return b.created_timestamp - a.created_timestamp;
      });

    res.status(200).json({ orders });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders', message: err.message });
  }
}

