// USPS carrier integration
export const config = { runtime: 'nodejs' };

const USPS_CLIENT_ID = process.env.USPS_CLIENT_ID;
const USPS_CLIENT_SECRET = process.env.USPS_CLIENT_SECRET;
const USPS_MAX_WEIGHT_LB = 70;

// Validate origin configuration
const SHIP_FROM_ZIP = process.env.SHIP_FROM_ZIP;

if (!SHIP_FROM_ZIP) {
  throw new Error('SHIP_FROM_ZIP environment variable is required for USPS');
}

const ORIGIN = {
  zip: SHIP_FROM_ZIP,
};

const USPS_SERVICES = [
  { mailClass: 'USPS_GROUND_ADVANTAGE', name: 'USPS Ground Advantage', estDays: 5 },
  { mailClass: 'PRIORITY_MAIL', name: 'Priority Mail', estDays: 2 },
  { mailClass: 'PRIORITY_MAIL_EXPRESS', name: 'Priority Mail Express', estDays: 1 },
];

// USPS Flat Rate Box pricing (commercial rates)
// These are fixed national rates regardless of weight or destination
const USPS_FLAT_RATE_PRICES = {
  MEDIUM_FLAT_RATE_BOX: {
    price: 18.50, // Commercial rate for Medium Flat Rate Box
    service: 'Priority Mail Medium Flat Rate Box',
    mailClass: 'PRIORITY_MAIL_FLAT_RATE',
    estDays: 3,
    maxWeight: 70 // lbs
  }
};

let _uspsToken = null;
let _uspsTokenExp = 0;

function getUspsServiceName(mailClass) {
  const service = USPS_SERVICES.find(s => s.mailClass === mailClass);
  if (!service) {
    throw new Error(`Unknown USPS service: ${mailClass}`);
  }
  return service.name;
}

async function getUspsAccessToken() {
  if (!USPS_CLIENT_ID || !USPS_CLIENT_SECRET) {
    throw new Error('USPS_CLIENT_ID and USPS_CLIENT_SECRET environment variables are required');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (_uspsToken && nowSec < _uspsTokenExp - 60) {
    return _uspsToken;
  }

  const body = {
    client_id: USPS_CLIENT_ID,
    client_secret: USPS_CLIENT_SECRET,
    grant_type: 'client_credentials'
  };

  const response = await fetch('https://apis.usps.com/oauth2/v3/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`USPS OAuth failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('USPS OAuth response missing access_token');
  }
  if (!data.expires_in) {
    throw new Error('USPS OAuth response missing expires_in');
  }

  _uspsToken = data.access_token;
  _uspsTokenExp = nowSec + data.expires_in;

  console.log('[USPS] OAuth token obtained successfully');
  return _uspsToken;
}

async function getRateForPackage(parcel, to, token, mailClass) {
  if (!parcel.weightLb || typeof parcel.weightLb !== 'number') {
    throw new Error('Parcel weight must be a number');
  }
  if (!parcel.length || !parcel.width || !parcel.height) {
    throw new Error('Parcel dimensions (length, width, height) are required');
  }
  if (!to.postal && !to.zip) {
    throw new Error('Destination ZIP code is required');
  }

  const weightOz = Math.ceil(parcel.weightLb * 16);

  const body = {
    originZIPCode: ORIGIN.zip,
    destinationZIPCode: to.postal ?? to.zip,
    destinationEntryFacilityType: 'NONE',
    weight: weightOz,
    length: parcel.length,
    width: parcel.width,
    height: parcel.height,
    mailClass,
    processingCategory: 'NON_MACHINABLE',
    rateIndicator: 'SP',
    priceType: 'COMMERCIAL',
    mailingDate: new Date().toISOString().split('T')[0],
  };

  const response = await fetch('https://apis.usps.com/prices/v3/base-rates/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`USPS rate request failed for ${mailClass} (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  const rate = data.totalBasePrice ?? data.price;

  if (!rate) {
    throw new Error(`USPS API response missing price for ${mailClass}`);
  }

  const rateNumber = Number(rate);
  if (isNaN(rateNumber)) {
    throw new Error(`Invalid price from USPS for ${mailClass}: ${rate}`);
  }

  return {
    mailClass,
    price: rateNumber,
    serviceStandard: data.serviceStandard ?? null,
  };
}

export async function getUspsRates({ to, parcels }) {
  if (!to) {
    throw new Error('Destination address is required');
  }
  if (to.country !== 'US') {
    throw new Error('USPS only ships to US domestic addresses');
  }
  if (!to.postal && !to.zip) {
    throw new Error('Destination ZIP code is required');
  }

  if (!Array.isArray(parcels) || parcels.length === 0) {
    throw new Error('No parcels provided for USPS rating');
  }

  // Check if all parcels are kit cartons - use flat rate box pricing
  const allKitCartons = parcels.every(p => p.packaging === 'kit-carton');

  if (allKitCartons) {
    // Calculate number of Medium Flat Rate Boxes needed
    const totalBoxes = parcels.length;
    const flatRateInfo = USPS_FLAT_RATE_PRICES.MEDIUM_FLAT_RATE_BOX;
    const totalPrice = flatRateInfo.price * totalBoxes;

    console.log(`[USPS] Using Medium Flat Rate Box pricing for ${totalBoxes} kit carton(s)`);

    return [{
      carrier: 'USPS',
      service: flatRateInfo.service,
      serviceCode: flatRateInfo.mailClass,
      priceCents: Math.round(totalPrice * 100),
      estDays: flatRateInfo.estDays,
      detail: {
        parcels: totalBoxes,
        totalRate: totalPrice,
        flatRate: true,
        pricePerBox: flatRateInfo.price
      },
    }];
  }

  const validatedPackages = [];
  for (const parcel of parcels) {
    if (parcel.weightLb > USPS_MAX_WEIGHT_LB) {
      console.warn(`[USPS] Parcel weight ${parcel.weightLb}lb exceeds USPS max weight (${USPS_MAX_WEIGHT_LB}lb), skipping`);
      continue;
    }
    validatedPackages.push(parcel);
  }

  if (validatedPackages.length === 0) {
    throw new Error(`All parcels exceed USPS maximum weight limit of ${USPS_MAX_WEIGHT_LB}lb`);
  }

  console.log('[USPS] Getting rates for', validatedPackages.length, 'parcel(s)');

  const token = await getUspsAccessToken();

  const allPackageRates = await Promise.all(
    validatedPackages.map(pkg =>
      Promise.all(
        USPS_SERVICES.map(service =>
          getRateForPackage(pkg, to, token, service.mailClass)
            .catch(err => {
              console.warn(`[USPS] Failed to get ${service.mailClass} rate:`, err.message);
              return null;
            })
        )
      )
    )
  );

  const aggregatedRates = {};

  for (const packageRates of allPackageRates) {
    for (const rate of packageRates) {
      if (!rate) continue;

      const serviceCode = rate.mailClass;
      if (!aggregatedRates[serviceCode]) {
        aggregatedRates[serviceCode] = {
          total: 0,
          service: getUspsServiceName(serviceCode),
          delivery_days: rate.serviceStandard ? parseInt(rate.serviceStandard) : null,
        };
      }
      aggregatedRates[serviceCode].total += rate.price;
    }
  }

  const finalRates = Object.keys(aggregatedRates).map(serviceCode => {
    const rateInfo = aggregatedRates[serviceCode];
    const rate = rateInfo.total;

    return {
      carrier: 'USPS',
      service: rateInfo.service,
      serviceCode,
      priceCents: Math.round(rate * 100),
      estDays: rateInfo.delivery_days,
      detail: {
        parcels: validatedPackages.length,
        totalRate: rate,
      },
    };
  });

  if (finalRates.length === 0) {
    throw new Error('USPS returned no rates for any service');
  }

  console.log(`[USPS] Returning ${finalRates.length} rate option(s)`);

  return finalRates;
}
