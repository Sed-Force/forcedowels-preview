// /api/shipping/quote.js
// Returns { rates: [...], diagnostics: { ups: {...}, usps: {...}, tql: {...} } }
// so you can see exactly why a carrier is missing.

export const config = { runtime: 'nodejs' };

function mask(str) {
  if (!str) return '';
  const s = String(str);
  if (s.length <= 4) return '****';
  return s.slice(0, 2) + '***' + s.slice(-2);
}

// --- Read envs with fallbacks to match your screenshots ---
const ENV = {
  UPS_CLIENT_ID:       process.env.UPS_CLIENT_ID,
  UPS_CLIENT_SECRET:   process.env.UPS_CLIENT_SECRET,
  UPS_ENV:             process.env.UPS_ENV || 'prod', // 'prod' or 'test'
  UPS_SHIPPER_NUMBER:  process.env.UPS_SHIPPER_NUMBER || process.env.UPS_ACCOUNT_NUMBER,

  USPS_USERID:
    process.env.USPS_WEBTOOLS_USERID ||
    process.env.USPS_USER_ID ||
    process.env.USPS_CLIENT_ID,

  TQL_CLIENT_ID:       process.env.TQL_CLIENT_ID,
  TQL_CLIENT_SECRET:   process.env.TQL_CLIENT_SECRET,
  TQL_USERNAME:        process.env.TQL_USERNAME,
  TQL_PASSWORD:        process.env.TQL_PASSWORD,
  TQL_BASE_URL:        process.env.TQL_BASE_URL,
  TQL_TEST_BASE_URL:   process.env.TQL_TEST_BASE_URL,

  FROM: {
    name:    process.env.SHIP_FROM_NAME,
    street:  process.env.SHIP_FROM_STREET,
    city:    process.env.SHIP_FROM_CITY,
    state:   process.env.SHIP_FROM_STATE,
    postal:  process.env.SHIP_FROM_ZIP,
    country: process.env.SHIP_FROM_COUNTRY || 'US',
  },
};

// --- Simple packer (same as before) just to produce a weight/dims estimate ---
function round(n, p = 0) { return Number((+n).toFixed(p)); }

// Bulk packaging based on your table (approx):
// 5k = 19 lb, 15x15x12
// 10k = two 5k boxes
// 15k/20k use 22x22x12
// >=80k -> palletized weights provided in earlier notes (we’ll hand to TQL)
function buildPackages(items) {
  let bulkUnits = 0, kits = 0;
  for (const it of items || []) {
    if (it.type === 'bulk') bulkUnits += +it.units || 0;
    if (it.type === 'kit')  kits += +it.qty || 0;
  }

  const pkgs = [];

  // Starter kits: 2 kits per UPS pkg, 9x11x2, 1.7 lb each
  if (kits > 0) {
    let remaining = kits;
    while (remaining > 0) {
      const inBox = Math.min(2, remaining);
      pkgs.push({ weight: round(1.7 * inBox, 1), length: 11, width: 9, height: 2 });
      remaining -= inBox;
    }
  }

  // Bulk parcels up to 20k -> small parcel boxes.
  let remaining = bulkUnits;

  // For 20k and below, use parcel boxes
  let parcelUnits = Math.min(remaining, 20000);
  remaining -= parcelUnits;

  while (parcelUnits > 0) {
    if (parcelUnits >= 20000) {
      // 20k -> one 22x22x12 @ ~? use two 15x15x12 logic stacked (approx 2x19=38 lb, but your 20k box is larger).
      pkgs.push({ weight: 154, length: 22, width: 22, height: 12 }); // 2x 10k (approx 77lb x2); conservative
      parcelUnits -= 20000;
    } else if (parcelUnits >= 15000) {
      pkgs.push({ weight: 115, length: 22, width: 22, height: 12 }); // 15k approx
      parcelUnits -= 15000;
    } else if (parcelUnits >= 10000) {
      pkgs.push({ weight: 77, length: 15, width: 15, height: 12 }); // 10k
      parcelUnits -= 10000;
    } else if (parcelUnits >= 5000) {
      pkgs.push({ weight: 19, length: 15, width: 15, height: 12 }); // 5k
      parcelUnits -= 5000;
    } else {
      // snap up to 5k minimum parcel
      pkgs.push({ weight: 19, length: 15, width: 15, height: 12 });
      parcelUnits = 0;
    }
  }

  // Anything over 20k is pallet/LTL territory handled by TQL; we’ll pass the big number as freight lbs.
  const freightUnits = remaining > 0 ? remaining : 0;

  return { pkgs, freightUnits };
}

// ---- USPS quote (WebTools RateV4) ----
async function uspsQuote(from, dest, pkgs, diagnostics) {
  const diag = (diagnostics.usps = { enabled: !!ENV.USPS_USERID, userIdPresent: !!ENV.USPS_USERID, errors: [] });
  if (!ENV.USPS_USERID) return [];

  try {
    // Only support US destinations for USPS.
    if ((dest.country || 'US').toUpperCase() !== 'US') {
      diag.errors.push('USPS limited to US destination in this demo.');
      return [];
    }

    const endpoint = 'https://secure.shippingapis.com/ShippingAPI.dll';

    // Build XML for RateV4 (Parcel Select / Priority / Ground Advantage etc.)
    // For simplicity, pick the first parcel and quote on that; you can multi-package sum if needed.
    if (!pkgs.length) {
      diag.errors.push('No parcel packages to rate.');
      return [];
    }
    const pkg = pkgs[0];

    const pounds = Math.max(0, Math.floor(pkg.weight));
    const ounces = Math.max(1, Math.round((pkg.weight - pounds) * 16) || 1);

    const xml =
      `<RateV4Request USERID="${ENV.USPS_USERID}">
         <Revision>2</Revision>
         <Package ID="1">
           <Service>PRIORITY</Service>
           <ZipOrigination>${from.postal}</ZipOrigination>
           <ZipDestination>${dest.postal}</ZipDestination>
           <Pounds>${pounds}</Pounds>
           <Ounces>${ounces}</Ounces>
           <Container/>
           <Size>REGULAR</Size>
           <Width>${pkg.width}</Width>
           <Length>${pkg.length}</Length>
           <Height>${pkg.height}</Height>
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

    // Simple parse: grab the <Rate> of the first returned service
    const m = text.match(/<Rate>([\d.]+)<\/Rate>/);
    if (!m) {
      diag.errors.push('No <Rate> found in USPS response.');
      return [];
    }
    const amount = Number(m[1]);
    return [{
      carrier: 'USPS',
      service: 'Priority (est.)',
      amount,
      currency: 'USD'
    }];
  } catch (e) {
    diag.errors.push(String(e));
    return [];
  }
}

// ---- UPS quote (Client Credentials OAuth + Rate) ----
async function upsQuote(from, dest, pkgs, diagnostics) {
  const diag = (diagnostics.ups = {
    enabled: !!(ENV.UPS_CLIENT_ID && ENV.UPS_CLIENT_SECRET && ENV.UPS_SHIPPER_NUMBER),
    clientIdPresent: !!ENV.UPS_CLIENT_ID,
    secretPresent: !!ENV.UPS_CLIENT_SECRET,
    shipperNumberPresent: !!ENV.UPS_SHIPPER_NUMBER,
    env: ENV.UPS_ENV,
    errors: []
  });

  if (!diag.enabled) return [];

  try {
    const base = ENV.UPS_ENV === 'test'
      ? 'https://wwwcie.ups.com'
      : 'https://onlinetools.ups.com';

    // OAuth
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
      diag.errors.push(`UPS OAuth failed: ${tokenResp.status} ${JSON.stringify(tok)}`);
      return [];
    }

    if (!pkgs.length) {
      diag.errors.push('No parcel packages to rate.');
      return [];
    }

    const pkg = pkgs[0]; // simple demo: first pkg

    const payload = {
      RateRequest: {
        Request: { SubVersion: '1707', TransactionReference: { CustomerContext: 'FD Rate' } },
        Shipment: {
          Shipper: {
            Name: ENV.FROM.name || 'Force Dowels',
            ShipperNumber: ENV.UPS_SHIPPER_NUMBER,
            Address: {
              AddressLine: [ENV.FROM.street],
              City: ENV.FROM.city,
              StateProvinceCode: ENV.FROM.state,
              PostalCode: ENV.FROM.postal,
              CountryCode: ENV.FROM.country || 'US'
            }
          },
          ShipTo: {
            Address: {
              AddressLine: [''],
              City: dest.city,
              StateProvinceCode: dest.state,
              PostalCode: dest.postal,
              CountryCode: (dest.country || 'US').toUpperCase(),
            }
          },
          ShipFrom: {
            Address: {
              AddressLine: [ENV.FROM.street],
              City: ENV.FROM.city,
              StateProvinceCode: ENV.FROM.state,
              PostalCode: ENV.FROM.postal,
              CountryCode: ENV.FROM.country || 'US'
            }
          },
          Package: [{
            PackagingType: { Code: '02' }, // Customer Supplied
            Dimensions: {
              UnitOfMeasurement: { Code: 'IN' },
              Length: String(pkg.length),
              Width: String(pkg.width),
              Height: String(pkg.height),
            },
            PackageWeight: {
              UnitOfMeasurement: { Code: 'LBS' },
              Weight: String(Math.max(1, Math.ceil(pkg.weight)))
            }
          }]
        }
      }
    };

    const rateResp = await fetch(`${base}/api/rating/v1/rates/shops`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok.access_token}`,
        'x-merchant-id': ENV.UPS_SHIPPER_NUMBER
      },
      body: JSON.stringify(payload),
    });

    const rateJson = await rateResp.json().catch(() => ({}));
    if (!rateResp.ok) {
      diag.errors.push(`UPS rate HTTP ${rateResp.status}: ${JSON.stringify(rateJson)}`);
      return [];
    }

    const svcs = (rateJson?.RateResponse?.RatedShipment || []).map(s => ({
      carrier: 'UPS',
      service: s?.Service?.Description || s?.Service?.Code || 'UPS',
      amount: Number(s?.TotalCharges?.MonetaryValue || s?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue || 0),
      currency: (s?.TotalCharges?.CurrencyCode || 'USD')
    })).filter(x => x.amount > 0);

    if (!svcs.length) diag.errors.push('No rated services returned.');
    return svcs;
  } catch (e) {
    diagnostics.ups.errors.push(String(e));
    return [];
  }
}

// ---- TQL stub (you already see it working; we keep it minimal here) ----
async function tqlQuote(freightUnits, diagnostics) {
  const diag = (diagnostics.tql = { enabled: !!ENV.TQL_CLIENT_ID, errors: [] });
  if (!freightUnits || freightUnits < 80000) return []; // pallet threshold in your logic
  // For debug/demo, pretend $250 freight for now
  return [{ carrier: 'TQL', service: 'LTL (est.)', amount: 250, currency: 'USD' }];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }
  try {
    const { destination, items } = await req.json?.() || await req.body || {};
    if (!items || !Array.isArray(items) || !destination) {
      return res.status(400).json({ error: 'Missing items or destination' });
    }

    const diagnostics = {
      envSeen: {
        ups: {
          clientId: !!ENV.UPS_CLIENT_ID, clientSecret: !!ENV.UPS_CLIENT_SECRET,
          shipperNumber: !!ENV.UPS_SHIPPER_NUMBER, env: ENV.UPS_ENV
        },
        usps: { userId: !!ENV.USPS_USERID },
        from: { ...ENV.FROM, // masked view
          name: !!ENV.FROM.name, street: !!ENV.FROM.street, city: !!ENV.FROM.city,
          state: !!ENV.FROM.state, postal: !!ENV.FROM.postal, country: ENV.FROM.country
        }
      }
    };

    const { pkgs, freightUnits } = buildPackages(items);

    // Call carriers
    const [uspsRates, upsRates, tqlRates] = await Promise.all([
      uspsQuote(ENV.FROM, destination, pkgs, diagnostics),
      upsQuote(ENV.FROM, destination, pkgs, diagnostics),
      tqlQuote(freightUnits, diagnostics),
    ]);

    const rates = [...uspsRates, ...upsRates, ...tqlRates]
      .filter(r => r && Number.isFinite(r.amount))
      .sort((a,b) => a.amount - b.amount);

    res.status(200).json({ rates, diagnostics });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'quote_failed', message: String(e) });
  }
}
