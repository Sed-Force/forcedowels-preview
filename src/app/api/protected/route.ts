import { verifyAuth } from '@/server/auth';
import { jsonError } from '@/server/http';

/** Smoke-test endpoint: echoes the verified Clerk identity. */
export async function GET(request: Request) {
  const identity = await verifyAuth(request);
  if (!identity) return jsonError(401, 'Unauthorized');
  return Response.json({ ok: true, ...identity });
}
