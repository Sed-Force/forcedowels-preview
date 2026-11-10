// /api/_lib/oauth-usps.js
// USPS OAuth2 (Client Credentials) with JSON body
// Uses https://apis.usps.com/oauth2/v3/token

let _token = null;
let _exp = 0;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export async function getUspsOAuthToken() {
  const clientId = process.env.USPS_CLIENT_ID;
  const clientSecret = process.env.USPS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("USPS OAuth2 env missing: USPS_CLIENT_ID, USPS_CLIENT_SECRET");
  }

  // Use cached token if still valid (>60s left)
  if (_token && nowSec() < _exp - 60) return _token;

  // USPS requires JSON body at https://apis.usps.com (note the 's')
  const tokenUrl = 'https://apis.usps.com/oauth2/v3/token';

  const body = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials'
  };

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `USPS OAuth token error ${response.status}: ${errorText}`
    );
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('USPS OAuth response missing access_token');
  }

  _token = data.access_token;
  _exp = nowSec() + Number(data.expires_in || 28800);
  return _token;
}
