import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, checkCredentials, createSessionToken } from '@/server/adminSession';
import { jsonError, readJson } from '@/server/http';

const cookieBase = () =>
  `Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

/** Sign in: sets the signed httpOnly session cookie. */
export async function POST(request: Request) {
  const body = await readJson<{ username?: string; password?: string }>(request);
  if (!body) return jsonError(400, 'Invalid JSON body');

  const { username, password } = body;
  if (!username || !password) {
    return Response.json({ success: false, message: 'Username and password are required' }, { status: 400 });
  }

  if (!checkCredentials(username, password)) {
    // Small delay to slow down brute-force attempts.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return Response.json({ success: false, message: 'Invalid username or password' }, { status: 401 });
  }

  const token = createSessionToken(username);
  if (!token) {
    console.error('ADMIN_SESSION_SECRET is not configured; admin sign-in is disabled.');
    return Response.json({ success: false, message: 'Admin sign-in is not configured' }, { status: 500 });
  }

  return Response.json(
    { success: true },
    { headers: { 'Set-Cookie': `${ADMIN_COOKIE}=${token}; ${cookieBase()}; Max-Age=${ADMIN_SESSION_SECONDS}` } },
  );
}

/** Sign out: expires the session cookie. */
export async function DELETE() {
  return Response.json({ success: true }, { headers: { 'Set-Cookie': `${ADMIN_COOKIE}=; ${cookieBase()}; Max-Age=0` } });
}
