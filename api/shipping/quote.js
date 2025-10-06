// /api/shipping/quote.js
// Returns shipping quotes + clear carrier status messages
// runtime: Node (Vercel Functions)
export const config = { runtime: 'nodejs' };

const asJSON = (res, code, obj) => {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj, null, 2));
};

// ---- helpers ---------------------------------------------------------------
function safeStr(v) { return (v ?? '').toString().trim(); }
function hasAll(obj) { return Object.values(obj).every(Boolean); }

// Simple placeholder LTL logic — keeps your current UI working
function quoteTQL({ destination, items }) {
  // ultra-simple demo price: $92 flat (you can replace with live later)
  return [{ carrier: 'TQL', service: 'LTL Freight (placeholder)', amount: 92.0, currency: 'USD' }];
}

// ---- handler ---------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return asJSON(res, 405, { error: 'Method not allowed' });
  }

  let body = {};
  try { body = JSON.parse(req.body || '{}'); } catch { body = req.body || {}; }

  const destination = body.destination || {};
  const items       = Array.isArray(body.items) ? body.items : [];

  // Basic validation
  const destOk =
    !!safeStr(destination.country) &&
    !!safeStr(destination.postal);

  if (!items.length) {
    return asJSON(res, 400, { error: 'Missing items[]' });
  }
  if (!destOk) {
    return asJSON(res, 400, { error: 'Missing destination (country, postal)' });
  }

  // ---- ENV presence checks (so we can return human-readable reasons) ----
  const upsEnv = {
    clientId:      !!process.env.UPS_CLIENT_ID,
    clientSecret:  !!process.env.UPS_CLIENT_SECRET,
    shipperNumber: !!process.env.UPS_ACCOUNT_NUMBER,
    env:           process.env.UPS_ENV || 'test',
  };
  const uspsEnv = {
    webtoolsUserId: !!process.env.USPS_WEBTOOLS_USERID, // USPS uses WebTools USERID
  };
  const shipFromEnv = {
    name:    !!process.env.SHIP_FROM_NAME,
    street:  !!process.env.SHIP_FROM_STREET,
    city:    !!process.env.SHIP_FROM_CITY,
    state:   !!process.env.SHIP_FROM_STATE,
    postal:  !!process.env.SHIP_FROM_ZIP,
    country: !!process.env.SHIP_FROM_COUNTRY,
  };

  // ---- Build response ------------------------------------------------------
  const rates = [];
  const status = {
    ups:  { available: false, message: '' },
    usps: { available: false, message: '' },
    tql:  { available: true,  message: null },
  };

  // Always include TQL placeholder so checkout flow keeps working
  rates.push(...quoteTQL({ destination, items }));

  // ---------- UPS status (reasons) ----------
  // We only mark "available: true" if we *actually* produced at least one UPS rate.
  // For step 2 we don’t call UPS — we only provide a precise reason so you can fix env/permissions.
  if (!upsEnv.clientId || !upsEnv.clientSecret || !upsEnv.shipperNumber) {
    status.ups.message =
      'Missing UPS env vars: UPS_CLIENT_ID / UPS_CLIENT_SECRET / UPS_ACCOUNT_NUMBER';
  } else if (!hasAll(shipFromEnv)) {
    status.ups.message =
      'Missing ship-from address env vars (SHIP_FROM_*).';
  } else {
    // Credentials exist. We’re not calling UPS in Step 2, so be explicit:
    status.ups.message =
      'Credentials detected. Enable live UPS rating in the next step (or run /api/shipping/selftest to verify OAuth & permissions).';
  }

  // ---------- USPS status (reasons) ----------
  if (!uspsEnv.webtoolsUserId) {
    status.usps.message =
      'Missing USPS_WEBTOOLS_USERID (USPS uses WebTools, not OAuth).';
  } else if (!hasAll(shipFromEnv)) {
    status.usps.message =
      'Missing ship-from address env vars (SHIP_FROM_*).';
  } else if ((destination.country || 'US').toUpperCase() !== 'US') {
    status.usps.message = 'USPS domestic RateV4 only quotes US→US in this step.';
  } else {
    status.usps.message =
      'USPS USERID detected. Enable live USPS RateV4 in the next step (or run /api/shipping/selftest).';
  }

  // NOTE: status.{carrier}.available is TRUE only when that carrier *returned a real rate*.
  // In this step, we’re not calling UPS/USPS, so those remain false with helpful messages.
  // TQL remains available via placeholder.

  return asJSON(res, 200, { rates, status });
}

