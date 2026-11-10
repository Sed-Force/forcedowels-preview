import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Admin session = HMAC-signed, expiring token stored in an httpOnly cookie.
 * Kept free of `server-only` so proxy.ts can verify it too.
 */
export const ADMIN_COOKIE = 'fd_admin';
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

const b64 = (input: string | Buffer) => Buffer.from(input).toString('base64url');

function sign(payload: string): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(username: string): string | null {
  const payload = b64(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS }));
  const signature = sign(payload);
  return signature ? `${payload}.${signature}` : null;
}

export function verifySessionToken(token: string | undefined | null): { username: string } | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  const expected = payload ? sign(payload) : null;
  if (!payload || !signature || !expected) return null;

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof u === 'string' && typeof exp === 'number' && exp > Date.now() / 1000 ? { username: u } : null;
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | undefined {
  return header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** Constant-time comparison against ADMIN_USERNAME / ADMIN_PASSWORD. */
export function checkCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) return false;

  const safeEqual = (x: string, y: string) => {
    const hx = createHmac('sha256', 'cmp').update(x).digest();
    const hy = createHmac('sha256', 'cmp').update(y).digest();
    return timingSafeEqual(hx, hy);
  };
  // Evaluate both so timing does not reveal which field was wrong.
  const userOk = safeEqual(username, expectedUser);
  const passOk = safeEqual(password, expectedPass);
  return userOk && passOk;
}
