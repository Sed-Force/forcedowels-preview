// /api/_lib/oauth-usps.js
// Simple USPS OAuth2 (Client Credentials) token fetcher with in-memory cache.

let _token = null;
let _tokenExp = 0;

export async function getUspsOAuthToken() {
  const clientId = process.env.USPS_CONSUMER_KEY;
  const clientSecret = process.env.USPS_CONSUMER_SECRET;
  const tokenUrl = process.env.USPS_PORTAL_TOKEN_URL; // e.g., from your USPS developer portal docs

  if (!clientId || !clientSecret || !tokenUrl) {
    throw new Error("USPS portal OAuth2 env missing: USPS_CONSUMER_KEY, USPS_CONSUMER_SECRET, USPS_PORTAL_TOKEN_URL");
  }

  const now = Date.now() / 1000;
  if (_token && now < (_tokenExp - 60)) return _token; // reuse if >60s left

  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const r = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const j = await r.json();
  if (!r.ok) {
    throw new Error(`USPS OAuth token error ${r.status}: ${JSON.stringify(j)}`);
  }
  if (!j.access_token) throw new Error("USPS OAuth token response missing access_token");

  _token = j.access_token;
  _tokenExp = typeof j.expires_in === "number" ? now + j.expires_in : now + 300; // default 5 min

  return _token;
}
