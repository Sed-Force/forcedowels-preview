// /api/shipping/pack.js
// Converts cart items to ship-ready packages (parcels + pallets)
// Cart items shape (from localStorage 'fd_cart'):
//   { type: 'bulk', units: Number }    // 5,000 step, 5k..960k
//   { type: 'kit',  qty: Number }      // 300 units per kit

export const config = { runtime: 'nodejs' };

const BULK_STEP  = 5000;
const BULK_MIN   = 5000;
const BULK_MAX   = 960000;

// ---- Packing rules (edit here easily) ----

// Per 5,000 bulk: ~19 lb (rounded up) – you asked to round to 19.
const LBS_PER_5K = 19;

// Small bulk box (5k–10k): 15" x 15" x 10"
const SMALL_BOX  = { length: 15, width: 15, height: 10 };

// Large bulk box (15k–20k): 22" x 22" x 12"
const LARGE_BOX  = { length: 22, width: 22, height: 12 };

// 20k full box reference weight (when shipping as one large box)
const LBS_PER_20K_BOX = 77;

// Pallet trigger and approx pallet dims (tune if needed)
const PALLET_TRIGGER_UNITS = 80000; // from your table, 80k+ becomes pallet territory
const PALLET_DIMS = { length: 48, width: 40, height: 50 }; // typical
const PALLET_TARE = 50; // add 50 lb per pallet (pallet + wrap)

// Starter kit: 300 units, 1.7 lb each. UPS parcel fits 2 kits per carton 9x11x2
const KIT_UNITS      = 300;
const KIT_LBS        = 1.7;
const KIT_PER_CARTON = 2;
const KIT_CARTON     = { length: 11, width: 9, height: 2 };

// USPS flat-rate: up to 5 kits per Medium FR box – kept only as an eligibility flag
const KIT_PER_USPS_MED = 5;

// ---------- Helpers ----------
function snapUnits(u) {
  const s = Math.round(u / BULK_STEP) * BULK_STEP;
  return Math.min(BULK_MAX, Math.max(BULK_MIN, s));
}

function packBulkToParcels(totalUnits) {
  // Strategy: fill as many 20k "large" boxes as possible, then the remainder
  // remainder 15k=>large, 10k/5k => small.
  let remaining = snapUnits(totalUnits);
  const parcels = [];

  const pushParcel = (unitsInBox) => {
    let dims;
    let weight;
    if (unitsInBox >= 15000) {
      dims = { ...LARGE_BOX };
      // for 20k you gave 77 lb; use linear 19 lb per 5k for other fill levels.
      weight = unitsInBox === 20000 ? LBS_PER_20K_BOX : Math.ceil((unitsInBox / 5000) * LBS_PER_5K);
    } else {
      dims = { ...SMALL_BOX };
      weight = Math.ceil((unitsInBox / 5000) * LBS_PER_5K);
    }
    parcels.push({
      type: 'parcel',
      packaging: 'bulk-box',
      units: unitsInBox,
      weightLb: weight,
      ...dims,
    });
  };

  // 20k large boxes first
  while (remaining >= 20000) {
    pushParcel(20000);
    remaining -= 20000;
  }
  if (remaining >= 15000) {
    pushParcel(15000);
    remaining -= 15000;
  }
  if (remaining >= 10000) {
    pushParcel(10000);
    remaining -= 10000;
  }
  if (remaining >= 5000) {
    pushParcel(5000);
    remaining -= 5000;
  }
  return parcels;
}

function packBulkToPallets(totalUnits) {
  // Convert to number of 20k boxes; stack up to 4 boxes per pallet (≈80k)
  let units = snapUnits(totalUnits);
  const pallets = [];
  let boxes20k = Math.floor(units / 20000);
  let rem = units % 20000;

  const makePallet = (boxesCount) => {
    // weight of boxes + pallet tare
    const boxesWeight = boxesCount * LBS_PER_20K_BOX;
    pallets.push({
      type: 'pallet',
      boxes20k: boxesCount,
      units: boxesCount * 20000,
      weightLb: boxesWeight + PALLET_TARE,
      ...PALLET_DIMS,
    });
  };

  while (boxes20k >= 4) {
    makePallet(4);
    boxes20k -= 4;
  }
  if (boxes20k > 0) makePallet(boxes20k);

  // remainder <20k: ship as parcel(s)
  const parcels = rem ? packBulkToParcels(rem) : [];

  return { pallets, parcels };
}

function packKitsToParcels(qty) {
  const parcels = [];
  let remaining = Math.max(0, Math.floor(qty));

  while (remaining > 0) {
    const inCarton = Math.min(KIT_PER_CARTON, remaining);
    parcels.push({
      type: 'parcel',
      packaging: 'kit-carton',
      kits: inCarton,
      weightLb: +(inCarton * KIT_LBS).toFixed(1),
      ...KIT_CARTON,
    });
    remaining -= inCarton;
  }

  // flag for USPS Medium FR eligibility (handled by carrier code if you enable USPS)
  const uspsBoxes = Math.ceil(qty / KIT_PER_USPS_MED);

  return { parcels, uspsMediumFlatEligible: qty > 0, uspsMediumBoxes: uspsBoxes };
}

export default function handler(req, res) {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items required' });
    }

    let bulkUnits = 0;
    let kitQty = 0;

    for (const it of items) {
      if (it?.type === 'bulk') bulkUnits += Number(it.units || 0);
      else if (it?.type === 'kit') kitQty += Number(it.qty || 0);
    }

    const result = { parcels: [], pallets: [], meta: { bulkUnits, kitQty } };

    if (bulkUnits > 0) {
      if (bulkUnits >= PALLET_TRIGGER_UNITS) {
        const { pallets, parcels } = packBulkToPallets(bulkUnits);
        result.pallets.push(...pallets);
        result.parcels.push(...parcels);
      } else {
        result.parcels.push(...packBulkToParcels(bulkUnits));
      }
    }

    if (kitQty > 0) {
      const k = packKitsToParcels(kitQty);
      result.parcels.push(...k.parcels);
      result.meta.uspsMediumFlatEligible = k.uspsMediumFlatEligible;
      result.meta.uspsMediumBoxes = k.uspsMediumBoxes;
    }

    return res.status(200).json(result);
  } catch (e) {
    console.error('pack error', e);
    return res.status(500).json({ error: 'pack failed' });
  }
}
