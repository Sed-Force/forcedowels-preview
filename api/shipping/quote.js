// /api/shipping/quote.js
// Live UPS + USPS rating with clear carrier status; TQL placeholder kept.
// Vercel runtime
export const config = { runtime: 'nodejs' };

const asJSON = (res, code, obj) => {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj, null, 2));
};

const toStr = (v) => (v ?? '').toString().trim();
const hasAll = (obj) => Object.values(obj).every(Boolean);

// ------------------------ Packaging rules (v1) ------------------------
// Bulk: every 5,000 dowels = 1 parcel @ 19 lb, 15x15x12 in (rounded from 18.6)
// Kits: 2 kits per parcel, each kit 1.7 lb, 9x11x2 in
function buildParcels(items) {
  let bulkUnits = 0;
  let kits = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (it?.type === 'bulk') bulkUnits += Number(it.units || 0);
    if (it?.type === 'kit')  kits      += Number(it.qty   || 0);
  }

  const parcels = [];

  // Bulk → 5k-per-parcel
  if (bulkUnits > 0) {
    const bags = Math.ceil(bulkUnits / 5000);
    for (let i = 0; i < bags; i++) {
      parcels.push({
        weightLbs: 19,
        lengthIn: 15, widthIn: 15, heightIn: 12,
        reference: 'bulk-5k',
      });
    }
  }

  // Kits → 2 kits/parcel (9x11x2), 1.7 lb/kit
  let remainingKits = kits;
  while (remainingKits > 0) {
    const k = Math.min(2, remainingKits);
    parcels.push({
      weightLbs: 1.7 * k,
      lengthIn: 9, widthIn: 11, heightIn: 2,
      reference: `kits-${k}`,
    });
    remainingKits -= k;
  }

  return parcels;
}

// ------------------------ TQL (placeholder) --------------------------
function quoteTQLPlaceholder() {
  return [{
    carrier: 'TQL',
    service: 'LTL Freight (placeholder)',
    amount: 92.00,
    currency: 'USD',
  }];
}

// ------------------------ UPS (OAuth + Shop) -------------------------
async function getUPSToken({ clientId, clientSecret, envBase }) {
  const url = `${envBase}/security/v1/oauth/token`;
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!r.ok) throw new Error(`UPS OAuth failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  if (!j?.access_token) throw new Error('UPS OAuth: no access_token');
  return j.access_token;
}

function makeUPSBody({ shipFrom, dest, shipperNumber, parcels }) {
  // Minimal "Shop Rates" request; UPS will return multiple services when possible
  return {
    RateRequest: {
      Shipment: {
        Shipper: {
          Name: shipFrom.name || 'Shipper',
          ShipperNumber: shipperNumber,
          Address: {
            AddressLine: [shipFrom.street].filter(Boolean),
            City: shipFrom.city,
            StateProvinceCode: shipFrom.state,
            PostalCode: shipFrom.postal,
            CountryCode: shipFrom.country || 'US',
          },
        },
        ShipFrom: {
          Name: shipFrom.name || 'Ship From',
          Address: {
            AddressLine: [shipFrom.street].filter(Boolean),
            City: shipFrom.city,
            StateProvinceCode: shipFrom.state,
            PostalCode: shipFrom.postal,
            CountryCode: shipFrom.country || 'US',
          },
        },
        ShipTo: {
          Name: 'Destination',
          Address: {
            AddressLine: [dest.street || ''].filter(Boolean), // optional
            City: dest.city || '',
            StateProvinceCode: (dest.state || '').toUpperCase().slice(0, 2),
            PostalCode: dest.postal,
            CountryCode: (dest.country || 'US').toUpperCase(),
          },
        },
        Package: parcels.map((p) => ({
          PackagingType: { Code: '02' }, // Customer Supplied Package
          Dimensions: {
            UnitOfMeasurement: { Code: 'IN' },
            Length: String(p.lengthIn),
            Width:  String(p.widthIn),
            Height: String(p.heightIn),
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: 'LBS' },
            Weight: String(Math.max(1, Math.round(p.weightLbs))),
          },
        })),
      },
    },
  };
}

async function quoteUPS({ envBase, token, shipperNumber, shipFrom, dest, parcels }) {
  const url = `${envBase}/api/rating/v1/Shop`;
  const body = makeUPSBody({ shipFrom, dest, shipperNumber, parcels });

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`UPS rate error ${r.status}: ${txt}`);

  let j;
  try { j = JSON.parse(txt); } catch { throw new Error(`UPS parse error: ${txt}`); }

  // The shape can vary; normalize a few common services to {carrier, service, amount}
  // Look for RatedShipment / TotalCharges / MonetaryValue
  const out = [];
  const rated = j?.RateResponse?.RatedShipment
             || j?.RateResponse?.RateResults // alternate naming
             || j?.RateResponse?.ShopResponse; // older
  const list = Array.isArray(rated) ? rated : (rated ? [rated] : []);

  for (const rs of list) {
    const svc = rs?.Service?.Description || rs?.Service?.Code || 'UPS Service';
    const total = Number(rs?.TotalCharges?.MonetaryValue ?? rs?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue);
    if (Number.isFinite(total)) {
      out.push({ carrier: 'UPS', service: String(svc), amount: total, currency: rs?.TotalCharges?.CurrencyCode || 'USD' });
    }
  }

  return out;
}

// ------------------------ USPS (WebTools RateV4) ----------------------
function poundsAndOunces(weightLbs) {
  const lbs = Math.floor(weightLbs);
  const oz  = Math.round((weightLbs - lbs) * 16);
  return { lbs: Math.max(0, lbs), oz: Math.max(0, oz) };
}

function buildUSPSRateV4XML({ userId, shipFromZip, destZip, parcels }) {
  // We use PRIORITY as a sane default service for parcels.
  // USPS requires one <Package> per parcel.
  const pkgs = parcels.map((p, i) => {
    const { lbs, oz } = poundsAndOunces(p.weightLbs);
    return `
      <Package ID="${i+1}">
        <Service>PRIORITY</Service>
        <ZipOrigination>${shipFromZip}</ZipOrigination>
        <ZipDestination>${destZip}</ZipDestination>
        <Pounds>${lbs}</Pounds>
        <Ounces>${oz}</Ounces>
        <Container>RECTANGULAR</Container>
        <Width>${p.widthIn}</Width>
        <Length>${p.lengthIn}</Length>
        <Height>${p.heightIn}</Height>
        <Girth></Girth>
        <Machinable>true</Machinable>
      </Package>`;
  }).join('');

  return `API=RateV4&XML=${encodeURIComponent(
    `<RateV4Request USERID="${userId}">${pkgs}</RateV4Request>`
  )}`;
}

async function quoteUSPS({ userId, shipFromZip, destZip, parcels }) {
  const query = buildUSPSRateV4XML({ userId, shipFromZip, destZip, parcels });
  const url   = `https://secure.shippingapis.com/ShippingAPI.dll?${query}`;

  const r = await fetch(url, { method: 'GET' });
  const xml = await r.text();
  if (!r.ok) throw new Error(`USPS HTTP ${r.status}: ${xml}`);
  if (/Error/i.test(xml)) throw new Error(`USPS API error: ${xml}`);

  // Parse a few "Postage/Rate" values and sum them by package.
  // Keep it simple with regex extraction.
  const rates = [...xml.matchAll(/<Rate>([\d.]+)<\/Rate>/g)].map(m => Number(m[1]));
  if (!rates.length) throw new Error(`USPS: no <Rate> entries found`);

  // Sum all package rates into one line
  const total = rates.reduce((a,b)=>a+b, 0);
  return [{ carrier: 'USPS', service: 'Priority Mail (sum of parcels)', amount: total, currency: 'USD' }];
}

// ------------------------ Handler ------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return asJSON(res, 405, { error: 'Method not allowed' });

  let body = {};
  try { body = JSON.parse(req.body || '{}'); } catch { body = req.body || {}; }

  const destination = body.destination || {};
  const items       = Array.isArray(body.items) ? body.items : [];

  if (!items.length) return asJSON(res, 400, { error: 'Missing items[]' });
  if (!toStr(destination.country) || !toStr(destination.postal)) {
    return asJSON(res, 400, { error: 'Missing destination (country, postal)' });
  }

  const shipFrom = {
    name:    process.env.SHIP_FROM_NAME,
    street:  process.env.SHIP_FROM_STREET,
    city:    process.env.SHIP_FROM_CITY,
    state:   process.env.SHIP_FROM_STATE,
    postal:  process.env.SHIP_FROM_ZIP,
    country: process.env.SHIP_FROM_COUNTRY || 'US',
  };

  const shipFromOK = hasAll({
    name: !!shipFrom.name, street: !!shipFrom.street, city: !!shipFrom.city,
    state: !!shipFrom.state, postal: !!shipFrom.postal, country: !!shipFrom.country,
  });

  const upsCreds = {
    clientId:      process.env.UPS_CLIENT_ID,
    clientSecret:  process.env.UPS_CLIENT_SECRET,
    shipperNumber: process.env.UPS_ACCOUNT_NUMBER,
    envBase:
      (process.env.UPS_ENV || 'test').toLowerCase().startsWith('prod')
        ? 'https://onlinetools.ups.com'
        : 'https://wwwcie.ups.com',
  };

  const uspsCreds = {
    userId: process.env.USPS_WEBTOOLS_USERID, // IMPORTANT: WebTools USERID
  };

  const parcels = buildParcels(items);

  const outRates = [];
  const status   = {
    ups:  { available: false, message: null },
    usps: { available: false, message: null },
    tql:  { available: true,  message: null },
  };

  // Always keep TQL placeholder
  outRates.push(...quoteTQLPlaceholder());

  // ---------------- UPS attempt ----------------
  try {
    if (!upsCreds.clientId || !upsCreds.clientSecret || !upsCreds.shipperNumber) {
      status.ups.message = 'Missing UPS env vars (UPS_CLIENT_ID / UPS_CLIENT_SECRET / UPS_ACCOUNT_NUMBER).';
    } else if (!shipFromOK) {
      status.ups.message = 'Missing SHIP_FROM_* env address.';
    } else {
      const token = await getUPSToken(upsCreds);
      const upsRates = await quoteUPS({
        envBase: upsCreds.envBase,
        token,
        shipperNumber: upsCreds.shipperNumber,
        shipFrom,
        dest: {
          country: (destination.country || 'US').toUpperCase(),
          state: (destination.state || '').toUpperCase(),
          city: destination.city || '',
          postal: destination.postal || '',
          street: destination.street || '',
        },
        parcels,
      });
      if (upsRates.length) {
        outRates.push(...upsRates);
        status.ups.available = true;
        status.ups.message = `Returned ${upsRates.length} rate(s).`;
      } else {
        status.ups.message = 'No UPS services returned for this request.';
      }
    }
  } catch (e) {
    status.ups.message = `Error: ${e.message.slice(0, 300)}`;
  }

  // ---------------- USPS attempt (US→US only) ----------------
  try {
    const isUSDomestic = (destination.country || 'US').toUpperCase() === 'US'
                      && (shipFrom.country || 'US').toUpperCase() === 'US';
    if (!isUSDomestic) {
      status.usps.message = 'USPS step covers domestic (US→US) only.';
    } else if (!uspsCreds.userId) {
      status.usps.message = 'Missing USPS_WEBTOOLS_USERID env var.';
    } else if (!shipFromOK) {
      status.usps.message = 'Missing SHIP_FROM_* env address.';
    } else {
      const uspsRates = await quoteUSPS({
        userId: uspsCreds.userId,
        shipFromZip: shipFrom.postal,
        destZip: destination.postal,
        parcels,
      });
      if (uspsRates.length) {
        outRates.push(...uspsRates);
        status.usps.available = true;
        status.usps.message = `Returned ${uspsRates.length} rate(s).`;
      } else {
        status.usps.message = 'No USPS rates returned.';
      }
    }
  } catch (e) {
    status.usps.message = `Error: ${e.message.slice(0, 300)}`;
  }

  return asJSON(res, 200, { rates: outRates, status });
}
