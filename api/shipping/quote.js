// MASTER: /api/shipping/quote.js
// Shipping quote endpoint with full packaging logic, USPS Medium Flat Rate for kits,
// TQL (LTL) placeholder, and rich diagnostics for UPS/USPS readiness.
// Runtime: Vercel Node
export const config = { runtime: 'nodejs' };

/* =============================
   Helpers
============================= */
function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function roundUp(n) {
  return Math.ceil(Number(n) || 0);
}

function lbToOz(lb) {
  return Math.round((Number(lb) || 0) * 16);
}

/* =============================
   Environment & Carrier Readiness
============================= */
function getUPSStatus() {
  const clientId  = process.env.UPS_CLIENT_ID     || process.env.UPS_API_CLIENT_ID;
  const secret    = process.env.UPS_CLIENT_SECRET || process.env.UPS_API_CLIENT_SECRET;
  const acct      = process.env.UPS_ACCOUNT_NUMBER || process.env.UPS_SHIPPER_NUMBER;
  const shipFrom  = getShipFrom();
  if (!clientId || !secret)    return { ok:false, carrier:'UPS',  reason:'Missing UPS client id/secret' };
  if (!acct)                   return { ok:false, carrier:'UPS',  reason:'Missing UPS shipper/account number' };
  if (!shipFrom?.postal)       return { ok:false, carrier:'UPS',  reason:'Missing ship-from postal (env)' };
  return { ok:true,  carrier:'UPS' };
}

function getUSPSStatus() {
  const userId = process.env.USPS_WEBTOOLS_USER_ID || process.env.USPS_CLIENT_ID || process.env.USPS_USERID;
  const shipFrom = getShipFrom();
  if (!userId)               return { ok:false, carrier:'USPS', reason:'Missing USPS Web Tools USERID' };
  if (!shipFrom?.postal)     return { ok:false, carrier:'USPS', reason:'Missing ship-from postal (env)' };
  return { ok:true,  carrier:'USPS', userId };
}

function getTQLStatus() {
  const have =
    !!process.env.TQL_CLIENT_ID &&
    !!process.env.TQL_CLIENT_SECRET &&
    !!process.env.TQL_USERNAME &&
    !!process.env.TQL_PASSWORD;
  return have ? { ok:true, carrier:'TQL' } : { ok:false, carrier:'TQL', reason:'Missing TQL credentials' };
}

function getShipFrom() {
  return {
    name:   process.env.SHIP_FROM_NAME   || 'Force Dowels',
    street: process.env.SHIP_FROM_STREET || '',
    city:   process.env.SHIP_FROM_CITY   || '',
    state:  process.env.SHIP_FROM_STATE  || '',
    postal: process.env.SHIP_FROM_POSTAL || '',
    country:process.env.SHIP_FROM_COUNTRY|| 'US',
  };
}

/* =============================
   Cart → Packages (Packaging Logic)
   Spec provided by you:

   BULK (dowels):
   - 5k   box: 15x15x12 in, 19 lb
   - 10k  box: 15x15x12 in, 38 lb
   - 15k  box: 22x22x12 in, 57 lb
   - 20k  box: 22x22x12 in, 76 lb
   - Larger quantities = combinations of the above.
   (We’ll use greedy: 20k -> 15k -> 10k -> 5k)

   KITS:
   - Each kit weighs 1.7 lb.
   - UPS parcel for kits: 9x11x2 in, max 2 kits per package (so up to 3.4 lb each).
   - USPS Medium Flat Rate option for kits: max 5 kits/flat-rate box.

============================= */
const BOX_SPECS = [
  { units: 20000, dims: { l:22, w:22, h:12 }, weightLb: 76 },
  { units: 15000, dims: { l:22, w:22, h:12 }, weightLb: 57 },
  { units: 10000, dims: { l:15, w:15, h:12 }, weightLb: 38 },
  { units:  5000, dims: { l:15, w:15, h:12 }, weightLb: 19 },
];

const KIT_PER_UPS_BOX = 2;
const KIT_BOX_DIMS = { l:9, w:11, h:2 }; // UPS parcel for kits
const KIT_WEIGHT_LB = 1.7;

const KIT_PER_USPS_MFR = 5; // USPS Medium Flat Rate capacity

function splitBulkUnitsToBoxes(totalUnits) {
  const boxes = [];
  let remain = Number(totalUnits) || 0;
  for (const spec of BOX_SPECS) {
    while (remain >= spec.units) {
      boxes.push({ ...spec });
      remain -= spec.units;
    }
  }
  if (remain > 0) {
    // If you ever allow non-5k multiples, round up to nearest 5k box:
    const last = BOX_SPECS[BOX_SPECS.length - 1]; // 5k
    boxes.push({ ...last });
  }
  return boxes;
}

function splitKitsToUPSBoxes(kits) {
  const boxes = [];
  let remain = Number(kits) || 0;
  while (remain > 0) {
    const thisBox = Math.min(KIT_PER_UPS_BOX, remain);
    boxes.push({
      dims: { ...KIT_BOX_DIMS },
      weightLb: Math.max(thisBox * KIT_WEIGHT_LB, 1), // never 0
      kits: thisBox,
    });
    remain -= thisBox;
  }
  return boxes;
}

function splitKitsToUSPSMediumFlatRateBoxes(kits) {
  // Returns counts of MFR boxes (no dims/weights needed by USPS for flat rate)
  const boxes = [];
  let remain = Number(kits) || 0;
  while (remain > 0) {
    const thisBox = Math.min(KIT_PER_USPS_MFR, remain);
    boxes.push({ countKits: thisBox });
    remain -= thisBox;
  }
  return boxes;
}

/* =============================
   USPS RateV4 – Medium Flat Rate for Kits
   We only call USPS WebTools when the cart is *kits only* and we want Medium FR.
   - endpoint: https://secure.shippingapis.com/ShippingAPI.dll?API=RateV4&XML=...
   - requires: USPS_WEBTOOLS_USER_ID
============================= */
async function uspsMediumFlatRateQuote({ userId, fromZIP, toZIP, boxesCount }) {
  // Build one RateV4Request with multiple <Package> entries (one per MFR box)
  // Service PRIORITY, Container "MediumFlatRateBox"
  const buildPkgXML = (id) => `
    <Package ID="${id}">
      <Service>PRIORITY</Service>
      <ZipOrigination>${fromZIP}</ZipOrigination>
      <ZipDestination>${toZIP}</ZipDestination>
      <Pounds>0</Pounds>
      <Ounces>0</Ounces>
      <Container>MediumFlatRateBox</Container>
      <Size>REGULAR</Size>
      <Machinable>true</Machinable>
    </Package>`.trim();

  const packagesXML = Array.from({ length: boxesCount }).map((_,i)=>buildPkgXML(i+1)).join('');
  const xml = `<RateV4Request USERID="${userId}">${packagesXML}</RateV4Request>`.replace(/\s{2,}/g,' ');

  const url = `https://secure.shippingapis.com/ShippingAPI.dll?API=RateV4&XML=${encodeURIComponent(xml)}`;
  const resp = await fetch(url);
  const text = await resp.text();

  if (!resp.ok) {
    return { ok:false, reason:`USPS HTTP ${resp.status}`, raw:text };
  }

  // Super lightweight parse: sum all <Rate>...</Rate>
  // If API error, USPS returns <Error>…</Error>
  if (/<Error>/i.test(text)) {
    // Try to extract description
    const msg = (text.match(/<Description>([^<]+)<\/Description>/i) || [,'Unknown USPS error'])[1];
    return { ok:false, reason:`USPS: ${msg}`, raw:text };
  }

  // Find all <Rate>xx.yy</Rate>
  const rates = [...text.matchAll(/<Rate>([^<]+)<\/Rate>/g)].map(m => Number(m[1]));
  if (!rates.length) {
    return { ok:false, reason:'USPS: no Medium Flat Rate returned', raw:text };
  }

  // USPS returns one Rate per package line; sum them
  const total = rates.reduce((a,b)=>a+b, 0);
  return { ok:true, amount: Number(total.toFixed(2)), raw:text };
}

/* =============================
   Quote Orchestration
============================= */
function summarizeRates(rates) {
  return (rates || [])
    .filter(r => r && (typeof r.amount === 'number') && !Number.isNaN(r.amount))
    .map(r => ({ ...r, amount: Number(r.amount) }))
    .sort((a,b) => a.amount - b.amount);
}

function isKitsOnly(items) {
  return Array.isArray(items) && items.length > 0 && items.every(it => it?.type === 'kit');
}

function getBulkUnits(items) {
  return (items || []).filter(it => it?.type === 'bulk').reduce((sum,it)=> sum + (Number(it.units)||0), 0);
}

function getKitQty(items) {
  return (items || []).filter(it => it?.type === 'kit').reduce((sum,it)=> sum + (Number(it.qty)||0), 0);
}

/* =============================
   Handler
============================= */
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok:false, error:'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { body = req.body || {}; }

  const { destination, items, debug } = body || {};
  if (!destination || !destination.country || !destination.postal) {
    return json(res, 400, { ok:false, error:'Missing destination (country, postal)' });
  }
  if (!Array.isArray(items) || !items.length) {
    return json(res, 400, { ok:false, error:'Cart is empty' });
  }

  const shipFrom = getShipFrom();

  // Carrier readiness
  const upsStatus  = getUPSStatus();
  const uspsStatus = getUSPSStatus();
  const tqlStatus  = getTQLStatus();

  const carrierStatus = [
    { carrier:'UPS',  ok: upsStatus.ok,  reason: upsStatus.reason },
    { carrier:'USPS', ok: uspsStatus.ok, reason: uspsStatus.reason },
    { carrier:'TQL',  ok: tqlStatus.ok,  reason: tqlStatus.reason },
  ];

  const rates = [];

  /* ---------- USPS Medium Flat Rate for kits-only carts ---------- */
  if (isKitsOnly(items) && uspsStatus.ok && destination.country === 'US') {
    try {
      const kits = getKitQty(items);
      const mfrBoxes = splitKitsToUSPSMediumFlatRateBoxes(kits);
      const result = await uspsMediumFlatRateQuote({
        userId: uspsStatus.userId,
        fromZIP: shipFrom.postal,
        toZIP: destination.postal,
        boxesCount: mfrBoxes.length
      });
      if (result.ok) {
        rates.push({
          carrier: 'USPS',
          service: 'Priority Mail Medium Flat Rate (Kits)',
          amount: result.amount,
          currency: 'USD',
          meta: { boxes: mfrBoxes.length, kits, note: 'Real USPS RateV4 Medium Flat Rate' }
        });
      } else {
        carrierStatus.push({ carrier:'USPS', ok:false, reason: result.reason || 'USPS MFR error' });
      }
    } catch (e) {
      carrierStatus.push({ carrier:'USPS', ok:false, reason: 'USPS MFR exception: ' + String(e) });
    }
  }

  /* ---------- TQL (LTL) placeholder so flow is testable ---------- */
  if (tqlStatus.ok) {
    // Very rough placeholder. Replace with real TQL LTL rating when you’re ready.
    // For a nicer placeholder, scale with weight/boxes:
    const bulkUnits = getBulkUnits(items);
    const bulkBoxes = splitBulkUnitsToBoxes(bulkUnits);
    const kits = getKitQty(items);
    const kitUpsBoxes = splitKitsToUPSBoxes(kits);
    const totalBoxes = bulkBoxes.length + kitUpsBoxes.length;

    const base = 80; // base placeholder
    const perBox = 12; // add a little per box
    const amount = Math.max(60, base + perBox * totalBoxes);

    rates.push({
      carrier: 'TQL',
      service: 'LTL Freight (placeholder)',
      amount: Number(amount.toFixed(2)),
      currency: 'USD',
      meta: { totalBoxes, note: 'Placeholder until live TQL rating is integrated' }
    });
  }

  /* ---------- UPS & USPS weight-based rating (stubbed/unavailable here) ----------
     We’ve included *full packaging outputs* so it’s easy to wire the real APIs:
     - UPS: use OAuth, then Rating API with a Shipment (multiple Package objects).
     - USPS: RateV4 (domestic) / IntlRateV2 (international) for non-flat-rate parcels.

     For now we report them as “unavailable” unless you want me to wire those today.
  ------------------------------------------------------------------------------- */
  const bulkUnits = getBulkUnits(items);
  const bulkBoxes = splitBulkUnitsToBoxes(bulkUnits);
  const kits = getKitQty(items);
  const kitUPSBoxes = splitKitsToUPSBoxes(kits);

  // You’ll pass bulkBoxes + kitUPSBoxes into your real carrier calls.
  // Example object shape for a single UPS package:
  // { dims:{l,w,h}, weightLb, reference:'Bulk 20k' }

  // If you *really* want to show "UPS (estimate)" you can compute a simple DIM-weight
  // estimate here. I’m leaving it out to avoid under/over-charging.

  // Build response
  const payload = {
    ok: true,
    rates: summarizeRates(rates),
    carrierStatus,
    packaging: debug ? {
      bulkUnits,
      bulkBoxes,
      kits,
      kitUPSBoxes,
      uspsKitMFRBoxes: isKitsOnly(items) ? splitKitsToUSPSMediumFlatRateBoxes(kits) : []
    } : undefined
  };

  return json(res, 200, payload);
}
