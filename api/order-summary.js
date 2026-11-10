// api/order-summary.js
export const config = { runtime: 'nodejs' };

import Stripe from 'stripe';

// Format Stripe "amount in cents" to currency string
function fmtAmount(cents = 0, currency = 'usd') {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: currency.toUpperCase()
  });
}

function shortId(sessionId = '') {
  const base = sessionId.replace('cs_test_', '').replace('cs_live_', '').replace(/[^a-zA-Z0-9]/g, '');
  return base.slice(-8).toUpperCase();
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const sid = req.query.session_id;
    if (!sid) return res.status(400).json({ error: 'Missing session_id' });

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY env var' });

    const stripe = new Stripe(key, { apiVersion: '2024-06-20' });

    const session = await stripe.checkout.sessions.retrieve(sid, {
      expand: ['line_items.data.price.product']
    });

    const currency = session.currency || 'usd';
    const totalCents = session.amount_total ?? 0;

    const items = (session.line_items?.data || []).map(li => {
      const name = li.description || li.price?.product?.name || li.price?.nickname || 'Item';
      const desc = li.price?.product?.description || '';
      const lineTotalCents = li.amount_total ?? li.amount_subtotal ?? 0;

      return {
        name,
        desc,
        qty: li.quantity || 1,
        total: fmtAmount(lineTotalCents, currency)
      };
    });

    return res.status(200).json({
      id: session.id,
      short_id: shortId(session.id),
      payment_status: session.payment_status,
      amount_formatted: fmtAmount(totalCents, currency),
      customer_email: session.customer_details?.email || session.customer_email || '',
      items
    });

  } catch (err) {
    console.error('ORDER_SUMMARY_ERROR', err);
    return res.status(500).json({ error: 'Unable to load order summary.' });
  }
}
