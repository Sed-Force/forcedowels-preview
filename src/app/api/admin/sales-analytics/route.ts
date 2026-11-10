import { sql } from '@/server/db';
import { requireAdmin, noStore } from '@/server/adminGuard';
import { type Row } from '@/server/dbRows';
import { errorMessage, jsonError } from '@/server/http';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
const dollars = (cents: number) => (cents / 100).toFixed(2);

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!sql) return jsonError(500, 'Database not configured');

  const period = new URL(request.url).searchParams.get('period') || 'all';
  const days = PERIOD_DAYS[period];
  const start = days ? new Date(Date.now() - days * DAY_MS) : new Date('2000-01-01');
  const startDate = start.toISOString().split('T')[0];

  try {
    const orders = (await sql`
      SELECT invoice_number, customer_name, customer_email, items_summary, shipping_method, quantity,
             status, order_date, amount_cents, tracking_number, carrier, shipped_date
      FROM orders
      WHERE order_date >= ${startDate}
      ORDER BY order_date DESC, invoice_number DESC
    `) as Row[];

    let revenue = 0;
    let count = 0;
    let items = 0;
    const byDate = new Map<string, { revenue: number; orders: Row[] }>();

    for (const order of orders) {
      if (order.status === 'cancelled') continue; // pending, paid and shipped all count
      count++;
      revenue += order.amount_cents || 0;
      items += order.quantity || 0;
      const key = String(order.order_date);
      const day = byDate.get(key) ?? { revenue: 0, orders: [] };
      day.revenue += order.amount_cents || 0;
      day.orders.push({
        invoice_number: order.invoice_number,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        items_summary: order.items_summary,
        shipping_method: order.shipping_method,
        quantity: order.quantity,
        status: order.status,
        amount: dollars(order.amount_cents || 0),
        tracking_number: order.tracking_number || '',
        carrier: order.carrier || '',
        shipped_date: order.shipped_date || null,
      });
      byDate.set(key, day);
    }

    const chartData = [...byDate.entries()]
      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
      .map(([date, day]) => ({ date, revenue: dollars(day.revenue), orders: day.orders.length, orderDetails: day.orders }));

    return Response.json(
      {
        period,
        metrics: {
          totalRevenue: dollars(revenue),
          totalOrders: count,
          totalItems: items,
          averageOrderValue: dollars(count > 0 ? revenue / count : 0),
        },
        chartData,
      },
      { headers: noStore },
    );
  } catch (err) {
    console.error('Error fetching sales analytics:', err);
    return jsonError(500, 'Failed to fetch sales analytics', { message: errorMessage(err) });
  }
}
