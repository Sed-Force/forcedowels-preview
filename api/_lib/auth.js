// /api/_lib/auth.js
// Small helpers for JSON, CORS, and (optional) Clerk token verification.

import { verifyToken } from '@clerk/backend';

// Send JSON with status
export function json(res, status = 200, data = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

// Simple CORS (allow browser POSTs)
export function applyCORS(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

// Verify Clerk JWT from Authorization: Bearer <token>
// Returns { userId, email } or null if not available/invalid.
export async function verifyAuth(req) {
  try {
    const hdr = req.headers.authorization || '';
    const m = hdr.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    const token = m[1];
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return null;

    const payload = await verifyToken(token, { secretKey });
    // Common fields: sub (user id), email (string or array), email_address
    const userId = payload?.sub || null;
    const email =
      payload?.email_address ||
      (Array.isArray(payload?.email) ? payload.email[0] : payload?.email) ||
      null;

    return (userId || email) ? { userId, email } : null;
  } catch {
    return null;
  }
}

