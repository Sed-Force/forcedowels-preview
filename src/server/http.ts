import 'server-only';

/** Standard JSON error body used by every route handler. */
export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

/** Parse a JSON request body, returning null when it is missing or malformed. */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export const toStr = (value: unknown): string => (value ?? '').toString().trim();

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Public site origin used for absolute links in e-mails and Stripe redirects. */
export function siteBaseUrl(request?: Request): string {
  const configured = (process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (request) {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const proto = (request.headers.get('x-forwarded-proto') || 'https').split(',')[0];
    if (host) return `${proto}://${host}`;
  }
  return configured || 'https://forcedowels.com';
}
