// /api/shipping/quote.js
// Returns { rates: [...], diagnostics: {...} }
// UPS (OAuth + Rate Shop), USPS (RateV4 domestic), TQL (LTL stub)

export const config = { runtime: 'nodejs' };

// ---------------------------------------------------------------------------
// helpers
const mask = (v) => (v ? true : false);
const round = (n, p = 0) => Number((+n).toFixed(p));
const five = (z = '') => String(z || '').trim().slice(0, 5);

// robust body parse for Vercel Node runtime
function getJsonBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

// env (matches your screenshots)
const ENV = {
  UPS_CLIENT_ID:      process.env.UPS_CLIENT_ID,
  UPS_CLIENT_SECRET:  process.env.UPS_CLIENT_SECRET,
  UPS_ENV:            (process.env.UPS_ENV || 'prod').toLowerCase(), // 'prod' or 'test'
  UPS_SHIPPER_NUMBER: process.env.UPS_SHIPPER_NUMBER || process.env.UPS_ACCOUNT_NUMBER,

  USPS_USERID:
    process.env.USPS_WEBTOOLS_USERID ||
    process.env.USPS_USER_ID ||
    process.env.USPS_CLIENT_ID,

  TQL_CLIENT_ID:      process.env.TQL_CLIENT_ID,
  TQL_CLIENT_SECRET:  process.env.TQL_CLIENT_SECRET,
  TQL_USERNAME:       process.env.TQL_USERNAME,
  TQL_PASSWORD:       process.env.TQL_PASSWORD,
  TQL_BASE_URL:       process.env.TQL_BASE_URL,
  TQL_TEST_BASE_URL:  process.env.TQL_TEST_BASE_URL,

  FROM: {
    name:    process.env.SHIP_FROM_NAME || 'Force Dowels',
    street:  process.env.SHIP_FROM_STREET,
    city:    process.env.SHIP_FROM_CITY,
    state:   process.env.SHIP_FROM_STATE,
    postal:  process.env.SHIP_FROM_ZIP,
    country: (process.env.SHIP_FROM_COUNTRY || 'US').toUpperCase(),
  },
};

// ---------------------------------------------------------------------------
// packing logic you gave me
function buildPackages(items) {
  let bulkUnits = 0, kits = 0;
  for (const it of items || []) {
    if (it?.type === 'bulk') bulkUnits += +it.units || 0;
    if (it?.type === 'kit')  kits += +it.qty   || 0;
  }

  const pkgs = [];

  // Starter kits: 2 kits per pkg, 9x11x2, 1.7 lb each
  if (kits > 0) {
    let left = kits;
    while (left > 0) {
      const inBox = Math.min(2, left);
      pkgs.push({ weight: round(1.7 * inBox, 1), length: 11, width: 9, height: 2 });
      left -= inBox;
    }
  }

  // Bulk parcels up to 20k → small package boxes
  let remaining = bulkUnits;
  let parcelUnits = Math.min(remaining, 20000);
  remaining -= parcelUnits;

  while (parcelUnits > 0) {
    if (parcelUnits >= 20000) {
      // conservative single 20k box approximation
      pkgs.push({ weight: 154, length: 22, width: 22, height: 12 });
      parcelUnits -= 20000;
    } else if (parcelUnits >= 15000) {
      pkgs.push({ weight: 115, length: 22, width: 22, height: 12 });
      parcelUnits -= 15000;
    } else if (parcelUnits >= 10000) {
      pkgs.push({ weight: 77, length: 15, width: 15, height: 12 });
      parcelUnits -= 10000;
    } else {
      // ≥ 5k and < 10k
      pkgs.push({ weight: 19, length: 15, width: 15, height: 12 });
      parcelUnits = 0;
    }
  }

  // Anything over 20k → LTL territory
  const freightUnits = remaining > 0 ? remaining : 0;

  return { pkgs, freightUnits };
}

// ---------------------------------------------------------------------------
// USPS (domestic only, WebTools RateV4 Priority as a baseline)
async function uspsQuote(from, dest, pkgs, diagnostics) {
  const diag = (diagnostics.usps = {
    enabled: mask(ENV.USPS_USERID),
    errors: [],
  });
  if (!ENV.USPS_USERID) return [];

  // USPS only domestic in this simple handler
  if ((dest.country || 'US').toUpperCase() !== 'US') {
    diag.errors.push('USPS limited to US destination in this integration.');
    return [];
  }

  if (!pkgs.length) {
    diag.errors.push('No parcel packages available for USPS.');
    return [];
  }

  try {
    const endpoint = 'https://secure.shippingapis.com/ShippingAPI.dll';
    const p = pkgs[0]; // First package only for estimate

    // USPS wants LBS/OZ integers and 5-digit ZIPs
    const pounds = Math.max(0, Math.floor(p.weight));
    const ounces = Math.max(1, Math.round((p.weight - pounds) * 16) || 1);

    const xml =
      `<RateV4Request USERID="${ENV.USPS_USERID}">
         <Revision>2</Revision>
         <Package ID="1">
           <Service>PRIORITY</Service>
           <ZipOrigination>${five(from.postal)}</ZipOrigination>
           <ZipDestination>${five(dest.postal)}</ZipDestination>
           <Pounds>${pounds}</Pounds>
           <Ounces>${ounces}</Ounces>
           <Container></Container>
           <Size>REGULAR</Size>
           <Width>${p.width}</Width>
           <Length>${p.length}</Length>
           <Height>${p.height}</Height>
           <Machinable>true</Machinable>
         </Package>
       </RateV4Request>`.replace(/\s+/g, ' ');

    const url = `${endpoint}?API=RateV4&XML=${encodeURIComponent(xml)}`;
    const resp = await fetch(url);
    const text = await resp.text();

    if (!resp.ok) {
      diag.errors.push(`HTTP ${resp.status}`);
      return [];
    }
    if (text.includes('<Error>')) {
      diag.errors.push(text);
      return [];
    }

    const rateMatch = text.match(/<Rate>([\d.]+)<\/Rate>/);
    if (!rateMatch) {
      diag.errors.push('No <Rate> found in USPS response.');
      return [];
    }
    const amount = Number(rateMatch[1]);

    return [{
      carrier: 'USPS',
      service: 'Priority (est.)',
      amount,
      currency: 'USD',
    }];
  } catch (e) {
    diag.errors.push(String(e));
    return [];
  }
}

// ---------------------------------------------------------------------------
// UPS (OAuth + Rate Shop)
async function upsQuote(from, dest, pkgs, diagnostics) {
  const diag = (diagnostics.ups = {
    enabled: mask(ENV.UPS_CLIENT_ID && ENV.UPS_CLIENT_SECRET && ENV.UPS_SHIPPER_NUMBER),
    env: ENV.UPS_ENV,
    errors: [],
  });
  if (!diag.enabled) return [];

  if (!pkgs.length) {
    diag.errors.push('No parcel packages available for UPS.');
    return [];
  }

  try {
    const base = ENV.UPS_ENV === 'test'
      ? 'https://wwwcie.ups.com'
      : 'https://onlinetools.ups.com';

    // Get token
    const tokenResp = await fetch(`${base}/security/v1/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${ENV.UPS_CLIENT_ID}:${ENV.UPS_CLIENT_SECRET}`).toString('base64'),
      },
      body: 'grant_type=client_credentials',
    });
    const tok = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !tok.access_token) {
      diag.errors.push(`OAuth failed: ${tokenResp.status} ${JSON.stringify(tok)}`);
      return [];
    }

    const p = pkgs[0]; // First pkg only, for a baseline

    const payload = {
      RateRequest: {
        Request: { SubVersion: '1707', TransactionReference: { CustomerContext: 'FD Rate' } },
        Shipment: {
          Shipper: {
            Name: ENV.FROM.name,
            ShipperNumber: ENV.UPS_SHIPPER_NUMBER,
            Address: {
              AddressLine: [ENV.FROM.street],
              City: ENV.FROM.city,
              StateProvinceCode: ENV.FROM.state,
              PostalCode: five(ENV.FROM.postal),
              CountryCode: (ENV.FROM.country || 'US').toUpperCase(),
            },
          },
          ShipTo: {
            Address: {
              AddressLine: [''],
              City: dest.city,
              StateProvinceCode: dest.state,
              PostalCode: five(dest.postal),
              CountryCode: (dest.country || 'US').toUpperCase(),
            },
          },
          ShipFrom: {
            Address: {
              AddressLine: [ENV.FROM.street],
              City: ENV.FROM.city,
              StateProvinceCode: ENV.FROM.state,
              PostalCode: five(ENV.FROM.postal),
              CountryCode: (ENV.FROM.country || 'US').toUpperCase(),
            },
          },
          Package: [{
            PackagingType: { Code: '02' }, // Customer Supplied
            Dimensions: {
              UnitOfMeasurement: { Code: 'IN' },
              Length: String(p.length),
              Width: String(p.width),
              Height: String(p.height),
            },
            PackageWeight: {
              UnitOfMeasurement: { Code: 'LBS' },
              Weight: String(Math.max(1, Math.ceil(p.weight))),
            },
          }],
        },
      },
    };

    const rateResp = await fetch(`${base}/api/rating/v1/rates/shops`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok.access_token}`,
        'x-merchant-id': ENV.UPS_SHIPPER_NUMBER,
      },
      body: JSON.stringify(payload),
    });

    const data = await rateResp.json().catch(() => ({}));
    if (!rateResp.ok) {
      diag.errors.push(`Rate HTTP ${rateResp.status}: ${JSON.stringify(data)}`);
      return [];
    }

    const items = (data?.RateResponse?.RatedShipment || []).map((s) => ({
      carrier: 'UPS',
      service: s?.Service?.Description || s?.Service?.Code || 'UPS',
      amount: Number(s?.TotalCharges?.MonetaryValue || s?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue || 0),
      currency: s?.TotalCharges?.CurrencyCode || 'USD',
    })).filter(r => Number.isFinite(r.amount) && r.amount > 0);

    if (!items.length) diag.errors.push('No rated services returned by UPS.');

    return items;
  } catch (e) {
    diagnostics.ups.errors.push(String(e));
    return [];
  }
}

// ---------------------------------------------------------------------------
// TQL – simple placeholder (you can wire real TQL next)
async function tqlQuote(freightUnits /*>=80k*/, diagnostics) {
  const diag = (diagnostics.tql = { enabled: mask(ENV.TQL_CLIENT_ID), errors: [] });
  if (!freightUnits || freightUnits < 80000) return [];
  // demo flat estimate for now
  return [{ carrier: 'TQL', service: 'LTL (est.)', amount: 250, currency: 'USD' }];
}

// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const { destination, items } = getJsonBody(req);
    if (!destination || !Array.isArray(items)) {
      return res.status(400).json({ error: 'missing_params' });
    }

    const diagnostics = {
      envSeen: {
        ups: {
          clientId: mask(ENV.UPS_CLIENT_ID),
          clientSecret: mask(ENV.UPS_CLIENT_SECRET),
          shipperNumber: mask(ENV.UPS_SHIPPER_NUMBER),
          env: ENV.UPS_ENV,
        },
        usps: { userId: mask(ENV.USPS_USERID) },
        fromValid: mask(ENV.FROM.city && ENV.FROM.state && ENV.FROM.postal),
      },
      usps: {},
      ups: {},
      tql: {},
    };

    // normalize destination bits carriers care about
    const dest = {
      country: (destination.country || 'US').toUpperCase(),
      state: destination.state || '',
      city: destination.city || '',
      postal: five(destination.postal),
    };

    const { pkgs, freightUnits } = buildPackages(items);

    const [uspsRates, upsRates, tqlRates] = await Promise.all([
      uspsQuote(ENV.FROM, dest, pkgs, diagnostics),
      upsQuote(ENV.FROM, dest, pkgs, diagnostics),
      tqlQuote(freightUnits, diagnostics),
    ]);

    const rates = [...uspsRates, ...upsRates, ...tqlRates]
      .filter(r => r && Number.isFinite(r.amount))
      .sort((a, b) => a.amount - b.amount);

    return res.status(200).json({ rates, diagnostics });
  } catch (e) {
    console.error('shipping/quote failed', e);
    return res.status(500).json({ error: 'quote_failed', message: String(e) });
  }
}
