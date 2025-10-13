// /api/_lib/oauth-usps.js
// USPS OAuth2 (Client Credentials) with robust fallbacks.
// - Always posts application/x-www-form-urlencoded
// - Tries HTTP Basic first, then body client_id/client_secret fallback
// - Allows specifying scope via USPS_PORTAL_SCOPE (default: "prices")

let _token = null;
let _exp = 0;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export async function getUspsOAuthToken() {
  const clientId = process.env.USPS_CONSUMER_KEY;
  const clientSecret = process.env.USPS_CONSUMER_SECRET;
  const tokenUrl = process.env.USPS_PORTAL_TOKEN_URL;
  const scope = (process.env.USPS_PORTAL_SCOPE || "prices").trim();

  if (!clientId || !clientSecret || !tokenUrl) {
    throw new Error("USPS portal OAuth2 env missing: USPS_CONSUMER_KEY, USPS_CONSUMER_SECRET, USPS_PORTAL_TOKEN_URL");
  }

  // Use cached token if still valid (>60s left)
  if (_token && nowSec() < _exp - 60) return _token;

  // Always form-encoded body
  const baseFields = new URLSearchParams({ grant_type: "client_credentials" });
  if (scope) baseFields.set("scope", scope);

  // Attempt #1: HTTP Basic (most common)
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  let r = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: baseFields.toString(),
  });

  let j, ok = r.ok;
  try { j = await r.json(); } catch { j = null; }

  // If USPS returns invalid_request (400) or unauthorized (401),
  // try Attempt #2: credentials in body (no Basic header)
  if (!ok && (r.status === 400 || r.status === 401)) {
    const body2 = new URLSearchParams(baseFields);
    body2.set("client_id", clientId);
    body2.set("client_secret", clientSecret);

    r = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body2.toString(),
    });

    ok = r.ok;
    try { j = await r.json(); } catch { j = null; }
  }

  if (!ok || !j || !j.access_token) {
    throw new Error(
      `USPS OAuth token error ${r.status}: ${JSON.stringify(j || { error: "no-json" })}`
    );
  }

  _token = j.access_token;
  const expiresIn = Number(j.expires_in || 300); // fallback 5 min
  _exp = nowSec() + expiresIn;
  return _token;
}
