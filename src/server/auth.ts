import 'server-only';
import { verifyToken } from '@clerk/backend';

export interface Identity {
  userId: string | null;
  email: string | null;
}

/**
 * Verify the Clerk session JWT from `Authorization: Bearer <token>`.
 * Returns the caller's identity, or null when absent/invalid (guest).
 */
export async function verifyAuth(request: Request): Promise<Identity | null> {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!match || !secretKey) return null;

  try {
    const { data: payload, errors } = await verifyToken(match[1], { secretKey });
    if (errors || !payload) return null;

    const claims = payload as Record<string, unknown>;
    const rawEmail = claims.email_address ?? claims.email;
    const email = (Array.isArray(rawEmail) ? rawEmail[0] : rawEmail) as string | undefined;
    const userId = typeof claims.sub === 'string' ? claims.sub : null;
    return userId || email ? { userId, email: email ?? null } : null;
  } catch {
    return null;
  }
}
