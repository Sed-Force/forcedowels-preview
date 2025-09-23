// /api/_lib/auth.js — MASTER
import { verifyToken, createClerkClient } from '@clerk/backend';

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

export async function verifyAuth(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid Authorization header');
    err.statusCode = 401;
    throw err;
  }
  const token = authHeader.slice('Bearer '.length).trim();

  const claims = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });

  const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });
  const user = await clerk.users.getUser(claims.sub);

  return { userId: claims.sub, email: user?.primaryEmailAddress?.emailAddress || null };
}

export function json(res, status, body, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders };
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

export function applyCORS(req, res) {
  const origin = req.headers.origin || '';
  const allowedProd = process.env.NEXT_PUBLIC_BASE_URL;
  const isPreview = /\.vercel\.app$/.test(origin);
  const isProd = allowedProd && origin === allowedProd;

  if (isProd || isPreview) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }
  return false;
}

