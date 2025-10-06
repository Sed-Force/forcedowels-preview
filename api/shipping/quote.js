// /api/shipping/quote.js  — master
// Runtime: Node on Vercel
export const config = { runtime: 'nodejs' };

/*
  Request body:
  {
    destination: { country:'US'|'CA'|'MX', state:'', city:'', postal:'' },
    items: [{type:'bulk', units:<int>} | {type:'kit', qty:<int>}]
  }

  Response:
  {
    rates: [{carrier, service, amount, currency}],
    status: {
      ups:   { ok, reason? },
      usps:  { ok, reason? },
      tql:   { ok: true }
    }
  }
*/

const USD = 'USD';

// ----------------------- Env helpers -----------------------
function getShipFrom() {
  const postal =
    process.env.SHIP_FROM_POSTAL ||
    process.env.SHIP_FROM_ZIP ||
    process.env.SHIP_FROM_ZIPCODE ||
    '';

  return {
    name:    process.env.SHIP_FROM_NAME    || 'Force Dowels',
    street:  process.env.SHIP_FROM_STREET  || '',
    city:    process.env.SHIP_FROM_CITY    || '',
    state:   process.env.SHIP_FROM_STATE   || '',
    postal,
    country: process.env.SHIP_FROM_COUNTRY || 'US',
  };
}

function getUPS() {
  return {
    clientId:       process.env.UPS_CLIENT_ID || '',
    clientSecret:   process.env.UPS_CLIENT_SECRET || '',
    shipperNumber:  process.env.UPS_ACCOUNT_NUMBER || '',
    env:            (process.env.UPS_ENV || 'test').toLowerCase(), // 'test' or 'live'
  };
}

function getUSPS() {
  // WebTools USERID (the one USPS gives you)
  const userId =
    process.env.USPS_WEBTOOLS_USER_ID ||
    process.env.USPS_CLIENT_ID ||      // fallback if you used CLIENT_ID for USERID
    process.env.USPS_USERID ||
    '';
  return { userId };
}

// ----------------------- Packaging -----------------------
// Box sizes (inches)
const SMALL_BOX = { L: 15, W: 15, H: 12 }; // 5k / 10k
const LARGE_BOX = { L: 22, W: 22, H: 12 }; // 15k / 20k
const KIT_BOX   = { L:  9, W: 11, H:  2 }; // 2 kits per parcel

// Known weights (lb)
const weightForUnits = (u) => {
  // exact for the common sizes, otherwise scale ~3.85 lb per 1k and round up
  if (u === 5000)  return 19;
  if (u === 10000) return 38;
  if (u === 15000) return 57;
  if (u === 20000) return 77;
  return Math.ceil(u * 0.00385); // fallback
};

function splitBulkForUPS(units) {
  // Prefer large boxes when possible; keep any remainder with the closest box
  const pkgs = [];
  let remain = units;

  while (remain >= 20000) {
    pkgs.push({ u: 20000, ...LARGE_BOX, weight: weightForUnits(20000) });
    remain -= 20000;
  }
  if (remain >= 15000) {
    pkgs.push({ u: 15000, ...LARGE_BOX, weight: weightForUnits(15000) });
    remain -= 15000;
  }
  if (remain >= 10000) {
    pkgs.push({ u: 10000, ...SMALL_BOX, weight: weightForUnits(10000) });
    remain -= 10000;
  }
  if (remain >= 5000) {
    pkgs.push({ u: 5000, ...SMALL_BOX, weight: weightForUnits(5000) });
    remain -= 5000;
  }
  return pkgs;
}

function splitBulkForUSPS(units) {
  // USPS can't exceed 70 lb, so keep each ≤ 10k
  const pkgs = [];
  let remain = units;

  while (remain >= 10000) {
    pkgs.push({ u: 10000, ...SMALL_BOX, weight: weightForUnits(10000) }); // ~38 lb
    remain -= 10000;
  }
  if (remain >= 5000) {
    pkgs.push({ u: 5000, ...SMALL_BOX, weight: weightForUnits(5000) }); // 19 lb
    remain -= 5000;
  }
  return pkgs;
}

function splitKits(qty) {
  // 2 kits per parcel @ 1.7 lb each
  const pkgs = [];
  let remaining = qty;
  while (remaining > 0) {
    const count = Math.min(2, remaining);
    const weight = Math.ceil(count * 1.7); // round up lb
    pkgs.push({ kits: count, ...KIT_BOX, weight });
    remaining -= count;
  }
  return pkgs;
}

function buildPackages(items, carrier, destCountry) {
  // carrier: 'UPS' | 'USPS'
  // returns [{ weight, L, W, H }]
  const pkgs = [];
  for (const it of items) {
    if (it.type === 'bulk') {
      if (carrier === 'USPS' && destCountry === 'US') {
        pkgs.push(...splitBulkForUSPS(Number(it.units || 0)));
      } else {
        // UPS (or USPS intl unsupported)
        pkgs.push(...splitBulkForUPS(Number(it.units || 0)));
      }
    } else if (it.type === 'kit') {
      pkgs.push(...splitKits(Number(it.qty || 0)));
    }
  }
  // Remove zeroes
  return pkgs.filter(p => p.weight > 0);
}

// ----------------------- UPS Rating -----------------------
async function upsGetToken(ups) {
  const base = ups.env === 'live' ? 'onlinetools.ups.com' : 'wwwcie.ups.com';
  const url  = `https://${base}/security/v1/oauth/token`;

  const body = new URLSearchParams({ grant_type: 'client_credentials' }).toString();
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-merchant-id': ups.shipperNumber, // recommended header
      Authorization:
        'Basic ' + Buffer.from(`${ups.clientId}:${ups.clientSecret}`).toString('base64'),
    },
    body,
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`UPS OAuth failed: ${resp.status} ${t}`);
  }
  const json = await resp.json();
  return json.access_token;
}

function upsServiceCode(from, dest) {
  // Domestic: Ground (03); to CA/MX: Standard (11); otherwise Expedited (08)
  if (from.country === 'US' && dest.country === 'US') return { code: '03', name: 'Ground' };
  if (from.country === 'US' && (dest.country === 'CA' || dest.country === 'MX'))
    return { code: '11', name: 'Standard' };
  return { code: '08', name: 'Worldwide Expedited' };
}

async function upsRate(from, dest, pkgs, ups) {
  if (!ups.clientId || !ups.clientSecret || !ups.shipperNumber) {
    return { ok: false, reason: 'Missing UPS credentials' };
  }
  const token = await upsGetToken(ups);

  const base = ups.env === 'live' ? 'onlinetools.ups.com' : 'wwwcie.ups.com';
  const url  = `https://${base}/api/rating/v2403/Rate`; // latest as of 2024

  const svc = upsServiceCode(from, dest);

  const Shipment = {
    Shipper: {
      ShipperNumber: ups.shipperNumber,
      Address: { PostalCode: from.postal, CountryCode: from.country },
    },
    ShipTo:   { Address: { PostalCode: dest.postal, CountryCode: dest.country } },
    ShipFrom: { Address: { PostalCode: from.postal, CountryCode: from.country } },
    Service:  { Code: svc.code },
    PaymentDetails: {
      ShipmentCharge: [{ Type: '01', BillShipper: { AccountNumber: ups.shipperNumber } }],
    },
    Package: pkgs.map(p => ({
      PackagingType: { Code: '02' }, // Customer Supplied
      Dimensions: {
        UnitOfMeasurement: { Code: 'IN' },
        Length: String(p.L),
        Width:  String(p.W),
        Height: String(p.H),
      },
      PackageWeight: {
        UnitOfMeasurement: { Code: 'LBS' },
        Weight: String(Math.max(1, p.weight)),
      },
    })),
    ShipmentRatingOptions: { NegotiatedRatesIndicator: 'true' }, // if enabled
  };

  const body = { RateRequest: { Shipment } };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      transId: `${Date.now()}`,
      transactionSrc: 'FD-quote',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, reason: `UPS rate error: ${resp.status} ${t}` };
  }

  const data = await resp.json();
  // Find charges
  const rated = data?.RateResponse?.RatedShipment?.[0] || data?.RateResponse?.RatedShipment;
  const total = rated?.TotalCharges?.MonetaryValue || rated?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue;
  const currency = rated?.TotalCharges?.CurrencyCode || 'USD';
  if (!total) return { ok: false, reason: 'UPS: No price in response' };

  return {
    ok: true,
    rate: { carrier: 'UPS', service: svc.name, amount: Number(total), currency },
  };
}

// ----------------------- USPS Rating (domestic only) -----------------------
function toLbsOz(lb) {
  const lbs = Math.floor(lb);
  const oz  = Math.round((lb - lbs) * 16);
  return { lbs, oz };
}

function rateV4XML(userId, from, dest, pkgs, container = 'RECTANGULAR') {
  let id = 0;
  const packagesXML = pkgs.map(p => {
    const { lbs, oz } = toLbsOz(p.weight);
    return `
      <Package ID="${++id}">
        <Service>PRIORITY</Service>
        <ZipOrigination>${from.postal}</ZipOrigination>
        <ZipDestination>${dest.postal}</ZipDestination>
        <Pounds>${lbs}</Pounds>
        <Ounces>${oz}</Ounces>
        <Container>${container}</Container>
        <Width>${p.W}</Width>
        <Length>${p.L}</Length>
        <Height>${p.H}</Height>
        <Machinable>false</Machinable>
      </Package>`;
  }).join('\n');

  return `<RateV4Request USERID="${userId}">${packagesXML}</RateV4Request>`;
}

async function uspsPriority(from, dest, pkgs, usps) {
  if (dest.country !== 'US') {
    return { ok: false, reason: 'USPS domestic only in this version' };
  }
  if (!usps.userId) {
    return { ok: false, reason: 'Missing USPS WebTools USERID' };
  }
  if (!pkgs.length) {
    return { ok: false, reason: 'No mailable packages for USPS' };
  }

  const xml = rateV4XML(usps.userId, from, dest, pkgs);
  const url = `https://secure.shippingapis.com/ShippingAPI.dll?API=RateV4&XML=${encodeURIComponent(xml)}`;

  const resp = await fetch(url);
  if (!resp.ok) return { ok: false, reason: `USPS error ${resp.status}` };
  const text = await resp.text();

  // naïve parse: find all <Rate> values and sum them
  const rates = Array.from(text.matchAll(/<Rate>([\d.]+)<\/Rate>/g)).map(m => Number(m[1]));
  if (!rates.length) {
    // often errors come as <Error><Description>...</Description></Error>
    const err = (text.match(/<Description>([^<]+)<\/Description>/) || [])[1];
    return { ok: false, reason: err || 'USPS: No rate returned' };
  }
  const total = rates.reduce((a, b) => a + b, 0);
  return { ok: true, rate: { carrier: 'USPS', service: 'Priority Mail', amount: Number(total.toFixed(2)), currency: USD } };
}

// USPS Medium Flat Rate for kits-only carts
async function uspsMediumFlatRateForKits(from, dest, kitQty, usps) {
  if (dest.country !== 'US') return null;
  if (!usps.userId) return null;
  if (kitQty <= 0) return null;

  const boxes = Math.ceil(kitQty / 5); // up to 5 kits per MFR box
  // Ask USPS for PRIORITY + MediumFlatRateBox
  const pkgs = new Array(boxes).fill(0).map(() => ({ L: 14, W: 12, H: 3.5, weight: 5 })); // dims are ignored by container type

  const xml = rateV4XML(usps.userId, from, dest, pkgs, 'MediumFlatRateBox');
  const url = `https://secure.shippingapis.com/ShippingAPI.dll?API=RateV4&XML=${encodeURIComponent(xml)}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const text = await resp.text();
  const rates = Array.from(text.matchAll(/<Rate>([\d.]+)<\/Rate>/g)).map(m => Number(m[1]));
  if (!rates.length) return null;
  const total = rates.reduce((a, b) => a + b, 0);
  return { carrier: 'USPS', service: 'Priority – Medium Flat Rate (kits)', amount: Number(total.toFixed(2)), currency: USD };
}

// ----------------------- Handler -----------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { destination, items } = await readJson(req);
    const from  = getShipFrom();
    const ups   = getUPS();
    const usps  = getUSPS();

    // Basic presence checks for status panel
    const status = {
      ups:  ups.clientId && ups.clientSecret && ups.shipperNumber ? { ok: true } : { ok: false, reason: 'Missing credentials' },
      usps: usps.userId ? { ok: true } : { ok: false, reason: 'Missing WebTools USERID' },
      tql:  { ok: true },
    };

    // Build packages per carrier
    const upsPkgs  = buildPackages(items, 'UPS',  destination.country);
    const uspsPkgs = destination.country === 'US' ? buildPackages(items, 'USPS', destination.country) : [];

    const quotes = [];

    // ---- UPS live (Ground/Standard) ----
    if (status.ups.ok && upsPkgs.length) {
      try {
        const q = await upsRate(from, destination, upsPkgs, ups);
        if (q.ok) quotes.push(q.rate);
        else status.ups = { ok: false, reason: q.reason };
      } catch (e) {
        status.ups = { ok: false, reason: String(e.message || e) };
      }
    }

    // ---- USPS live (Priority) ----
    if (status.usps.ok && uspsPkgs.length && destination.country === 'US') {
      try {
        const q = await uspsPriority(from, destination, uspsPkgs, usps);
        if (q.ok) quotes.push(q.rate);
        else status.usps = { ok: false, reason: q.reason };
      } catch (e) {
        status.usps = { ok: false, reason: String(e.message || e) };
      }
    }

    // ---- USPS MFR option for kits-only carts ----
    const kitsOnly = items.every(it => it.type === 'kit');
    if (kitsOnly && status.usps.ok && destination.country === 'US') {
      const totalKits = items.reduce((s, it) => s + (it.qty || 0), 0);
      const mfr = await uspsMediumFlatRateForKits(from, destination, totalKits, usps);
      if (mfr) quotes.push(mfr);
    }

    // ---- TQL placeholder (until wired) ----
    // Keep a sanity placeholder so the UI can be used.
    quotes.push({ carrier: 'TQL', service: 'LTL Freight (placeholder)', amount: 92.00, currency: USD });

    // Sort by price ascending
    quotes.sort((a, b) => a.amount - b.amount);

    res.status(200).json({ rates: quotes, status });
  } catch (e) {
    res.status(500).json({ error: 'quote_failed', message: String(e.message || e) });
  }
}

// ----------------------- Utils -----------------------
async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
