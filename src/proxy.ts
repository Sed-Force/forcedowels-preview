import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifySessionToken } from '@/server/adminSession';

/**
 * Optimistic gate for admin pages: no valid session cookie → login page.
 * (Every /api/admin route re-checks the session itself.)
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === '/admin/login';
  const signedIn = !!verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value);

  if (!signedIn && !isLogin) return NextResponse.redirect(new URL('/admin/login', request.url));
  if (signedIn && isLogin) return NextResponse.redirect(new URL('/admin', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/admin', '/admin/:path*'] };
