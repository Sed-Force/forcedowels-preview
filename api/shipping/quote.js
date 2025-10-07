// /api/shipping/quote.js
// UPS + USPS quoting with robust state/province normalization and USPS multi-parcel aggregation.
// If a carrier fails, a clear status message is returned and other carriers still work.

export const config = { runtime: 'nodejs' };

const asJSON = (res, code, obj) => {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj, null, 2));
};

const toStr = (v) => (v ?? '').toString().trim();

// ---------------- State/Province normalization ----------------
const US_STATES = {
  ALABAMA:'AL', ALASKA:'AK', ARIZONA:'AZ', ARKANSAS:'AR', CALIFORNIA:'CA', COLORADO:'CO',
  CONNECTICUT:'CT', DELAWARE:'DE', 'DISTRICT OF COLUMBIA':'DC', FLORIDA:'FL', GEORGIA:'GA',
  HAWAII:'HI', IDAHO:'ID', ILLINOIS:'IL', INDIANA:'IN', IOWA:'IA', KANSAS:'KS', KENTUCKY:'KY',
  LOUISIANA:'LA', MAINE:'ME', MARYLAND:'MD', MASSACHUSETTS:'MA', MICHIGAN:'MI', MINNESOTA:'MN',
  MISSISSIPPI:'MS', MISSOURI:'MO', MONTANA:'MT', NEBRASKA:'NE', NEVADA:'NV', 'NEW HAMPSHIRE':'NH',
  'NEW JERSEY':'NJ', 'NEW MEXICO':'NM', 'NEW YORK':'NY', 'NORTH CAROLINA':'NC', 'NORTH DAKOTA':'ND',
  OHIO:'OH', OKLAHOMA:'OK', OREGON:'OR', PENNSYLVANIA:'PA', 'RHODE ISLAND':'RI', 'SOUTH CAROLINA':'SC',
  'SOUTH DAKOTA':'SD', TENNESSEE:'TN', TEXAS:'TX', UTAH:'UT', VERMONT:'VT', VIRGINIA:'VA',
  WASHINGTON:'WA', 'WEST VIRGINIA':'WV', WISCONSIN:'WI', WYOMING:'WY',
};

const CA_PROVINCES = {
  ALBERTA:'AB', 'BRITISH COLUMBIA':'BC', MANITOBA:'MB', 'NEW BRUNSWICK':'NB',
  'NEWFOUNDLAND AND LABRADOR':'NL', 'NOVA SCOTIA':'NS', 'NORTHWEST TERRITORIES':'NT',
  NUNAVUT:'NU', ONTARIO:'ON', 'PRINCE EDWARD ISLAND':'PE', QUEBEC:'QC', SASKATCHEWAN:'SK', YUKON:'YT',
};

function stateToCode(country, input) {
  const s = toStr(input).toUpperCase();
  if (!s) return '';
  if (country === 'US') {
    if (US_STATES[s]) return US_STATES[s];
    if (Object.values(US_STATES).includes(s)) return s;
    return ''; // don’t guess
  }
  if (country === 'CA') {
    if (CA_PROVINCES[s]) return CA_PROVINCES[s];
    if (Object.values(CA_PROVINCES).includes(s)) return s;
    return '';
  }
  // For MX and others, UPS accepts empty state; omit field.
  return '';
}

const hasAll = (obj) => Object.values(obj).every(Boolean);

// ---------------- Packaging rules (your spec) ----------------
// Bulk: 5,000 units per parcel @ 19 lb; 15x15x12 in
// Kits: 2 kits per parcel; 1.7 lb/kit; 9x11x2 in
function buildParcels(items) {
  let bulkUnits = 0;
  let kits = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (it?.type === 'bulk') bulkUnits += Number(it.units || 0);
    if (it?.type === 'kit')  kits      += Number(it.qty   || 0);
  }

  const parcels = [];

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

// ---------------- Placeholder TQL ----------------
function quoteTQLPlaceholder() {
  return [{
    carrier: 'TQL',
    service: 'LTL Freight (placeholder)',
    amount: 92.00,
    currency: 'USD',
  }];
}

// ---------------- UPS (OAuth + Shop) ----------------
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
  const shipToAddress = {
    AddressLine: [toStr(dest.street)].filter(Boolean),
    City: toStr(dest.city),
    PostalCode: toStr(dest.postal),
    CountryCode: dest.country,
  };
  const destState = stateToCode(dest.country, dest.state);
  if (destState) shipToAddress.StateProvinceCode = destState;

  const shipFromAddress = {
    AddressLine: [toStr(shipFrom.street)].filter(Boolean),
    City: toStr(shipFrom.city),
    PostalCode: toStr(shipFrom.postal),
    CountryCode: toStr(shipFrom.country) || 'US',
  };
  const fromState = stateToCode(shipFrom.country || 'US', shipFrom.state);
  if (fromState) shipFromAddress.StateProvinceCode = fromState;

  return {
    RateRequest: {
      Shipment: {
        Shipper: {
          Name: shipFrom.name || 'Shipper',
          ShipperNumber: shipperNumber,
          Address: shipFromAddress,
        },
        ShipFrom: {
          Name: shipFrom.name || 'Ship From',
          Address: shipFromAddress,
        },
        ShipTo: {
          Name: 'Destination',
          Address: shipToAddress,
        },
        Package: parcels.map((p) => ({
          PackagingType: { Code: '02' }, // customer-supplied
          Dimensions: {
            UnitOfMeasurement: { Code: 'IN' },
            Length: String(p.lengthIn),
            Width:  String(p.widthIn),
            Height: String(p.heightIn),
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: 'LBS' },
            // round up to whole lb (UPS wants integer weight)
            Weight: String(Math.max(1, Math.ceil(p.weightLbs))),
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

  const out = [];
  const rated =
    j?.RateResponse?.RatedShipment ||
    j?.RateResponse?.RateResults ||
    j?.RateResponse?.ShopResponse;
  const list = Array.isArray(rated) ? rated : (rated ? [rated] : []);

  for (const rs of list) {
    const svc = rs?.Service?.Description || rs?.Service?.Code || 'UPS Service';
    const total = Number(
      rs?.TotalCharges?.MonetaryValue ??
      rs?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue
    );
    if (Number.isFinite(total)) {
      out.push({
        carrier: 'UPS',
        service: String(svc),
        amount: total,
        currency: rs?.TotalCharges?.CurrencyCode || 'USD',
      });
    }
  }
  return out;
}

// ---------------- USPS (WebTools RateV4, domestic only, multi-parcel aggregation) ----------------
function resolveUspsUserId() {
  // Accept common names; trim whitespace
  const id =
    process.env.USPS_WEBTOOLS_USERID ||
    process.env.USPS_WEBTOOLS_ID ||
    process.env.USPS_USERID ||
    process.env.usps_webtools_id ||
    process.env.USPS_CLIENT_ID || // if previously misnamed
    process.env.usps_client_id ||
    '';
  return (id || '').trim();
}

function xmlEscape(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function poundsAndOunces(weightLbs) {
  const lbs = Math.floor(weightLbs);
  const oz  = Math.round((weightLbs - lbs) * 16);
  return { lbs: Math.max(0, lbs), oz: Math.max(0, oz) };
}

async function uspsRateV4Single({ userId, shipFromZip, destZip, parcel }) {
  // USPS RateV4 production endpoint
  const ENDPOINT = 'https://secure.shippingapis.com/ShippingAPI.dll';
  const { lbs, oz } = poundsAndOunces(parcel.weightLbs);

  const xml = `
    <RateV4Request USERID="${xmlEscape(userId)}">
      <Revision>2</Revision>
      <Package ID="1">
        <Service>ALL</Service>
        <ZipOrigination>${xmlEscape(shipFromZip)}</ZipOrigination>
        <ZipDestination>${xmlEscape(destZip)}</ZipDestination>
        <Pounds>${lbs}</Pounds>
        <Ounces>${oz}</Ounces>
        <Container></Container>
        <Size>${(parcel.lengthIn > 12 || parcel.widthIn > 12 || parcel.heightIn > 12) ? 'LARGE' : 'REGULAR'}</Size>
        <Width>${parcel.widthIn}</Width>
        <Length>${parcel.lengthIn}</Length>
        <Height>${parcel.heightIn}</Height>
        <Machinable>TRUE</Machinable>
      </Package>
    </RateV4Request>
  `.trim();

  const url = `${ENDPOINT}?API=RateV4&XML=${encodeURIComponent(xml)}`;
  const r = await fetch(url, { method: 'GET' });
  const text = await r.text();

  if (!r.ok || /<Error>/i.test(text)) {
    const code = (text.match(/<Number>([\s\S]*?)<\/Number>/i)?.[1] || '').trim();
    const desc = (text.match(/<Description>([\s\S]*?)<\/Description>/i)?.[1] || '').trim();
    throw new Error(`USPS API error: ${code}${desc}`);
  }

  // Parse <Postage><MailService>...<Rate>...
  const services = [];
  const blockRe = /<Postage[^>]*>([\s\S]*?)<\/Postage>/gi;
  let m;
  while ((m = blockRe.exec(text))) {
    const block = m[1];
    const name = (block.match(/<MailService>([\s\S]*?)<\/MailService>/i)?.[1] || '')
      .replace(/&lt;.*?&gt;/g, '')
      .replace(/&amp;/g, '&')
      .trim();
    const rate = parseFloat(block.match(/<Rate>([\s\S]*?)<\/Rate>/i)?.[1] || '0');
    if (name && Number.isFinite(rate) && rate > 0) {
      services.push({ name, rate });
    }
  }
  return services; // [{name, rate}] for THIS parcel
}

async function quoteUSPSAggregate({ userId, shipFromZip, destZip, parcels }) {
  if (!parcels.length) return [];
  // Aggregate by service across all parcels: only keep services present for every parcel
  let serviceMap = null; // { serviceName: totalAmount }
  for (const p of parcels) {
    const svcList = await uspsRateV4Single({ userId, shipFromZip, destZip, parcel: p });
    const mapThis = new Map();
    for (const s of svcList) mapThis.set(s.name, s.rate);

    if (serviceMap == null) {
      // Initialize with first parcel’s services
      serviceMap = new Map(mapThis);
    } else {
      // Intersect: keep only services present in both, sum amounts
      for (const key of Array.from(serviceMap.keys())) {
        if (!mapThis.has(key)) {
          serviceMap.delete(key);
        } else {
          serviceMap.set(key, serviceMap.get(key) + mapThis.get(key));
        }
      }
    }
  }

  if (!serviceMap || serviceMap.size === 0) return [];

  const out = [];
  for (const [service, amount] of serviceMap.entries()) {
    out.push({ carrier: 'USPS', service, amount: Number(amount.toFixed(2)), currency: 'USD' });
  }
  out.sort((a, b) => a.amount - b.amount); // cheapest first
  return out;
}

// ---------------- Handler ----------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return asJSON(res, 405, { error: 'Method not allowed' });

  // Parse JSON body (Vercel Node runtime gives string)
  let bodyRaw = '';
  if (typeof req.body === 'string') {
    bodyRaw = req.body;
  } else if (req.body && typeof req.body === 'object') {
    bodyRaw = JSON.stringify(req.body);
  } else {
    // stream
    bodyRaw = await new Promise((resolve) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => resolve(data || '{}'));
    });
  }

  let body = {};
  try { body = JSON.parse(bodyRaw || '{}'); } catch { body = {}; }

  const destination = body.destination || {};
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return asJSON(res, 400, { error: 'Missing items[]' });

  const destCountry = toStr(destination.country).toUpperCase() || 'US';
  const dest = {
    country: destCountry,
    state:   toStr(destination.state),
    city:    toStr(destination.city),
    postal:  toStr(destination.postal),
    street:  toStr(destination.street),
  };
  if (!dest.postal) return asJSON(res, 400, { error: 'Missing destination.postal' });

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

  const uspsUserId = resolveUspsUserId();

  const parcels = buildParcels(items);
  const outRates = [];
  const status = {
    ups:  { available: false, message: null },
    usps: { available: false, message: null },
    tql:  { available: true,  message: null },
  };

  // Always include TQL placeholder
  outRates.push(...quoteTQLPlaceholder());

  // ---------------- UPS ----------------
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
        dest: { ...dest }, // state normalized inside makeUPSBody()
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
    status.ups.message = `Error: ${String(e.message || e).slice(0, 300)}`;
  }

  // ---------------- USPS (domestic US only) ----------------
  try {
    const isUSDomestic =
      (dest.country || 'US').toUpperCase() === 'US' &&
      (shipFrom.country || 'US').toUpperCase() === 'US';

    if (!isUSDomestic) {
      status.usps.message = 'USPS step covers US→US only.';
    } else if (!uspsUserId) {
      status.usps.message = 'Missing USPS_WEBTOOLS_USERID (or accepted alias) env var.';
    } else if (!shipFromOK) {
      status.usps.message = 'Missing SHIP_FROM_* env address.';
    } else {
      const uspsRates = await quoteUSPSAggregate({
        userId: uspsUserId,
        shipFromZip: shipFrom.postal,
        destZip: dest.postal,
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
    status.usps.message = `Error: ${String(e.message || e).slice(0, 300)}`;
  }

  // Return combined list (UI sorts/filters/labels)
  return asJSON(res, 200, { rates: outRates, status });
}
