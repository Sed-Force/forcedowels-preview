// /api/admin/sales-analytics.js
// Sales analytics from Stripe data
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

function formatMoney(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { period } = req.query; // 'day', 'week', 'month', 'year', 'all'
    
    // Calculate date range based on period
    let startDate = null;
    const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds
    
    switch (period) {
      case 'day':
        startDate = now - (24 * 60 * 60); // Last 24 hours
        break;
      case 'week':
        startDate = now - (7 * 24 * 60 * 60); // Last 7 days
        break;
      case 'month':
        startDate = now - (30 * 24 * 60 * 60); // Last 30 days
        break;
      case 'year':
        startDate = now - (365 * 24 * 60 * 60); // Last 365 days
        break;
      case 'all':
      default:
        startDate = 0; // All time
        break;
    }

    // Fetch all completed checkout sessions
    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
      created: startDate > 0 ? { gte: startDate } : undefined,
      expand: ['data.line_items']
    });

    // Calculate metrics
    let totalRevenue = 0;
    let totalOrders = 0;
    let totalItems = 0;
    const ordersByDate = {};
    const revenueByDate = {};

    sessions.data.forEach(session => {
      if (session.payment_status === 'paid') {
        totalOrders++;
        totalRevenue += session.amount_total || 0;

        // Count items
        if (session.line_items && session.line_items.data) {
          session.line_items.data.forEach(item => {
            totalItems += item.quantity || 0;
          });
        }

        // Group by date
        const date = new Date(session.created * 1000).toISOString().split('T')[0];
        ordersByDate[date] = (ordersByDate[date] || 0) + 1;
        revenueByDate[date] = (revenueByDate[date] || 0) + (session.amount_total || 0);
      }
    });

    // Calculate average order value
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Prepare chart data (last 30 days or available data)
    const chartData = [];
    const sortedDates = Object.keys(revenueByDate).sort();
    
    sortedDates.forEach(date => {
      chartData.push({
        date: date,
        revenue: formatMoney(revenueByDate[date]),
        orders: ordersByDate[date]
      });
    });

    return res.status(200).json({
      period: period || 'all',
      metrics: {
        totalRevenue: formatMoney(totalRevenue),
        totalOrders: totalOrders,
        totalItems: totalItems,
        averageOrderValue: formatMoney(averageOrderValue)
      },
      chartData: chartData
    });
  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch sales analytics',
      message: error.message 
    });
  }
}

