import 'server-only';
import { Resend } from 'resend';

let client: Resend | null = null;

export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client ??= new Resend(key);
  return client;
}

export const parseList = (value: string | undefined): string[] =>
  String(value || '').split(',').map((s) => s.trim()).filter(Boolean);

export const escapeHtml = (s: unknown = ''): string =>
  String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export const emailBranding = () => {
  const siteBase = (process.env.NEXT_PUBLIC_BASE_URL || 'https://forcedowels.com').replace(/\/+$/, '');
  return {
    blue: process.env.EMAIL_PRIMARY_COLOR || '#1C4A99',
    logoUrl: process.env.EMAIL_LOGO_URL || `${siteBase}/images/LOGO_Wordmark+Icon-WhiteAccent@1024.png`,
    logoHeight: Number(process.env.EMAIL_LOGO_HEIGHT || 48),
  };
};

/** Prefix applied to subjects outside production so test mail is obvious. */
export const subjectPrefix = () =>
  process.env.EMAIL_TAG_PREFIX ?? (process.env.VERCEL_ENV === 'preview' ? '[PREVIEW] ' : '');
