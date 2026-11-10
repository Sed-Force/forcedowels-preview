import { verifyAuth, json, applyCORS } from './_lib/auth.js';

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { userId, email } = await verifyAuth(req);
    return json(res, 200, { ok: true, userId, email });
  } catch (err) {
    return json(res, err.statusCode || 401, { error: err.message || 'Unauthorized' });
  }
}
