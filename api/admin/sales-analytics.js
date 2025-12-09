// /api/admin/sales-analytics.js
// Sales analytics from database orders
import { sql } from '../_lib/db.js';

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
    const now = new Date();

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        break;
      case 'week':
        startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        break;
      case 'month':
        startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        break;
      case 'year':
        startDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
        break;
      case 'all':
      default:
        startDate = new Date('2000-01-01'); // All time
        break;
    }

    const startDateStr = startDate.toISOString().split('T')[0];

    // Fetch full order details for the period
    const fullOrders = await sql`
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
        shipped_date
      FROM orders
      WHERE order_date >= ${startDateStr}
      ORDER BY order_date DESC, invoice_number DESC
    `;

    // Calculate metrics
    let totalRevenue = 0;
    let totalOrders = 0;
    let totalItems = 0;
    const ordersByDate = {};
    const revenueByDate = {};
    const orderDetailsByDate = {};

    fullOrders.forEach(order => {
      // Count all orders except cancelled ones (include pending, paid, and shipped)
      if (order.status !== 'cancelled') {
        totalOrders++;
        totalRevenue += order.amount_cents || 0;
        totalItems += order.quantity || 0;

        // Group by date
        const date = order.order_date;
        ordersByDate[date] = (ordersByDate[date] || 0) + 1;
        revenueByDate[date] = (revenueByDate[date] || 0) + (order.amount_cents || 0);

        // Store order details by date
        if (!orderDetailsByDate[date]) {
          orderDetailsByDate[date] = [];
        }
        orderDetailsByDate[date].push({
          invoice_number: order.invoice_number,
          customer_name: order.customer_name,
          customer_email: order.customer_email,
          items_summary: order.items_summary,
          shipping_method: order.shipping_method,
          quantity: order.quantity,
          status: order.status,
          amount: formatMoney(order.amount_cents),
          amount_cents: order.amount_cents,
          tracking_number: order.tracking_number || '',
          carrier: order.carrier || '',
          shipped_date: order.shipped_date || null
        });
      }
    });

    // Calculate average order value
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Prepare chart data (sort dates descending - newest first)
    const chartData = [];
    const sortedDates = Object.keys(revenueByDate).sort((a, b) => {
      // Sort dates in descending order (newest first)
      return new Date(b) - new Date(a);
    });

    sortedDates.forEach(date => {
      chartData.push({
        date: date,
        revenue: formatMoney(revenueByDate[date]),
        orders: ordersByDate[date],
        orderDetails: orderDetailsByDate[date] || []
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

