// /api/shipping/quote.js
// Quotes shipping for cart items using UPS + USPS (live) and an LTL estimate (TQL placeholder).
const fetch = require('node-fetch');

const ORIGIN = {
  name:   process.env.ORIGIN_NAME   || 'Force Dowels',
  street: process.env.ORIGIN_STREET || '4455 E Nunneley Rd, Ste 103',
  city:   process.env.ORIGIN_CITY   || 'Gilbert',
  state:  process.env.ORIGIN_STATE  || 'AZ',
  postal: process.env.ORIGIN_POSTAL || '85296',
  country:process.env.ORIGIN_COUNTRY|| 'US',
};

const UPS = {
  clientId:     process.env.UPS_CLIENT_ID || '',
  clientSecret: process.env.UPS_CLIENT_SECRET || '',
  shipperNumber:process.env.UPS_SHIPPER_NUMBER || '',
};

const USPS = {
  userId: process.env.USPS_WEBTOOLS_USERID || '', // recommended USPS WebTools UserID
};

// Packaging rules
const BULK_STEP  = 5000;
const LBS_PER_5K = 19;        // round up 5,000 → 19 lb
// Boxes:
//  - 5k/10k: 15x15x12
//  - 15k/20k: 22x22x12
const BOX_A = { l: 15, w: 15, h: 12 }; // fits up to 10k
const BOX_B = { l: 22, w: 22, h: 12 }; // fits up to 20k
// Starter kits: 9x11x2, up to 2 kits/box, 1.7 lb each
const KIT_BOX = { l: 11, w: 9, h: 2, maxKits: 2, kitWeight: 1.7 };

function round(n) { return Math.round(n * 1000) / 1000; }

// Compute packages for bulk units
function packBulk(units) {
  let left = units;
  const boxes = [];

  while (left >= 20000) {
    boxes.push({ type: 'bulk', units: 20000, weight: LBS_PER_5K * 4, dims: BOX_B });
    left -= 20000;
  }
  while (left >= 10000) {
    boxes.push({ type: 'bulk', units: 10000, weight: LBS_PER_5K * 2, dims: BOX_A });
    left -= 10000;
  }
  while (left >= 15000) {
    boxes.push({ type: 'bulk', units: 15000, weight: LBS_PER_5K * 3, dims: BOX_B });
    left -= 15000;
  }
  while (left >= 5000) {
    boxes.push({ type: 'bulk', units: 5000, weight: LBS_PER_5K, dims: BOX_A });
    left -= 5000;
  }
  return boxes;
}

function packKits(qty) {
  const out = [];
  let remaining = Math.max(0, qty|0);
  while (remaining > 0) {
    const inBox = Math.min(KIT_BOX.maxKits, remaining);
    out.push({
      type: 'kit',
      kits: inBox,
      weight: round(inBox * KIT_BOX.kitWeight),
      dims: { l: KIT_BOX.l, w: KIT_BOX.w, h: KIT_BOX.h },
    });
    remaining -= inBox;
  }
  return out;
}

function buildPackages(items) {
  const pkgs = [];
  for (const it of items) {
    if (it.type === 'bulk') {
      const u = Number(it.units || 0);
      if (u >= BULK_STEP) pkgs.push(...packBulk(u));
    } else if (it.type === 'kit') {
      const q = Number(it.qty || 0);
      if (q > 0) pkgs.push(...packKits(q));
    }
  }
  return pkgs;
}

// ----- USPS (WebTools) live rating (domestic only here for brevity) -----
async function uspsRateDomestic(pkg, dest) {
  if (!USPS.userId) return null;

  // USPS expects ounces. 1 lb = 16 oz
  const weightLbs = Math.ceil(pkg.weight || 1);
  const pounds = Math.max(0, weightLbs);
  const ounces = 0;

  // Priority Mail (Retail) example. Container options can include "MediumFlatRateBox".
  const container = (pkg.type === 'kit' && pkg.kits <= 5) ? 'MediumFlatRateBox' : '';
  const size = (pkg.dims.l > 12 || pkg.dims.w > 12 || pkg.dims.h > 12) ? 'LARGE' : 'REGULAR';

  const xml = `
    <RateV4Request USERID="${USPS.userId}">
      <Revision>2</Revision>
      <Package ID="1">
        <Service>PRIORITY</Service>
        <ZipOrigination>${ORIGIN.postal}</ZipOrigination>
        <ZipDestination>${dest.postal}</ZipDestination>
        <Pounds>${pounds}</Pounds>
        <Ounces>${ounces}</Ounces>
        <Container>${container}</Container>
        <Size>${size}</Size>
        <Width>${pkg.dims.w}</Width>
        <Length>${pkg.dims.l}</Length>
        <Height>${pkg.dims.h}</Height>
        <Machinable>true</Machinable>
      </Package>
    </RateV4Request>`.replace(/\s+/g, ' ').trim();

  const url = `https://secure.shippingapis.com/ShippingAPI.dll?API=RateV4&XML=${encodeURIComponent(xml)}`;
  const res = await fetch(url);
  const text = await res.text();

  const rateMatch = text.match(/<Rate>([\d.]+)<\/Rate>/i);
  const amount = rateMatch ? Number(rateMatch[1]) : null;
  if (!amount) return null;

  const service = container === 'MediumFlatRateBox' ? 'Priority Mail Medium Flat Rate' : 'Priority Mail';
  return { carrier: 'USPS', service, amount, currency: 'USD' };
}

async function uspsQuote(packages, dest) {
  if (dest.country !== 'US') return [];
  const results = [];
  for (const p of packages) {
    const r = await uspsRateDomestic(p, dest).catch(()=>null);
    if (r) results.push(r);
  }
  if (!results.length) return [];
  const total = results.reduce((s,r)=>s + (r.amount||0), 0);
  return [{ carrier:'USPS', service:'USPS (combined)', amount: total, currency:'USD' }];
}

// ----- UPS OAuth + Rate (simplified) -----
async function upsToken() {
  if (!UPS.clientId || !UPS.clientSecret) return null;
  const res = await fetch('https://www.ups.com/security/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type':'application/x-www-form-urlencoded',
      'x-merchant-id': UPS.shipperNumber || '',
      'Accept':'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${UPS.clientId}:${UPS.clientSecret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

async function upsRatePackage(token, pkg, dest) {
  // If this returns 404 for your account, change v2405 -> v2403 or v2205
  const endpoint = 'https://onlinetools.ups.com/api/rating/v2405/Rate';
  const body = {
    RateRequest: {
      Request: { TransactionReference: { CustomerContext: 'Force Dowels' } },
      Shipment: {
        Shipper: {
          Name: ORIGIN.name,
          ShipperNumber: UPS.shipperNumber || undefined,
          Address: { AddressLine: ORIGIN.street, City: ORIGIN.city, StateProvinceCode: ORIGIN.state, PostalCode: ORIGIN.postal, CountryCode: ORIGIN.country },
        },
        ShipTo: {
          Name: dest.name || 'Customer',
          Address: { AddressLine: dest.street || '', City: dest.city || '', StateProvinceCode: dest.state || '', PostalCode: dest.postal, CountryCode: dest.country },
        },
        ShipFrom: {
          Name: ORIGIN.name,
          Address: { AddressLine: ORIGIN.street, City: ORIGIN.city, StateProvinceCode: ORIGIN.state, PostalCode: ORIGIN.postal, CountryCode: ORIGIN.country },
        },
        Service: { Code: '03' }, // Ground (placeholder)
        Package: [{
          PackagingType: { Code: '02' }, // Customer supplied
          Dimensions: {
            UnitOfMeasurement: { Code: 'IN' },
            Length: String(pkg.dims.l),
            Width:  String(pkg.dims.w),
            Height: String(pkg.dims.h),
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: 'LBS' },
            Weight: String(Math.ceil(pkg.weight || 1)),
          },
        }],
      },
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type':'application/json',
      'Accept':'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const data = await res.json().catch(()=>null);
  const monetary = data?.RateResponse?.RatedShipment?.TotalCharges?.MonetaryValue;
  const currency = data?.RateResponse?.RatedShipment?.TotalCharges?.CurrencyCode || 'USD';
  if (!monetary) return null;
  return { carrier:'UPS', service:'Ground', amount: Number(monetary), currency };
}

async function upsQuote(packages, dest) {
  const token = await upsToken();
  if (!token) return [];
  const out = [];
  for (const p of packages) {
    const r = await upsRatePackage(token, p, dest).catch(()=>null);
    if (r) out.push(r);
  }
  if (!out.length) return [];
  const total = out.reduce((s,r)=> s + (r.amount||0), 0);
  return [{ carrier:'UPS', service:'UPS (combined)', amount: total, currency:'USD' }];
}

// ----- TQL LTL (placeholder estimate) -----
function tqlEstimate(packages, dest) {
  // Very rough: $0.45/lb domestic, $0.55/lb CA/MX, min $180
  const totalWeight = packages.reduce((s,p)=> s + (p.weight||0), 0);
  const perLb = (dest.country === 'CA' || dest.country === 'MX') ? 0.55 : 0.45;
  const estimate = Math.max(180, Math.ceil(totalWeight * perLb));
  return { carrier:'TQL', service:'LTL (estimated)', amount: estimate, currency:'USD' };
}

function shouldPreferLTL(packages) {
  const totalWeight = packages.reduce((s,p)=> s + (p.weight||0), 0);
  const oversized = packages.some(p => Math.max(p.dims.l, p.dims.w, p.dims.h) > 48);
  return totalWeight > 150 || packages.length > 6 || oversized;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow','POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { items = [], destination } = req.body || {};
    if (!Array.isArray(items) || !destination || !destination.country || !destination.postal) {
      return res.status(400).json({ error: 'Missing items or destination' });
    }

    const pkgs = buildPackages(items);

    const dest = {
      country: (destination.country || 'US').toUpperCase(),
      state:   (destination.state || '').toUpperCase(),
      city:     destination.city || '',
      postal:   destination.postal || '',
      street:   destination.street || '',
      name:     destination.name || 'Customer',
    };

    const quotes = [];

    // USPS (domestic snippet)
    if (dest.country === 'US') {
      const usps = await uspsQuote(pkgs, dest).catch(()=>[]);
      quotes.push(...usps);
    }

    // UPS
    const ups = await upsQuote(pkgs, dest).catch(()=>[]);
    quotes.push(...ups);

    // LTL estimate
    if (shouldPreferLTL(pkgs)) {
      quotes.push(tqlEstimate(pkgs, dest));
    }

    if (!quotes.length) {
      quotes.push(tqlEstimate(pkgs, dest));
    }

    const normalized = quotes
      .filter(q => Number.isFinite(q.amount))
      .map(q => ({ ...q, currency: (q.currency || 'USD').toUpperCase() }))
      .sort((a,b) => a.amount - b.amount);

    return res.status(200).json({ rates: normalized, packages: pkgs });
  } catch (e) {
    console.error('Quote error:', e);
    return res.status(500).json({ error: 'Failed to get rates' });
  }
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs' };

