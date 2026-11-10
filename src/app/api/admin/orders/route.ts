import { sql } from '@/server/db';
import { requireAdmin, noStore } from '@/server/adminGuard';
import { formatDate, formatMoney, type Row } from '@/server/dbRows';
import { errorMessage, jsonError } from '@/server/http';

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!sql) return jsonError(500, 'Database not configured');

  try {
    const rows = (await sql`
      SELECT invoice_number, customer_name, customer_email,
        COALESCE(customer_phone, '') AS customer_phone,
        COALESCE(billing_address, '') AS billing_address,
        COALESCE(shipping_address, '') AS shipping_address,
        items_summary, shipping_method, quantity, status, order_date, amount_cents,
        COALESCE(subtotal_cents, 0) AS subtotal_cents,
        COALESCE(shipping_cents, 0) AS shipping_cents,
        tracking_number, carrier, shipped_date, session_id
      FROM orders
      ORDER BY invoice_number DESC
    `) as Row[];

    const orders = rows.map((row) => ({
      session_id: row.session_id || `hist_${row.invoice_number}`,
      order_id: `#${row.invoice_number}`,
      invoice_number: row.invoice_number,
      customer_email: row.customer_email,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      billing_address: row.billing_address,
      shipping_address: row.shipping_address,
      order_date: formatDate(row.order_date),
      amount: formatMoney(row.amount_cents),
      amount_cents: row.amount_cents,
      subtotal: formatMoney(row.subtotal_cents),
      shipping: formatMoney(row.shipping_cents),
      items_summary: row.items_summary,
      quantity: row.quantity,
      status: row.status,
      carrier: row.carrier || '',
      tracking_number: row.tracking_number || '',
      shipping_method: row.shipping_method,
      shipped_date: row.shipped_date ? formatDate(row.shipped_date) : null,
    }));

    return Response.json({ orders }, { headers: noStore });
  } catch (err) {
    console.error('Error fetching orders:', err);
    return jsonError(500, 'Failed to fetch orders', { message: errorMessage(err) });
  }
}
