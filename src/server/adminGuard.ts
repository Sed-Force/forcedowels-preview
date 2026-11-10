import 'server-only';
import { ADMIN_COOKIE, readCookie, verifySessionToken } from './adminSession';
import { jsonError } from './http';

/** Returns a 401 Response when the request has no valid admin session, otherwise null. */
export function requireAdmin(request: Request): Response | null {
  const token = readCookie(request.headers.get('cookie'), ADMIN_COOKIE);
  return verifySessionToken(token) ? null : jsonError(401, 'Unauthorized');
}

export const noStore = { 'Cache-Control': 'no-store' } as const;
