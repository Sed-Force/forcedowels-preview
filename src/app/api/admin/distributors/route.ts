import { sql } from '@/server/db';
import { requireAdmin, noStore } from '@/server/adminGuard';
import { type Row } from '@/server/dbRows';
import { errorMessage, jsonError, readJson } from '@/server/http';

const STATUSES = ['pending', 'approved', 'rejected'];

interface DistributorBody {
  id?: number; company_name?: string; contact_name?: string; email?: string; phone?: string;
  territory?: string; status?: string; notes?: string;
}

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!sql) return jsonError(500, 'Database not configured');

  try {
    const distributors = (await sql`
      SELECT id, company_name, contact_name, email, phone, territory, status, notes,
             TO_CHAR(created_at, 'Mon DD, YYYY') AS created_at
      FROM distributors ORDER BY created_at DESC
    `) as Row[];
    return Response.json({ distributors }, { headers: noStore });
  } catch (err) {
    console.error('Error fetching distributors:', err);
    return jsonError(500, 'Failed to fetch distributors', { message: errorMessage(err) });
  }
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!sql) return jsonError(500, 'Database not configured');

  const b = await readJson<DistributorBody>(request);
  if (!b?.company_name || !b.email) return jsonError(400, 'Company name and email are required');
  if (b.status && !STATUSES.includes(b.status)) return jsonError(400, 'Invalid status');

  try {
    const rows = (await sql`
      INSERT INTO distributors (company_name, contact_name, email, phone, territory, status, notes)
      VALUES (${b.company_name}, ${b.contact_name || null}, ${b.email}, ${b.phone || null},
              ${b.territory || null}, ${b.status || 'pending'}, ${b.notes || null})
      RETURNING id
    `) as Row[];
    return Response.json({ success: true, id: rows[0].id, message: 'Distributor added successfully' }, { status: 201 });
  } catch (err) {
    console.error('Error adding distributor:', err);
    return jsonError(500, 'Failed to add distributor', { message: errorMessage(err) });
  }
}

export async function PUT(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!sql) return jsonError(500, 'Database not configured');

  const b = await readJson<DistributorBody>(request);
  if (!b?.id) return jsonError(400, 'Distributor ID is required');
  if (!b.company_name || !b.email) return jsonError(400, 'Company name and email are required');
  if (!b.status || !STATUSES.includes(b.status)) return jsonError(400, 'Invalid status');

  try {
    const rows = (await sql`
      UPDATE distributors SET
        company_name = ${b.company_name}, contact_name = ${b.contact_name || null}, email = ${b.email},
        phone = ${b.phone || null}, territory = ${b.territory || null}, status = ${b.status},
        notes = ${b.notes || null}, updated_at = NOW()
      WHERE id = ${b.id}
      RETURNING id, status
    `) as Row[];
    if (rows.length === 0) return jsonError(404, 'Distributor not found');
    return Response.json({ success: true, message: 'Distributor updated successfully', updated: rows[0] });
  } catch (err) {
    console.error('Error updating distributor:', err);
    return jsonError(500, 'Failed to update distributor', { message: errorMessage(err) });
  }
}
