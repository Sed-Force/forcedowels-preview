// /api/shipping/quote.js
// Runtime: Node (NOT Edge) so we can call carrier APIs in later steps.
export const config = { runtime: 'nodejs' };

/**
 * Request shape (POST JSON):
 * {
 *   destination: { country: 'US'|'CA'|'MX', state: 'AZ', city: 'Gilbert', postal: '85296' },
 *   items: [
 *     { type: 'bulk', units: number }, // 5k..960k in 5k steps
 *     { type: 'kit',  qty:   number }  // 1..N (300 pcs per kit)
 *   ]
 * }
 *
 * Response:
 * {
 *   ok: true,
 *   summary: {
 *     totalUnits, totalKits, totalWeightLbs,
 *     parcels: [{qty, weightLbs, dims:{l,w,h}, kind:'bulk-5k'|'bulk-10k'|'bulk-15k'|'bulk-20k'|'kit-2per'}],
 *     pallets: [{qty, weightLbs, dims:{l,w,h}}],
 *     notes: string[]
 *   },
 *   rates: [
 *     { carrier:'UPS',   service:'Ground',  amount: 123.45, currency:'USD', eta:null, meta:{} },
 *     { carrier:'USPS',  service:'Priority', amount: 98.76, currency:'USD', eta:null, meta:{} },
 *     { carrier:'TQL',   service:'LTL',     amount: 210.00, currency:'USD', eta:null, meta:{} },
 *   ]
 * }
 */

// ---------- ENV (origin address + carrier creds) ----------
const ORIGIN = {
  name   : process.env.SHIP_FROM_NAME   || 'Force Dowels',
  street : process.env.SHIP_FROM_STREET || '',
  city   : process.env.SHIP_FROM_CITY   || '',
  state  : process.env.SHIP_FROM_STATE  || '',
  postal : process.env.SHIP_FROM_ZIP    || '',
  country: process.env.SHIP_FROM_COUNTRY|| 'US',
};

// UPS creds (we’ll wire these in step 5)
const UPS = {
  clientId     : process.env.UPS_CLIENT_ID || '',
  clientSecret : process.env.UPS_CLIENT_SECRET || '',
  accountNumber: process.env.UPS_ACCOUNT_NUMBER || '',
  env          : (process.env.UPS_ENV || 'test').toLowerCase(), // 'test' or 'prod'
};

// USPS creds (we’ll wire these in step 5)
const USPS = {
  clientId    : process.env.USPS_CLIENT_ID || '',
  clientSecret: process.env.USPS_CLIENT_SECRET || '',
};

// TQL creds (we’ll wire these in step 6)
const TQL = {
  username    : process.env.TQL_USERNAME || '',
  password    : process.env.TQL_PASSWORD || '',
  clientId    : process.env.TQL_CLIENT_ID || '',
  clientSecret: process.env.TQL_CLIENT_SECRET || '',
  baseUrl     : process.env.TQL_BASE_URL || '',
  testBaseUrl : process.env.TQL_TEST_BASE_URL || '',
  subKey      : process.env.NEXT_PUBLIC_TQL_SUBSCRIPTION_KEY || '',
};

// ---------- Product packing rules (from your sheet + notes) ----------
// Bulk unit -> weight ~0.0038 lb (5k ≈ 19 lb; 20k ≈ 77 lb)
// Box sizes:
//   - up to 10k: 15"x15"x12"
//   - 15k or 20k: 22"x22"x12"
// Pallet rule (LTL): 80k units per pallet (4 x 20k boxes).
// Pallet dims (approx): 48" x 40" x 36". First pallet 458 lb, each additional +308 lb.
const WEIGHT_PER_UNIT = 0.0038; // lbs (rounded)
const BOX_5K  = { units:  5000, weight:  19, dims: { l:15, w:15, h:12 }, code: 'bulk-5k'  };
const BOX_10K = { units: 10000, weight:  38, dims: { l:15, w:15, h:12 }, code: 'bulk-10k' };
const BOX_15K = { units: 15000, weight:  58, dims: { l:22, w:22, h:12 }, code: 'bulk-15k' };
const BOX_20K = { units: 20000, weight:  77, dims: { l:22, w:22, h:12 }, code: 'bulk-20k' };

const PALLET = {
  unitsPerPallet: 80000, // 4 x 20k boxes
  firstWeight: 458,       // lbs
  addPerPallet: 308,      // lbs (766-458, then +308 consistently on your table)
  dims: { l:48, w:40, h:36 },
};

// Starter kits: 2 kits per parcel, 9"x11"x2", 1.7 lb per kit
const KIT = { perBox: 2, weightPer: 1.7, dims: { l:9, w:11, h:2 }, code: 'kit-2per' };

// ---------- Helpers ----------
function badRequest(res, message) {
  res.status(400).json({ ok:false, error: message });
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// Greedy packer: prefer 20k, then 15k, then 10k, then 5k
function packBulkIntoParcels(units) {
  const parcels = [];
  let remain = Math.max(0, Math.floor(units / 5000) * 5000); // snap to 5k

  const useBox = (BOX) => {
    const count = Math.floor(remain / BOX.units);
    if (count > 0) {
      parcels.push({ qty: count, weightLbs: BOX.weight, dims: BOX.dims, kind: BOX.code });
      remain -= count * BOX.units;
    }
  };

  useBox(BOX_20K);
  useBox(BOX_15K);
  useBox(BOX_10K);
  useBox(BOX_5K);

  return { parcels, remainderUnits: remain };
}

function palletsForUnits(units) {
  const pallets = Math.ceil(units / PALLET.unitsPerPallet);
  if (pallets <= 0) return { pallets: [], totalWeight: 0 };

  const arr = [];
  let totalWeight = 0;
  for (let i=0; i<pallets; i++) {
    const w = i === 0 ? PALLET.firstWeight : PALLET.firstWeight + PALLET.addPerPallet * i;
    arr.push({ qty: 1, weightLbs: w, dims: PALLET.dims });
    totalWeight += w;
  }
  return { pallets: arr, totalWeight };
}

function packKits(qty) {
  const boxes = Math.ceil(Math.max(0, qty) / KIT.perBox);
  if (boxes <= 0) return [];
  return [{ qty: boxes, weightLbs: round2(KIT.weightPer * KIT.perBox), dims: KIT.dims, kind: KIT.code }];
}

// Build a complete packing plan from cart items
function buildPackingPlan(items) {
  let bulkUnits = 0;
  let totalKits = 0;

  for (const it of (items || [])) {
    if (it?.type === 'bulk') bulkUnits += Number(it.units || 0);
    if (it?.type === 'kit')  totalKits += Number(it.qty || 0);
  }

  const notes = [];
  const summary = {
    totalUnits: bulkUnits,
    totalKits,
    parcels: [],
    pallets: [],
    totalWeightLbs: 0,
    notes,
  };

  // Decide parcel vs pallet: if >= 80k units, we start using pallets.
  if (bulkUnits >= PALLET.unitsPerPallet) {
    const { pallets, totalWeight } = palletsForUnits(bulkUnits);
    summary.pallets = pallets;
    summary.totalWeightLbs += totalWeight;
    notes.push('Bulk packed on pallets (80k units per pallet).');
  } else if (bulkUnits > 0) {
    const packed = packBulkIntoParcels(bulkUnits);
    packed.parcels.forEach(p => {
      // each "p" entry represents one kind of box; duplicate into rows
      summary.parcels.push({ qty: p.qty, weightLbs: p.weightLbs, dims: p.dims, kind: p.kind });
      summary.totalWeightLbs += p.qty * p.weightLbs;
    });
    if (packed.remainderUnits > 0) {
      notes.push(`Unpacked remainder (snapped to 5k): ${packed.remainderUnits} units.`);
    } else {
      notes.push('Bulk packed in parcel boxes (5k/10k/15k/20k).');
    }
  }

  // Kits
  if (totalKits > 0) {
    const kitBoxes = packKits(totalKits); // 2 kits per parcel
    kitBoxes.forEach(k => {
      summary.parcels.push({ qty: k.qty, weightLbs: k.weightLbs, dims: k.dims, kind: k.kind });
      summary.totalWeightLbs += k.qty * k.weightLbs;
    });
    notes.push('Starter kits: 2 kits per parcel (9x11x2).');
  }

  summary.totalWeightLbs = round2(summary.totalWeightLbs);
  return summary;
}

// ---------- Carrier rate stubs (step 5 will wire real calls) ----------
async function quoteUPS(/* origin, destination, parcels, pallets */) {
  // TODO (Step 5): Implement real UPS OAuth + Rate API calls here.
  // If you want a visible placeholder in the UI until creds are wired, return null to hide it.
  return null;
}

async function quoteUSPS(/* origin, destination, parcels */) {
  // TODO (Step 5): Implement USPS Web Tools or eVS rate calls.
  return null;
}

async function quoteTQL(/* origin, destination, pallets */) {
  // TODO (Step 6): Implement TQL LTL quotes.
  return null;
}

// ---------- A safe, conservative estimate (optional) ----------
// Shown only if all carriers return null (so UI has *something* to show).
function fallbackEstimate(destination, summary) {
  const { totalWeightLbs, parcels, pallets } = summary;
  const hasPallets = (pallets || []).length > 0;

  // Very rough per-lb heuristic; we’ll replace with real quotes later.
  const country = (destination?.country || 'US').toUpperCase();
  let perLb = 0.9, base = 12;   // US parcel-ish
  if (country === 'CA') { perLb = 1.6; base = 25; }
  if (country === 'MX') { perLb = 1.8; base = 28; }

  let amount = 0;
  if (hasPallets) {
    // Pallet heuristic
    // first pallet “base” + per-lb (lower rate)
    amount = 180 + Math.max(0, totalWeightLbs) * (country === 'US' ? 0.35 : 0.55);
  } else {
    amount = base + totalWeightLbs * perLb;
  }
  return {
    carrier: 'Estimate',
    service: hasPallets ? 'LTL (est.)' : 'Parcel (est.)',
    amount: round2(Math.max(0, amount)),
    currency: 'USD',
    eta: null,
    meta: { note: 'Temporary estimate until real carrier rates are enabled.' }
  };
}

// ---------- Handler ----------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return badRequest(res, 'Use POST with { destination, items }');
  }

  try {
    const { destination, items } = req.body || {};
    if (!destination || !items) {
      return badRequest(res, 'Missing destination or items');
    }

    // Build packing plan
    const summary = buildPackingPlan(items);

    // Ask carriers (stubs return null until wired)
    const carriers = [];
    const ups = await quoteUPS(ORIGIN, destination, summary.parcels, summary.pallets);
    if (ups) carriers.push(ups);

    const usps = await quoteUSPS(ORIGIN, destination, summary.parcels);
    if (usps) carriers.push(usps);

    const tql = await quoteTQL(ORIGIN, destination, summary.pallets);
    if (tql) carriers.push(tql);

    // If nothing real yet, add a fallback single “estimate” so the UI shows something
    if (carriers.length === 0) {
      carriers.push(fallbackEstimate(destination, summary));
    }

    // Sort by price asc (if any null amounts sneak in, push them to the end)
    carriers.sort((a, b) => {
      const ax = typeof a.amount === 'number' ? a.amount : Number.POSITIVE_INFINITY;
      const bx = typeof b.amount === 'number' ? b.amount : Number.POSITIVE_INFINITY;
      return ax - bx;
    });

    return res.status(200).json({ ok: true, summary, rates: carriers });
  } catch (err) {
    console.error('quote error', err);
    return res.status(500).json({ ok:false, error: 'Failed to build shipping quote.' });
  }
}
