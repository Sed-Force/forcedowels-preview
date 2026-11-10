import { nextCounter, sql } from '@/server/db';
import { requireAdmin } from '@/server/adminGuard';
import { errorMessage, jsonError, readJson } from '@/server/http';

interface InvoiceBody {
  customer_name?: string; customer_email?: string; billing_address?: string; shipping_address?: string;
  quantity?: number; amount_cents?: number; order_date?: string; shipping_method?: string;
  carrier?: string; tracking_number?: string; status?: string; shipped_date?: string;
}

function summarize(quantity: number): string {
  if (quantity >= 165000) return `165,000+ (${quantity}) (Qty: ${quantity})`;
  if (quantity >= 25000) return `25,000-164,999 (${quantity}) (Qty: ${quantity})`;
  if (quantity >= 5000) return `5,000-20,000 (${quantity}) (Qty: ${quantity})`;
  if (quantity % 300 === 0) return `Kit - 300 units (${quantity}) (Qty: ${quantity})`;
  return `Custom Order (Qty: ${quantity})`;
}

/** Record an off-site sale as an order + update the customer's totals. */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!sql) return jsonError(500, 'Database not configured');

  const body = await readJson<InvoiceBody>(request);
  const {
    customer_name, customer_email, billing_address = '', shipping_address = '', quantity, amount_cents,
    order_date, shipping_method = 'Stripe Link', carrier = 'UPS', tracking_number = '', status = 'shipped', shipped_date,
  } = body ?? {};

  if (!customer_name || !customer_email || !quantity || !amount_cents || !order_date) {
    return jsonError(400, 'Missing required fields: customer_name, customer_email, quantity, amount_cents, order_date');
  }

  try {
    const counterKey = process.env.VERCEL_ENV === 'production' ? 'invoice_prod' : 'invoice_preview';
    const invoiceNumber = await nextCounter(counterKey);

    await sql`
      INSERT INTO orders (invoice_number, customer_name, customer_email, billing_address, shipping_address,
        items_summary, shipping_method, quantity, status, order_date, amount_cents, tracking_number, carrier,
        shipped_date, session_id)
      VALUES (${invoiceNumber}, ${customer_name}, ${customer_email}, ${billing_address}, ${shipping_address},
        ${summarize(quantity)}, ${shipping_method}, ${quantity}, ${status}, ${order_date}, ${amount_cents},
        ${tracking_number}, ${carrier}, ${shipped_date || order_date}, ${`manual_${invoiceNumber}`})`;

    await sql`
      INSERT INTO customers (email, name, total_orders, total_spent_cents, first_order_date, last_order_date)
      VALUES (${customer_email}, ${customer_name}, 1, ${amount_cents}, ${order_date}, ${order_date})
      ON CONFLICT (email) DO UPDATE SET
        total_orders = customers.total_orders + 1,
        total_spent_cents = customers.total_spent_cents + EXCLUDED.total_spent_cents,
        last_order_date = GREATEST(customers.last_order_date, EXCLUDED.last_order_date),
        first_order_date = LEAST(customers.first_order_date, EXCLUDED.first_order_date)`;

    return Response.json({ success: true, invoice_number: invoiceNumber, message: `Invoice #${invoiceNumber} created successfully` });
  } catch (err) {
    console.error('Error adding manual invoice:', err);
    return jsonError(500, 'Failed to add invoice', { details: errorMessage(err) });
  }
}
