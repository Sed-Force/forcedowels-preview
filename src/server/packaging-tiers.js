// Tiered packaging system for Force Dowels
// Based on quantity, determines optimal packaging configuration

/**
 * Packaging tiers for Force Dowels shipping
 * Each tier defines the maximum quantity it can handle, package count, type, weight, and dimensions
 */
export const TIER_DATA = [
  // Small boxes (5k - 10k units)
  {
    tierName: "Small Box (5k)",
    maxQty: 5000,
    pkgCount: 1,
    pkgType: "BOX",
    weightLbs: 19,
    dimsIn: [15, 15, 12]
  },
  {
    tierName: "Small Box (10k)",
    maxQty: 10000,
    pkgCount: 2,
    pkgType: "BOX",
    weightLbs: 19,
    dimsIn: [15, 15, 12]
  },
  // Large boxes (15k - 20k units)
  {
    tierName: "Large Box (15k)",
    maxQty: 15000,
    pkgCount: 1,
    pkgType: "BOX",
    weightLbs: 57,
    dimsIn: [22, 22, 12]
  },
  {
    tierName: "Large Box (20k)",
    maxQty: 20000,
    pkgCount: 1,
    pkgType: "BOX",
    weightLbs: 77,
    dimsIn: [22, 22, 12]
  },
  // Multiple boxes for mid-range orders (20k-80k)
  {
    tierName: "2 Large Boxes (40k)",
    maxQty: 40000,
    pkgCount: 2,
    pkgType: "BOX",
    weightLbs: 77,
    dimsIn: [22, 22, 12]
  },
  {
    tierName: "3 Large Boxes (60k)",
    maxQty: 60000,
    pkgCount: 3,
    pkgType: "BOX",
    weightLbs: 77,
    dimsIn: [22, 22, 12]
  },
  {
    tierName: "4 Large Boxes (79,999)",
    maxQty: 79999,
    pkgCount: 4,
    pkgType: "BOX",
    weightLbs: 77,
    dimsIn: [22, 22, 12]
  },
  // Pallets (80k+ units - for freight)
  {
    tierName: "Pallet (4 boxes - 80k+)",
    maxQty: 80000,
    pkgCount: 1,
    pkgType: "PALLET",
    weightLbs: 358, // 4 boxes * 77 lbs + 50 lb pallet
    dimsIn: [48, 40, 50]
  },
  {
    tierName: "Pallet (8 boxes - 160k)",
    maxQty: 160000,
    pkgCount: 1,
    pkgType: "PALLET",
    weightLbs: 666, // 8 boxes * 77 lbs + 50 lb pallet
    dimsIn: [48, 40, 50]
  },
  {
    tierName: "Pallet (12 boxes - 240k)",
    maxQty: 240000,
    pkgCount: 1,
    pkgType: "PALLET",
    weightLbs: 974, // 12 boxes * 77 lbs + 50 lb pallet
    dimsIn: [48, 40, 50]
  },
  {
    tierName: "Pallet (16 boxes - 320k)",
    maxQty: 320000,
    pkgCount: 1,
    pkgType: "PALLET",
    weightLbs: 1282, // 16 boxes * 77 lbs + 50 lb pallet
    dimsIn: [48, 40, 50]
  },
  {
    tierName: "Pallet (20 boxes - 400k)",
    maxQty: 400000,
    pkgCount: 1,
    pkgType: "PALLET",
    weightLbs: 1590, // 20 boxes * 77 lbs + 50 lb pallet
    dimsIn: [48, 40, 50]
  },
  {
    tierName: "Pallet (24 boxes - 480k)",
    maxQty: 480000,
    pkgCount: 1,
    pkgType: "PALLET",
    weightLbs: 1898, // 24 boxes * 77 lbs + 50 lb pallet
    dimsIn: [48, 40, 50]
  },
  {
    tierName: "Two Pallets (48 boxes - 960k)",
    maxQty: 960000,
    pkgCount: 2,
    pkgType: "PALLET",
    weightLbs: 1898, // Each pallet: 24 boxes * 77 lbs + 50 lb pallet
    dimsIn: [48, 40, 50]
  }
];

/**
 * Kit packaging configuration for USPS (Medium Flat Rate Box)
 * Up to 10 kits per box
 */
export const KIT_CONFIG = {
  unitsPerKit: 300,
  weightPerKit: 1.7,
  kitsPerCarton: 10, // Up to 10 kits per USPS Medium Flat Rate Box (17 lbs total)
  cartonDims: [11, 8.5, 5.5] // USPS Medium Flat Rate Box dimensions (length, width, height in inches)
};

/**
 * Kit packaging configuration for UPS
 * Up to 2 kits per box with different dimensions
 */
export const KIT_CONFIG_UPS = {
  unitsPerKit: 300,
  weightPerKit: 1.7,
  kitsPerCarton: 2, // 2 kits per UPS box (3.4 lbs total)
  cartonDims: [11, 9, 2] // UPS box dimensions (length, width, height in inches)
};

/**
 * Find the appropriate tier for a given bulk quantity
 * @param {number} quantity - Bulk units quantity
 * @returns {object} Tier configuration
 */
export function getTierForQuantity(quantity) {
  // Find the first tier that can handle this quantity
  for (const tier of TIER_DATA) {
    if (quantity <= tier.maxQty) {
      return tier;
    }
  }
  // If quantity exceeds all tiers, return the largest tier
  return TIER_DATA[TIER_DATA.length - 1];
}

/**
 * Create packages for bulk units based on the tier system
 * @param {number} quantity - Bulk units quantity
 * @returns {Array} Array of package objects
 */
export function getPackagesForBulk(quantity) {
  if (quantity <= 0) return [];

  const tier = getTierForQuantity(quantity);
  const packages = [];

  if (tier.pkgType === 'BOX') {
    // For boxes, create individual packages
    for (let i = 0; i < tier.pkgCount; i++) {
      packages.push({
        type: 'parcel',
        packaging: 'bulk-box',
        weightLb: tier.weightLbs,
        length: tier.dimsIn[0],
        width: tier.dimsIn[1],
        height: tier.dimsIn[2],
        units: Math.floor(quantity / tier.pkgCount)
      });
    }
  } else if (tier.pkgType === 'PALLET') {
    // For pallets, create pallet packages
    for (let i = 0; i < tier.pkgCount; i++) {
      packages.push({
        type: 'pallet',
        packaging: 'pallet',
        weightLb: tier.weightLbs,
        length: tier.dimsIn[0],
        width: tier.dimsIn[1],
        height: tier.dimsIn[2],
        units: Math.floor(quantity / tier.pkgCount),
        boxCount: tier.maxQty / 20000 / tier.pkgCount // boxes per pallet
      });
    }
  }

  return packages;
}

/**
 * Create packages for kits (USPS - 10 kits per box)
 * @param {number} quantity - Number of kits
 * @returns {Array} Array of package objects
 */
export function getPackagesForKits(quantity) {
  if (quantity <= 0) return [];

  const packages = [];
  let remaining = Math.floor(quantity);

  while (remaining > 0) {
    const kitsInCarton = Math.min(KIT_CONFIG.kitsPerCarton, remaining);
    packages.push({
      type: 'parcel',
      packaging: 'kit-carton',
      weightLb: +(kitsInCarton * KIT_CONFIG.weightPerKit).toFixed(1),
      length: KIT_CONFIG.cartonDims[0],
      width: KIT_CONFIG.cartonDims[1],
      height: KIT_CONFIG.cartonDims[2],
      kits: kitsInCarton
    });
    remaining -= kitsInCarton;
  }

  return packages;
}

/**
 * Create packages for kits for UPS (2 kits per box, 11x9x2 dimensions)
 * @param {number} quantity - Number of kits
 * @returns {Array} Array of package objects
 */
export function getPackagesForKitsUPS(quantity) {
  if (quantity <= 0) return [];

  const packages = [];
  let remaining = Math.floor(quantity);

  while (remaining > 0) {
    const kitsInCarton = Math.min(KIT_CONFIG_UPS.kitsPerCarton, remaining);
    packages.push({
      type: 'parcel',
      packaging: 'kit-carton-ups',
      weightLb: +(kitsInCarton * KIT_CONFIG_UPS.weightPerKit).toFixed(1),
      length: KIT_CONFIG_UPS.cartonDims[0],
      width: KIT_CONFIG_UPS.cartonDims[1],
      height: KIT_CONFIG_UPS.cartonDims[2],
      kits: kitsInCarton
    });
    remaining -= kitsInCarton;
  }

  return packages;
}

/**
 * Determine which shipping provider should be used based on quantity
 * @param {number} totalQuantity - Total units/kits in order
 * @returns {string} 'UPS' | 'USPS' | 'TQL'
 */
export function getProviderForQuantity(totalQuantity) {
  // TQL for large freight shipments (80k+ units = pallets)
  if (totalQuantity >= 80000) {
    return 'TQL';
  }
  // UPS for medium to large parcels
  if (totalQuantity >= 5000) {
    return 'UPS';
  }
  // USPS for small parcels and kits
  return 'USPS';
}
