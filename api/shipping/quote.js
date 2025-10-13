// /api/shipping/quote.js
// UPS + USPS (WebTools or Portal) with state/province normalization, parcel packing, and TQL placeholder.
// Switch USPS path via env: USPS_MODE=webtools|portal
export const config = { runtime: 'nodejs' };

import { getUspsOAuthToken } from '../_lib/oauth-usps.js'; // for portal mode only

const asJSON = (res, code, obj) => {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj, null, 2));
};
const toStr = (v) => (v ?? '').toString().trim();

// ---------------- State/Province normalization ----------------
const US_STATES = { ALABAMA:'AL', ALASKA:'AK', ARIZONA:'AZ', ARKANSAS:'AR', CALIFORNIA:'CA', COLORADO:'CO',
  CONNECTICUT:'CT', DELAWARE:'DE', 'DISTRICT OF COLUMBIA':'DC', FLORIDA:'FL', GEORGIA:'GA', HAWAII:'HI',
  IDAHO:'ID', ILLINOIS:'IL', INDIANA:'IN', IOWA:'IA', KANSAS:'KS', KENTUCKY:'KY', LOUISIANA:'LA', MAINE:'ME',
  MARYLAND:'MD', MASSACHUSETTS:'MA', MICHIGAN:'MI', MINNESOTA:'MN', MISSISSIPPI:'MS', MISSOURI:'MO',
  MONTANA:'MT', NEBRASKA:'NE', NEVADA:'NV', 'NEW HAMPSHIRE':'NH', 'NEW JERSEY':'NJ', 'NEW MEXICO':'NM',
  'NEW YORK':'NY', 'NORTH CAROLINA':'NC', 'NORTH DAKOTA':'ND', OHIO:'OH', OKLAHOMA:'OK', OREGON:'OR',
  PENNSYLVANIA:'PA', 'RHODE ISLAND':'RI', 'SOUTH CAROLINA':'SC', 'SOUTH DAKOTA':'SD', TENNESSEE:'TN',
  TEXAS:'TX', UTAH:'UT', VERMONT:'VT', VIRGINIA:'VA', WASHINGTON:'WA', 'WEST VIRGINIA':'WV', WISCONSIN:'WI', WYOMING:'WY' };
const CA_PROVINCES = { ALBERTA:'AB', 'BRITISH COLUMBIA':'BC', MANITOBA:'MB', 'NEW BRUNSWICK':'NB',
  'NEWFOUNDLAND AND LABRADOR':'NL', 'NOVA SCOTIA':'NS', 'NORTHWEST TERRITORIES':'NT', NUNAVUT:'NU',
  ONTARIO:'ON', 'PRINCE EDWARD ISLAND':'PE', QUEBEC:'QC', SASKATCHEWAN:'SK', YUKON:'YT' };

function stateToCode(country, input) {
  const s = toStr(input).toUpperCase();
  if (!s) return '';
  if (country === 'US') { if (US_STATES[s]) return US_STATES[s]; if (Object.values(US_STATES).includes(s)) return s; return ''; }
  if (country === 'CA') { if (CA_PROVINCES[s]) return CA_PROVINCES[s]; if (Object.values(CA_PROVINCES).includes(s)) return s; return ''; }
  return '';
}
const hasAll = (obj) => Object.values(obj).every(Boolean);

// ---------------- Packaging rules ----------------
function buildParcels(items) {
  let bulkUnits = 0, kits = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (it?.type === 'bulk') bulkUnits += Number(it.units || 0);
    if (it?.type === 'kit')  kits      += Number(it.qty   || 0);
  }
  const parcels = [];
  if (bulkUnits > 0) {
    const bags = Math.ceil(bulkUnits / 5000);
    for (let i = 0; i < bags; i++) parcels.push({ weightLbs: 19, lengthIn: 15, widthIn: 15, heightIn: 12, reference: 'bulk-5k' });
  }
  let remainingKits = kits;
  while (remainingKits > 0) {
    const k = Math.min(2, remainingKits);
    parcels.push({ weightLbs: 1.7 * k, lengthIn: 9, widthIn: 11, heightIn: 2, reference: `kits-${k}` });
    remainingKits -= k;
  }
  return parcels;
}

// ---------------- Placeholder TQL ----------------
function quoteTQLPlaceholder() {
  return [{ carrier: 'TQL', service: 'LTL Freight (placeholder)', amount: 92.00, currency: 'USD' }];
}

// ---------------- UPS (OAuth + Shop) ----------------
async function getUPSToken({ clientId, clientSecret, envBase }) {
  const url = `${envBase}/security/v1/oauth/token`;
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
  if (!r.ok) throw new Error(`UPS OAuth failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  if (!j?.access_token) throw new Error('UPS OAuth: no access_token');
  return j.access_token;
}

function makeUPSBody({ shipFrom, dest, shipperNumber, parcels }) {
  const shipToAddress = { AddressLine: [toStr(dest.street)].filter(Boolean), City: toStr(dest.city), PostalCode: toStr(dest.postal), CountryCode: dest.country };
  const destState = stateToCode(dest.country, dest.state); if (destState) shipToAddress.StateProvinceCode = destState;
  const shipFromAddress = { AddressLine: [toStr(shipFrom.street)].filter(Boolean), City: toStr(shipFrom.city), PostalCode: toStr(shipFrom.postal), CountryCode: toStr(shipFrom.country) || 'US' };
  const fromState = stateToCode(shipFrom.country || 'US', shipFrom.state); if (fromState) shipFromAddress.StateProvinceCode = fromState;

  return {
    RateRequest: {
      Shipment: {
        PickupType: { Code: '03' }, // force drop-off (Customer Counter)
        Shipper: { Name: shipFrom.name || 'Shipper', ShipperNumber: shipperNumber, Address: shipFromAddress },
        ShipFrom: { Name: shipFrom.name || 'Ship From', Address: shipFromAddress },
        ShipTo: { Name: 'Destination', Address: shipToAddress },
        Package: parcels.map((p) => ({
          PackagingType: { Code: '02' },
          Dimensions: { UnitOfMeasurement: { Code: 'IN' }, Length: String(p.lengthIn), Width: String(p.widthIn), Height: String(p.heightIn) },
          PackageWeight: { UnitOfMeasurement: { Code: 'LBS' }, Weight: String(Math.max(1, Math.round(p.weightLbs))) },
        })),
      },
    },
  };
}

async function quoteUPS({ envBase, token, shipperNumber, shipFrom, dest, parcels }) {
  const url = `${envBase}/api/rating/v1/Shop`;
  const body = makeUPSBody({ shipFrom, dest, shipperNumber, parcels });
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`UPS rate error ${r.status}: ${txt}`);
  let j; try { j = JSON.parse(txt); } catch { throw new Error(`UPS parse error: ${txt}`); }
  const rated = j?.RateResponse?.RatedShipment || j?.RateResponse?.RateResults || j?.RateResponse?.ShopResponse;
  const list = Array.isArray(rated) ? rated : (rated ? [rated] : []);
  const out = [];
  for (const rs of list) {
    const svcCode = rs?.Service?.Code;
    const svcDesc = rs?.Service?.Description || svcCode || 'UPS Service';
    const total = Number(rs?.TotalCharges?.MonetaryValue ?? rs?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue);
    if (Number.isFinite(total)) out.push({ carrier: 'UPS', service: mapUPSServiceLabel(svcCode, svcDesc), amount: total, currency: rs?.TotalCharges?.CurrencyCode || 'USD' });
  }
  return out;
}

function mapUPSServiceLabel(code, fallback) {
  const map = { '03': 'Ground', '12': '3 Day Select', '02': '2nd Day Air', '13': 'Next Day Air Saver', '01': 'Next Day Air', '14': 'Next Day Early AM', '65': 'Worldwide Saver', '07': 'Worldwide Express', '08': 'Worldwide Expedited', '11': 'Standard (Canada/Mexico)' };
  if (!code) return `UPS ${fallback || ''}`.trim();
  return `UPS ${map[code] || fallback || code}`;
}

// ---------------- USPS (A) Legacy WebTools (RateV4) ----------------
function poundsAndOunces(weightLbs) {
  const lbs = Math.floor(weightLbs);
  const oz  = Math.round((weightLbs - lbs) * 16);
  return { lbs: Math.max(0, lbs), oz: Math.max(0, oz) };
}
function buildUSPSRateV4XML({ userId, shipFromZip, destZip, parcels }) {
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
  return `API=RateV4&XML=${encodeURIComponent(`<RateV4Request USERID="${userId}">${pkgs}</RateV4Request>`)}`;
}
async function quoteUSPS_WebTools({ userId, shipFromZip, destZip, parcels }) {
  const query = buildUSPSRateV4XML({ userId, shipFromZip, destZip, parcels });
  const url   = `https://secure.shippingapis.com/ShippingAPI.dll?${query}`;
  const r = await fetch(url, { method: 'GET' });
  const xml = await r.text();
  if (!r.ok) throw new Error(`USPS HTTP ${r.status}: ${xml}`);
  if (/Error/i.test(xml)) throw new Error(`USPS API error: ${xml}`);
  const rates = [...xml.matchAll(/<Rate>([\d.]+)<\/Rate>/g)].map(m => Number(m[1]));
  if (!rates.length) throw new Error(`USPS: no <Rate> entries found`);
  const total = rates.reduce((a,b)=>a+b, 0);
  return [{ carrier: 'USPS', service: 'USPS Priority (sum of parcels)', amount: total, currency: 'USD' }];
}

// ---------------- USPS (B) Developer Portal (OAuth2 REST) ----------------
// We avoid hardcoding a path because USPS offers multiple products; provide URL via env.
async function quoteUSPS_Portal({ shipFrom, dest, parcels }) {
  const token = await getUspsOAuthToken();
  const rateUrl = process.env.USPS_PORTAL_RATE_URL; // e.g., your portal's Domestic Price endpoint
  if (!rateUrl) throw new Error("Missing USPS_PORTAL_RATE_URL env (portal pricing endpoint).");

  // Strategy: call once per parcel and sum (mirrors your WebTools summing).
  let total = 0;
  for (const p of parcels) {
    const body = {
      originPostalCode: shipFrom.postal,
      destinationPostalCode: dest.postal,
      countryCode: 'US',              // adjust if endpoint requires country fields
      destinationCountryCode: 'US',
      weight: { unit: 'LB', value: Math.max(1, Math.round(p.weightLbs)) },
      dimensions: { unit: 'IN', length: p.lengthIn, width: p.widthIn, height: p.heightIn },
      // Add any flags required by your product (e.g., machinable, container type, service filter)
    };

    const r = await fetch(rateUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`USPS portal rate error ${r.status}: ${JSON.stringify(j)}`);

    // Extract best/cheapest Priority-like price from the response structure your product returns.
    // This selection depends on your product schema; default to minimum total charge:
    const candidates = Array.isArray(j?.rates) ? j.rates : [];
    if (!candidates.length) throw new Error(`USPS portal: no rates returned for a parcel`);
    const cheapest = candidates.reduce((min, cur) => (Number(cur?.total || cur?.amount || 0) < Number(min?.total || min?.amount || Infinity) ? cur : min), candidates[0]);
    const money = Number(cheapest?.total || cheapest?.amount || 0);
    if (!Number.isFinite(money)) throw new Error(`USPS portal: missing amount in response`);
    total += money;
  }

  return [{ carrier: 'USPS', service: 'USPS (portal) - sum of parcels', amount: total, currency: 'USD' }];
}

// ---------------- Handler ----------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return asJSON(res, 405, { error: 'Method not allowed' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body||'{}') : (req.body||{}); } catch { body = req.body || {}; }

  const destination = body.destination || {};
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return asJSON(res, 400, { error: 'Missing items[]' });

  const destCountry = toStr(destination.country).toUpperCase() || 'US';
  const dest = { country: destCountry, state: toStr(destination.state), city: toStr(destination.city), postal: toStr(destination.postal), street: toStr(destination.street) };
  if (!dest.postal) return asJSON(res, 400, { error: 'Missing destination.postal' });

  const shipFrom = {
    name: process.env.SHIP_FROM_NAME,
    street: process.env.SHIP_FROM_STREET,
    city: process.env.SHIP_FROM_CITY,
    state: process.env.SHIP_FROM_STATE,
    postal: process.env.SHIP_FROM_ZIP,
    country: process.env.SHIP_FROM_COUNTRY || 'US',
  };
  const shipFromOK = hasAll({ name: !!shipFrom.name, street: !!shipFrom.street, city: !!shipFrom.city, state: !!shipFrom.state, postal: !!shipFrom.postal, country: !!shipFrom.country });

  const upsCreds = {
    clientId: process.env.UPS_CLIENT_ID,
    clientSecret: process.env.UPS_CLIENT_SECRET,
    shipperNumber: process.env.UPS_ACCOUNT_NUMBER,
    envBase: (process.env.UPS_ENV || 'test').toLowerCase().startsWith('prod') ? 'https://onlinetools.ups.com' : 'https://wwwcie.ups.com',
  };

  const parcels = buildParcels(items);
  const outRates = [];
  const status = { ups: { available: false, message: null }, usps: { available: false, message: null }, tql: { available: true, message: null } };

  // Always include TQL placeholder so the page shows something
  outRates.push(...quoteTQLPlaceholder());

  // UPS
  try {
    if (!upsCreds.clientId || !upsCreds.clientSecret || !upsCreds.shipperNumber) {
      status.ups.message = 'Missing UPS env vars (UPS_CLIENT_ID / UPS_CLIENT_SECRET / UPS_ACCOUNT_NUMBER).';
    } else if (!shipFromOK) {
      status.ups.message = 'Missing SHIP_FROM_* env address.';
    } else {
      const token = await getUPSToken(upsCreds);
      const upsRates = await quoteUPS({ envBase: upsCreds.envBase, token, shipperNumber: upsCreds.shipperNumber, shipFrom, dest: { ...dest }, parcels });
      if (upsRates.length) { outRates.push(...upsRates); status.ups.available = true; status.ups.message = `Returned ${upsRates.length} rate(s).`; }
      else status.ups.message = 'No UPS services returned.';
    }
  } catch (e) {
    status.ups.message = `Error: ${String(e.message||e).slice(0, 300)}`;
  }

  // USPS
  try {
    const mode = (process.env.USPS_MODE || 'webtools').toLowerCase();
    const isUSDomestic = dest.country === 'US' && (shipFrom.country || 'US').toUpperCase() === 'US';

    if (!isUSDomestic) {
      status.usps.message = 'USPS covers US→US only in this handler.';
    } else if (mode === 'portal') {
      // Portal (OAuth2 REST)
      if (!shipFromOK) status.usps.message = 'Missing SHIP_FROM_* env address.';
      else {
        const uspsRates = await quoteUSPS_Portal({ shipFrom, dest, parcels });
        if (uspsRates.length) { outRates.push(...uspsRates); status.usps.available = true; status.usps.message = `Portal: returned ${uspsRates.length} rate(s).`; }
        else status.usps.message = 'Portal: no USPS rates returned.';
      }
    } else {
      // WebTools (RateV4)
      const userId = process.env.USPS_WEBTOOLS_USERID;
      if (!userId) status.usps.message = 'Missing USPS_WEBTOOLS_USERID env var.';
      else if (!shipFromOK) status.usps.message = 'Missing SHIP_FROM_* env address.';
      else {
        const uspsRates = await quoteUSPS_WebTools({ userId, shipFromZip: shipFrom.postal, destZip: dest.postal, parcels });
        if (uspsRates.length) { outRates.push(...uspsRates); status.usps.available = true; status.usps.message = `WebTools: returned ${uspsRates.length} rate(s).`; }
        else status.usps.message = 'WebTools: no USPS rates returned.';
      }
    }
  } catch (e) {
    status.usps.message = `Error: ${String(e.message||e).slice(0, 300)}`;
  }

  const ratesSorted = outRates.filter(r => Number.isFinite(Number(r.amount))).sort((a, b) => Number(a.amount) - Number(b.amount));
  return asJSON(res, 200, { rates: ratesSorted, status });
}
