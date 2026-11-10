import { sql } from '@/server/db';
import { requireAdmin, noStore } from '@/server/adminGuard';
import { type Row } from '@/server/dbRows';
import { errorMessage, jsonError, readJson } from '@/server/http';

const STATUSES = ['pending', 'shipped', 'cancelled'];

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!sql) return jsonError(500, 'Database not configured');

  const body = await readJson<{ invoice_number?: number; status?: string }>(request);
  if (!body?.invoice_number) return jsonError(400, 'Missing invoice_number');
  if (!body.status || !STATUSES.includes(body.status)) return jsonError(400, 'Invalid status');

  try {
    const rows = (await sql`
      UPDATE orders SET status = ${body.status}, updated_at = NOW()
      WHERE invoice_number = ${body.invoice_number}
      RETURNING invoice_number, status, customer_email
    `) as Row[];
    if (rows.length === 0) return jsonError(404, 'Order not found');

    return Response.json(
      { success: true, message: `Order #${body.invoice_number} status updated to ${body.status}`, order: rows[0] },
      { headers: noStore },
    );
  } catch (err) {
    console.error('Error updating order status:', err);
    return jsonError(500, 'Failed to update order status', { message: errorMessage(err) });
  }
}
