// UPS carrier integration
export const config = { runtime: 'nodejs' };

const UPS_CLIENT_ID = process.env.UPS_CLIENT_ID;
const UPS_CLIENT_SECRET = process.env.UPS_CLIENT_SECRET;
const UPS_ACCOUNT = process.env.UPS_ACCOUNT_NUMBER;
const UPS_ENV = process.env.UPS_ENV ?? 'test';
const UPS_BASE = UPS_ENV === 'production' ? 'https://onlinetools.ups.com' : 'https://wwwcie.ups.com';

// Validate origin configuration
const SHIP_FROM_NAME = process.env.SHIP_FROM_NAME;
const SHIP_FROM_STREET = process.env.SHIP_FROM_STREET;
const SHIP_FROM_CITY = process.env.SHIP_FROM_CITY;
const SHIP_FROM_STATE = process.env.SHIP_FROM_STATE;
const SHIP_FROM_ZIP = process.env.SHIP_FROM_ZIP;
const SHIP_FROM_COUNTRY = process.env.SHIP_FROM_COUNTRY ?? 'US';

if (!SHIP_FROM_NAME || !SHIP_FROM_STREET || !SHIP_FROM_CITY || !SHIP_FROM_STATE || !SHIP_FROM_ZIP) {
  throw new Error('Missing required SHIP_FROM environment variables');
}

const ORIGIN = {
  name: SHIP_FROM_NAME,
  street: SHIP_FROM_STREET,
  city: SHIP_FROM_CITY,
  state: SHIP_FROM_STATE,
  zip: SHIP_FROM_ZIP,
  country: SHIP_FROM_COUNTRY,
};

async function jsonFetch(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) } });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`HTTP ${r.status} ${url}: ${txt}`);
  }
  return r.json();
}

async function getUpsAccessToken() {
  if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET) {
    throw new Error('UPS_CLIENT_ID and UPS_CLIENT_SECRET are required');
  }
  if (!UPS_ACCOUNT) {
    throw new Error('UPS_ACCOUNT_NUMBER is required');
  }

  // UPS requires Basic Authorization header with base64(client_id:client_secret)
  const credentials = Buffer.from(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`).toString('base64');

  const r = await fetch(`${UPS_BASE}/security/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
      'x-merchant-id': UPS_ACCOUNT,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
    }),
  });

  if (!r.ok) {
    const errorText = await r.text();
    throw new Error(`UPS OAuth failed ${r.status}: ${errorText}`);
  }

  const data = await r.json();
  if (!data.access_token) {
    throw new Error('UPS OAuth response missing access_token');
  }

  return data;
}

function toUpsPackages(parcels) {
  if (!Array.isArray(parcels) || parcels.length === 0) {
    throw new Error('Parcels must be a non-empty array');
  }

  return parcels.map((p, index) => {
    if (!p.weightLb || typeof p.weightLb !== 'number') {
      throw new Error(`Parcel ${index + 1} must have numeric weightLb`);
    }
    if (!p.length || !p.width || !p.height) {
      throw new Error(`Parcel ${index + 1} must have length, width, and height`);
    }

    console.log(`[UPS] Package ${index + 1}: ${p.weightLb} lbs, ${p.length}×${p.width}×${p.height}" (${p.packaging || 'parcel'})`);

    return {
      packagingType: { code: '02' },
      packageWeight: { unitOfMeasurement: { code: 'LBS' }, weight: String(p.weightLb.toFixed(1)) },
      dimensions: {
        unitOfMeasurement: { code: 'IN' },
        length: String(p.length), width: String(p.width), height: String(p.height),
      },
    };
  });
}

export async function getUpsRates({ to, parcels, pallets }) {
  if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET || !UPS_ACCOUNT) {
    throw new Error('UPS credentials missing: UPS_CLIENT_ID, UPS_CLIENT_SECRET, and UPS_ACCOUNT_NUMBER are required');
  }

  if (!to) {
    throw new Error('Destination address is required');
  }
  if (!to.country) {
    throw new Error('Destination country is required');
  }
  if (!to.city) {
    throw new Error('Destination city is required');
  }
  if (!to.state) {
    throw new Error('Destination state is required');
  }
  if (!to.postal && !to.zip) {
    throw new Error('Destination postal/zip code is required');
  }
  if (!to.street) {
    throw new Error('Destination street is required');
  }

  if (!Array.isArray(parcels) || parcels.length === 0) {
    throw new Error('No packages to ship with UPS');
  }

  const { access_token } = await getUpsAccessToken();

  const packages = toUpsPackages(parcels);

  // Use Shop endpoint to get all available services in one request
  const shopRequest = {
    RateRequest: {
      Request: {
        RequestOption: 'Shop',
      },
      PickupType: {
        Code: '03', // Customer Counter
      },
      CustomerClassification: {
        Code: '04', // Retail Rates
      },
      Shipment: {
        Shipper: {
          Name: ORIGIN.name,
          ShipperNumber: UPS_ACCOUNT,
          Address: {
            AddressLine: [ORIGIN.street],
            City: ORIGIN.city,
            StateProvinceCode: ORIGIN.state,
            PostalCode: ORIGIN.zip,
            CountryCode: ORIGIN.country,
          },
        },
        ShipTo: {
          Name: to.name ?? 'Customer',
          Address: {
            AddressLine: [to.street],
            City: to.city,
            StateProvinceCode: to.state,
            PostalCode: to.postal ?? to.zip,
            CountryCode: to.country,
          },
        },
        ShipFrom: {
          Name: ORIGIN.name,
          Address: {
            AddressLine: [ORIGIN.street],
            City: ORIGIN.city,
            StateProvinceCode: ORIGIN.state,
            PostalCode: ORIGIN.zip,
            CountryCode: ORIGIN.country,
          },
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: '01',
            BillShipper: {
              AccountNumber: UPS_ACCOUNT,
            },
          },
        },
        Package: packages.map(pkg => ({
          PackagingType: {
            Code: pkg.packagingType.code,
          },
          Dimensions: {
            UnitOfMeasurement: {
              Code: pkg.dimensions.unitOfMeasurement.code,
            },
            Length: pkg.dimensions.length,
            Width: pkg.dimensions.width,
            Height: pkg.dimensions.height,
          },
          PackageWeight: {
            UnitOfMeasurement: {
              Code: pkg.packageWeight.unitOfMeasurement.code,
            },
            Weight: pkg.packageWeight.weight,
          },
        })),
      },
    },
  };

  console.log('[UPS] Requesting rates via Shop endpoint...');

  const headers = { Authorization: `Bearer ${access_token}` };

  try {
    const data = await jsonFetch(`${UPS_BASE}/api/rating/v1/Shop`, {
      method: 'POST',
      headers,
      body: JSON.stringify(shopRequest),
    });

    if (!data.RateResponse) {
      throw new Error('Invalid UPS response format');
    }

    const ratedShipments = data.RateResponse.RatedShipment;
    if (!Array.isArray(ratedShipments) || ratedShipments.length === 0) {
      throw new Error('UPS returned no rated shipments');
    }

    const results = ratedShipments.map(shipment => {
      const monetary = shipment.TotalCharges;
      if (!monetary || !monetary.MonetaryValue) {
        console.warn('[UPS] Shipment missing TotalCharges, skipping');
        return null;
      }

      const amount = Number(monetary.MonetaryValue);
      if (isNaN(amount)) {
        console.warn('[UPS] Invalid rate amount, skipping');
        return null;
      }

      const serviceCode = shipment.Service?.Code;
      const serviceName = getUpsServiceName(serviceCode);

      return {
        carrier: 'UPS',
        service: serviceName,
        serviceCode,
        priceCents: Math.round(amount * 100),
        estDays: null,
        detail: { upsResponse: shipment },
      };
    }).filter(rate => rate !== null);

    if (results.length === 0) {
      throw new Error('UPS returned no valid rates');
    }

    console.log(`[UPS] Returning ${results.length} rate(s)`);
    return results;

  } catch (error) {
    console.error('[UPS] Rate request failed:', error.message);
    throw new Error(`UPS rate request failed: ${error.message}`);
  }
}

// Map UPS service codes to friendly names
function getUpsServiceName(code) {
  const serviceNames = {
    '01': 'UPS Next Day Air',
    '02': 'UPS 2nd Day Air',
    '03': 'UPS Ground',
    '07': 'UPS Worldwide Express',
    '08': 'UPS Worldwide Expedited',
    '11': 'UPS Standard',
    '12': 'UPS 3 Day Select',
    '13': 'UPS Next Day Air Saver',
    '14': 'UPS Next Day Air Early',
    '54': 'UPS Worldwide Express Plus',
    '59': 'UPS 2nd Day Air A.M.',
    '65': 'UPS Saver',
  };
  return serviceNames[code] ?? `UPS Service ${code}`;
}
