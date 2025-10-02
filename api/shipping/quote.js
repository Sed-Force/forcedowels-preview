// /api/shipping/quote.js
// Live quotes for UPS + USPS (US) and an LTL estimate fallback (TQL placeholder).
// No external deps; uses global fetch in Vercel Node runtime.

const ORIGIN = {
  name:    process.env.ORIGIN_NAME    || 'Force Dowels',
  street:  process.env.ORIGIN_STREET  || '4455 E Nunneley Rd, Ste 103',
  city:    process.env.ORIGIN_CITY    || 'Gilbert',
  state:   process.env.ORIGIN_STATE   || 'AZ',
  postal:  process.env.ORIGIN_POSTAL  || '85296',
  country: process.env.ORIGIN_COUNTRY || 'US',
};

// Accept both UPPER and lower case env names
const UPS = {
  clientId:
    process.env.UPS_CLIENT_ID ||
    process.env.ups_client_id || '',
  clientSecret:
    process.env.UPS_CLIENT_SECRET ||
    process.env.ups_client_secret || '',
  shipperNumber:
    process.env.UPS_SHIPPER_NUMBER ||
    process.env.ups_shipper_number || '',
};

const USPS_USER =
  process.env.USPS_WEBTOOLS_USERID ||
  process.env.USPS_CLIENT_ID ||
  process.env.USPS_USER_ID ||
  process.env.usps_webtools_userid ||
  process.env.usps_client_id ||
  process.env.usps_user_id || '';

// Packaging rules
const BULK_STEP   = 5000;
const LBS_PER_5K  = 19; // round up per your note
const BOX_A = { l: 15, w: 15, h: 12 }; // 5k/10k
const BOX_B = { l: 22, w: 22, h: 12 }; // 15k/20k

// Starter kits: 9x11x2", up to 2 per box, 1.7 lb each
const KIT_BOX = { l: 11, w: 9, h: 2, maxKits: 2, kitWeight: 1.7 };

// --------------- helpers ---------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(id);
  }
}

function round(n) { return Math.round(n * 1000) / 1000; }
function isUS(c)  { return (c || '').toUpperCase() === 'US'; }

function normalizeCountry(c) {
  if (!c) return 'US';
  const t = String(c).trim().toUpperCase();
  if (['UNITED STATES','USA','US'].includes(t)) return 'US';
  if (['CANADA','CA'].includes(t)) return 'CA';
  if (['MEXICO','MX'].includes(t)) return 'MX';
  return t;
}

// Bulk packing
function packBulk(units) {
  let left = Math.max(0, units|0);
  const boxes = [];
  while (left >= 20000) { boxes.push({ type:'bulk', units:20000, weight:LBS_PER_5K*4, dims:BOX_B }); left -= 20000; }
  while (left >= 15000) { boxes.push({ type:'bulk', units:15000, weight:LBS_PER_5K*3, dims:BOX_B }); left -= 15000; }
  while (left >= 10000) { boxes.push({ type:'bulk', units:10000, weight:LBS_PER_5K*2, dims:BOX_A }); left -= 10000; }
  while (left >=  5000) { boxes.push({ type:'bulk', units: 5000, weight:LBS_PER_5K,   dims:BOX_A }); left -=  5000; }
  return boxes;
}

// Kit packing
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
  for (const it of (items || [])) {
    if (it?.type === 'bulk') {
      const u = Number(it.units || 0);
      if (u >= BULK_STEP) pkgs.push(...packBulk(u));
    } else if (it?.type === 'kit') {
      const q = Number(it.qty || 0);
      if (q > 0) pkgs.push(...packKits(q));
    }
  }
  return pkgs;
}

// --------------- USPS (domestic) ---------------
async function uspsRateDomestic(pkg, dest) {
  if (!USPS_USER) return null;

  const pounds = Math.max(0, Math.ceil(pkg.weight || 1));
  const ounces = 0;
  const container =
    (pkg.type === 'kit' && pkg.kits <= 5) ? 'MediumFlatRateBox' : '';
  const size = (pkg.dims.l > 12 || pkg.dims.w > 12 || pkg.dims.h > 12)
    ? 'LARGE' : 'REGULAR';

  const xml =
    `<RateV4Request USERID="${USPS_USER}">
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
    </RateV4Request>`.replace(/\s+/g,' ').trim();

  const url = `https://secure.shippingapis.com/ShippingAPI.dll?API=RateV4&XML=${encodeURIComponent(xml)}`;

  const res  = await fetchWithTimeout(url, {}, 7000).catch(e => { throw e; });
  const text = await res.text();

  if (/<Error>/i.test(text)) {
    console.error('USPS error:', text);
    return null;
  }

  const rateMatch = text.match(/<Rate>([\d.]+)<\/Rate>/i);
  const amount = rateMatch ? Number(rateMatch[1]) : null;
  if (!amount) return null;

  const service = container ? 'Priority Mail Medium Flat Rate' : 'Priority Mail';
  return { carrier:'USPS', service, amount, currency:'USD' };
}

async function uspsQuote(packages, dest) {
  if (!isUS(dest.country) || !USPS_USER) return [];
  const promises = packages.map(p => uspsRateDomestic(p, dest));
  const settled  = await Promise.allSettled(promises);
  const perBox   = settled
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  if (!perBox.length) return [];
  const total = perBox.reduce((s,r)=> s + (r.amount||0), 0);
  return [{ carrier:'USPS', service:'USPS (combined)', amount: total, currency:'USD' }];
}

// --------------- UPS OAuth + Rate (timeouts + version fallback) ---------------
async function upsToken() {
  if (!UPS.clientId || !UPS.clientSecret) return null;
  try {
    const res = await fetchWithTimeout('https://www.ups.com/security/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type':'application/x-www-form-urlencoded',
        'Accept':'application/json',
        ...(UPS.shipperNumber ? {'x-merchant-id': UPS.shipperNumber} : {}),
        'Authorization': 'Basic ' + Buffer.from(`${UPS.clientId}:${UPS.clientSecret}`).toString('base64'),
      },
      body: 'grant_type=client_credentials',
    }, 6000);
    if (!res.ok) {
      console.error('UPS token HTTP', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data?.access_token || null;
  } catch (e) {
    console.error('UPS token error', e);
    return null;
  }
}

async function upsRatePackageWithVersion(token, pkg, dest, version) {
  const endpoint = `https://onlinetools.ups.com/api/rating/${version}/Rate`;
  const body = {
    RateRequest: {
      Request: { TransactionReference: { CustomerContext: 'Force Dowels' } },
      Shipment: {
        Shipper: {
          Name: ORIGIN.name,
          ShipperNumber: UPS.shipperNumber || undefined,
          Address: {
            AddressLine: ORIGIN.street,
            City: ORIGIN.city,
            StateProvinceCode: ORIGIN.state,
            PostalCode: ORIGIN.postal,
            CountryCode: ORIGIN.country,
          },
        },
        ShipTo: {
          Name: dest.name || 'Customer',
          Address: {
            AddressLine: dest.street || '',
            City: dest.city || '',
            StateProvinceCode: dest.state || '',
            PostalCode: dest.postal || '',
            CountryCode: dest.country,
          },
        },
        ShipFrom: {
          Name: ORIGIN.name,
          Address: {
            AddressLine: ORIGIN.street,
            City: ORIGIN.city,
            StateProvinceCode: ORIGIN.state,
            PostalCode: ORIGIN.postal,
            CountryCode: ORIGIN.country,
          },
        },
        Package: [{
          PackagingType: { Code: '02' }, // customer supplied
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

  const res = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type':'application/json',
      'Accept':'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  }, 7000);

  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    console.error(`UPS rate HTTP ${res.status} (v=${version}):`, t);
    return null;
  }
  const data = await res.json().catch(()=>null);
  const rated = data?.RateResponse?.RatedShipment;
  if (!rated) return null;

  const arr = Array.isArray(rated) ? rated : [rated];
  let best = null;
  for (const r of arr) {
    const v = Number(r?.TotalCharges?.MonetaryValue);
    const c = r?.TotalCharges?.CurrencyCode || 'USD';
    if (Number.isFinite(v)) {
      if (!best || v < best.amount) best = { amount: v, currency: c };
    }
  }
  if (!best) return null;
  return { carrier:'UPS', service:'UPS (per box)', amount: best.amount, currency: best.currency };
}

async function upsQuote(packages, dest) {
  const token = await upsToken();
  if (!token) return [];

  const versions = ['v2405', 'v2403', 'v2205'];
  // For each box, try versions until one works, in parallel:
  const promises = packages.map(async (p) => {
    for (const v of versions) {
      const r = await upsRatePackageWithVersion(token, p, dest, v);
      if (r) return r;
    }
    return null;
  });

  const settled = await Promise.allSettled(promises);
  const perBox  = settled
    .filter(s => s.status === 'fulfilled' && s.value)
    .map(s => s.value);

  if (!perBox.length) return [];
  const total = perBox.reduce((s,r)=> s + (r.amount||0), 0);
  return [{ carrier:'UPS', service:'UPS (combined)', amount: total, currency:'USD' }];
}

// --------------- TQL LTL (estimate) ---------------
function tqlEstimate(packages, dest) {
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

// --------------- handler ---------------
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let { items = [], destination } = req.body || {};
    if (!Array.isArray(items)) items = [];

    if (!destination) return res.status(400).json({ error: 'Missing destination' });

    const dest = {
      country: normalizeCountry(destination.country || 'US'),
      state:   String(destination.state || '').toUpperCase(),
      city:    String(destination.city || ''),
      postal:  String(destination.postal || ''),
      street:  String(destination.street || ''),
      name:    String(destination.name || 'Customer'),
    };
    if (!dest.postal) return res.status(400).json({ error: 'Destination postal/ZIP required' });

    const pkgs = buildPackages(items);
    if (!pkgs.length) return res.status(400).json({ error: 'No shippable items' });

    // Run carriers in parallel with independent timeouts
    const tasks = [
      (async () => isUS(dest.country) ? await uspsQuote(pkgs, dest) : [])(),
      (async () => await upsQuote(pkgs, dest))(),
    ];

    let quotes = [];
    const settled = await Promise.allSettled(tasks);
    for (const r of settled) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) quotes.push(...r.value);
    }

    if (shouldPreferLTL(pkgs)) quotes.push(tqlEstimate(pkgs, dest));
    if (!quotes.length)        quotes.push(tqlEstimate(pkgs, dest));

    const normalized = quotes
      .filter(q => Number.isFinite(q.amount))
      .map(q => ({ ...q, currency: (q.currency || 'USD').toUpperCase() }))
      .sort((a,b) => a.amount - b.amount);

    return res.status(200).json({ rates: normalized, packages: pkgs });
  } catch (e) {
    console.error('Quote error:', e);
    return res.status(500).json({ error: 'Failed to get rates' });
  }
};

module.exports.config = { runtime: 'nodejs' };
