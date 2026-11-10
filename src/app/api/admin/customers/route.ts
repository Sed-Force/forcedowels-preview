import { sql } from '@/server/db';
import { requireAdmin, noStore } from '@/server/adminGuard';
import { formatDate, formatMoney, type Row } from '@/server/dbRows';
import { errorMessage, jsonError } from '@/server/http';

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!sql) return jsonError(500, 'Database not configured');

  try {
    // Two queries total (customers + all their orders) instead of one per customer.
    const [customers, orders] = (await Promise.all([
      sql`SELECT email, name, phone, total_orders, total_spent_cents, first_order_date, last_order_date
          FROM customers ORDER BY total_spent_cents DESC`,
      sql`SELECT LOWER(customer_email) AS email, invoice_number, order_date, amount_cents, status, items_summary
          FROM orders ORDER BY invoice_number DESC`,
    ])) as [Row[], Row[]];

    const ordersByEmail = new Map<string, Row[]>();
    for (const order of orders) {
      const list = ordersByEmail.get(order.email) ?? [];
      list.push(order);
      ordersByEmail.set(order.email, list);
    }

    return Response.json(
      {
        customers: customers.map((c) => ({
          email: c.email,
          name: c.name,
          phone: c.phone,
          order_count: c.total_orders,
          total_spent: formatMoney(c.total_spent_cents),
          first_order_date: formatDate(c.first_order_date, 'short'),
          last_order_date: formatDate(c.last_order_date, 'short'),
          orders: (ordersByEmail.get(String(c.email).toLowerCase()) ?? []).map((o) => ({
            order_id: `#${o.invoice_number}`,
            invoice_number: o.invoice_number,
            date: formatDate(o.order_date, 'short'),
            amount: formatMoney(o.amount_cents),
            status: o.status,
            items: o.items_summary,
          })),
        })),
      },
      { headers: noStore },
    );
  } catch (err) {
    console.error('Error fetching customers:', err);
    return jsonError(500, 'Failed to fetch customers', { message: errorMessage(err) });
  }
}
