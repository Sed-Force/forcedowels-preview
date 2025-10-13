// /api/shipping/rates.js
// Returns shipping quotes for a cart + destination.
// For now: UPS live (domestic + CA/MX) using OAuth client credentials.
// USPS/TQL stubs are in place to enable later.
// Response: { rates: [{carrier, service, serviceCode, priceCents, estDays, detail}], chosenCarrier? }

export const config = { runtime: 'nodejs' };

const UPS_CLIENT_ID     = process.env.UPS_CLIENT_ID;
const UPS_CLIENT_SECRET = process.env.UPS_CLIENT_SECRET;
const UPS_ACCOUNT       = process.env.UPS_ACCOUNT_NUMBER;
const UPS_ENV           = (process.env.UPS_ENV || 'test').toLowerCase(); // 'test' | 'production'
const UPS_BASE          = UPS_ENV === 'production' ? 'https://onlinetools.ups.com' : 'https://wwwcie.ups.com';

const USPS_CLIENT_ID    = process.env.USPS_CLIENT_ID;
const USPS_CLIENT_SECRET = process.env.USPS_CLIENT_SECRET;

// Optional: origin address pieces (already in your env)
const ORIGIN = {
  name: process.env.SHIP_FROM_NAME || 'Force Dowels',
  street: process.env.SHIP_FROM_STREET || '',
  city: process.env.SHIP_FROM_CITY || '',
  state: process.env.SHIP_FROM_STATE || '',
  zip: process.env.SHIP_FROM_ZIP || '',
  country: process.env.SHIP_FROM_COUNTRY || 'US',
};

// Helpers
async function jsonFetch(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status} ${url}: ${txt}`);
  }
  return r.json();
}

// ---- UPS ----
async function getUpsAccessToken() {
  const r = await fetch(`${UPS_BASE}/security/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-merchant-id': UPS_ACCOUNT || '',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: UPS_CLIENT_ID,
      client_secret: UPS_CLIENT_SECRET,
    }),
  });
  if (!r.ok) throw new Error(`UPS OAuth failed ${r.status}`);
  return r.json(); // { access_token, token_type, expires_in }
}

function toUpsPackages(parcels) {
  // UPS expects weight in LBS with 2 decimals, dims in INCHES (fractions allowed)
  return parcels.map(p => ({
    packagingType: { code: '02' }, // customer-supplied
    packageWeight: { unitOfMeasurement: { code: 'LBS' }, weight: String(p.weightLb.toFixed(1)) },
    dimensions: {
      unitOfMeasurement: { code: 'IN' },
      length: String(p.length), width: String(p.width), height: String(p.height),
    },
  }));
}

async function getUpsRates({ to, parcels, pallets }) {
  if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET || !UPS_ACCOUNT) return [];

  const { access_token } = await getUpsAccessToken();

  // Build shipments: we quote parcels only with UPS in Phase 1.
  const packages = toUpsPackages(parcels);

  if (!packages.length) return [];

  const isInternational = (to.country || 'US') !== 'US';
  // Service codes to request (Ground + 2nd Day + Next Day; use Worldwide Expedited/Saver for Intl)
  const services = isInternational
    ? [{ code: '11', name: 'UPS Standard' }, { code: '08', name: 'UPS Worldwide Expedited' }, { code: '65', name: 'UPS Saver' }]
    : [{ code: '03', name: 'UPS Ground' }, { code: '02', name: 'UPS 2nd Day Air' }, { code: '01', name: 'UPS Next Day Air' }];

  const shipment = {
    rateRequest: {
      customerClassification: { code: '01' },
      shipment: {
        shipper: {
          name: ORIGIN.name,
          shipperNumber: UPS_ACCOUNT,
          address: {
            addressLine: [ORIGIN.street],
            city: ORIGIN.city, stateProvinceCode: ORIGIN.state,
            postalCode: ORIGIN.zip, countryCode: ORIGIN.country,
          },
        },
        shipTo: {
          name: to.name || 'Recipient',
          address: {
            addressLine: [to.street || ''],
            city: to.city || '',
            stateProvinceCode: to.state || '',
            postalCode: to.postal || to.zip || '',
            countryCode: to.country || 'US',
          },
        },
        shipFrom: {
          name: ORIGIN.name,
          address: {
            addressLine: [ORIGIN.street],
            city: ORIGIN.city, stateProvinceCode: ORIGIN.state,
            postalCode: ORIGIN.zip, countryCode: ORIGIN.country,
          },
        },
        paymentInformation: { shipmentCharge: { type: '01', billShipper: { accountNumber: UPS_ACCOUNT } } },
        package: packages,
      },
    },
  };

  // Ask UPS for each service individually (simpler and reliable)
  const headers = { Authorization: `Bearer ${access_token}` };
  const results = [];

  for (const svc of services) {
    const body = JSON.parse(JSON.stringify(shipment));
    body.rateRequest.shipment.service = { code: svc.code };
    try {
      const data = await jsonFetch(`${UPS_BASE}/api/rating/v2205/Rate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      // Parse total charges
      const monetary = data?.RateResponse?.RatedShipment?.TotalCharges;
      const amount = monetary?.MonetaryValue ? Number(monetary.MonetaryValue) : null;
      if (amount != null) {
        results.push({
          carrier: 'UPS',
          service: svc.name,
          serviceCode: svc.code,
          priceCents: Math.round(amount * 100),
          estDays: undefined,
          detail: { upsResponse: data },
        });
      }
    } catch (e) {
      // Silently continue to next service
      console.error('UPS rate error', svc.code, e.message);
    }
  }

  return results;
}

// ---- USPS ----
let _uspsToken = null;
let _uspsTokenExp = 0;

async function getUspsAccessToken() {
  if (!USPS_CLIENT_ID || !USPS_CLIENT_SECRET) {
    console.log('[USPS] Missing credentials');
    return null;
  }

  // Use cached token if still valid (>60s left)
  const nowSec = Math.floor(Date.now() / 1000);
  if (_uspsToken && nowSec < _uspsTokenExp - 60) return _uspsToken;

  try {
    const response = await fetch('https://api.usps.com/oauth2/v3/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: USPS_CLIENT_ID,
        client_secret: USPS_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.log('[USPS] OAuth failed:', response.status, errorText);
      // Don't throw error - return null to trigger fallback
      return null;
    }

    const data = await response.json();
    _uspsToken = data.access_token;
    _uspsTokenExp = nowSec + (data.expires_in || 3600);
    console.log('[USPS] OAuth successful');
    return _uspsToken;
  } catch (error) {
    console.log('[USPS] OAuth error:', error.message);
    // Don't throw error - return null to trigger fallback
    return null;
  }
}

async function getUspsRates({ to, parcels }) {
  // Only process US domestic shipments
  if (to.country !== 'US') {
    console.log('[USPS] Skipping non-US destination');
    return [];
  }

  console.log('[USPS] Getting rates for', parcels.length, 'parcels');

  // Try API first, fall back to estimated rates if credentials fail
  if (USPS_CLIENT_ID && USPS_CLIENT_SECRET) {
    try {
      const token = await getUspsAccessToken();
      if (token) {
        const apiRates = await getUspsApiRates(token, parcels, to);
        if (apiRates && apiRates.length > 0) {
          console.log('[USPS] API rates successful');
          return apiRates;
        }
      }
    } catch (error) {
      console.log('[USPS] API failed, using fallback:', error.message);
    }
  }

  // Fallback: Use estimated USPS rates based on weight
  console.log('[USPS] Using estimated rates (API unavailable)');
  return getUspsEstimatedRates(parcels);
}

async function getUspsApiRates(token, parcels, to) {
  const results = [];

  for (const parcel of parcels) {
    try {
      // Convert weight from lbs to ounces for USPS API
      const weightOz = Math.ceil((parcel.weightLb || 1) * 16);

      const body = {
        originZIPCode: ORIGIN.zip,
        destinationZIPCode: to.postal || to.zip,
        weight: weightOz,
        length: parcel.length || 12,
        width: parcel.width || 12,
        height: parcel.height || 6,
        mailClass: 'PRIORITY_MAIL',
        processingCategory: 'MACHINABLE',
        destinationEntryFacilityType: 'NONE',
        rateIndicator: 'DR',
      };

      const response = await fetch('https://api.usps.com/prices/v3/base-rates/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.error('USPS rate request failed:', response.status);
        continue;
      }

      const data = await response.json();
      const rate = data?.totalBasePrice;

      if (rate) {
        results.push({
          carrier: 'USPS',
          service: 'Priority Mail',
          serviceCode: 'PRIORITY',
          priceCents: Math.round(Number(rate) * 100),
          estDays: 2,
          detail: { uspsResponse: data },
        });
      }
    } catch (error) {
      console.error('USPS rate error for parcel:', error.message);
      continue;
    }
  }

  if (!results.length) {
    console.log('[USPS] No API rates returned');
    return [];
  }

  // Combine all parcel rates into a single USPS option
  const totalCents = results.reduce((sum, rate) => sum + rate.priceCents, 0);

  console.log('[USPS] API combined rate:', totalCents / 100);

  return [{
    carrier: 'USPS',
    service: 'Priority Mail',
    serviceCode: 'PRIORITY',
    priceCents: totalCents,
    estDays: 2,
    detail: { parcels: results.length, totalRate: totalCents / 100, source: 'api' },
  }];
}

function getUspsEstimatedRates(parcels) {
  // Estimated USPS Priority Mail rates based on weight
  // These are conservative estimates based on typical USPS Priority Mail pricing
  let totalCents = 0;

  for (const parcel of parcels) {
    const weightLb = parcel.weightLb || 1;
    let estimatedRate;

    // USPS Priority Mail rate estimates (conservative)
    if (weightLb <= 1) estimatedRate = 9.50;
    else if (weightLb <= 2) estimatedRate = 11.50;
    else if (weightLb <= 3) estimatedRate = 13.50;
    else if (weightLb <= 5) estimatedRate = 16.50;
    else if (weightLb <= 10) estimatedRate = 22.00;
    else if (weightLb <= 20) estimatedRate = 35.00;
    else if (weightLb <= 30) estimatedRate = 45.00;
    else if (weightLb <= 50) estimatedRate = 65.00;
    else if (weightLb <= 70) estimatedRate = 85.00;
    else estimatedRate = Math.max(85, weightLb * 1.25); // $1.25/lb for heavy items

    totalCents += Math.round(estimatedRate * 100);
  }

  console.log('[USPS] Estimated rate:', totalCents / 100);

  return [{
    carrier: 'USPS',
    service: 'Priority Mail (estimated)',
    serviceCode: 'PRIORITY_EST',
    priceCents: totalCents,
    estDays: 2,
    detail: {
      parcels: parcels.length,
      totalRate: totalCents / 100,
      source: 'estimated',
      note: 'Estimated rate - actual rate may vary'
    },
  }];
}

// ---- Simple USPS function that always works ----
async function getSimpleUspsRates(to, parcels) {
  console.log('[SIMPLE USPS] Called with:', { country: to.country, parcels: parcels?.length });

  // Only US domestic
  if (to.country !== 'US') {
    console.log('[SIMPLE USPS] Not US, skipping');
    return [];
  }

  if (!parcels || parcels.length === 0) {
    console.log('[SIMPLE USPS] No parcels, skipping');
    return [];
  }

  console.log('[SIMPLE USPS] Calculating estimated rates...');

  // Calculate total weight
  let totalWeight = 0;
  for (const parcel of parcels) {
    totalWeight += parcel.weightLb || 1;
  }

  console.log('[SIMPLE USPS] Total weight:', totalWeight, 'lbs');

  // Simple rate calculation
  let estimatedRate;
  if (totalWeight <= 1) estimatedRate = 9.50;
  else if (totalWeight <= 2) estimatedRate = 11.50;
  else if (totalWeight <= 3) estimatedRate = 13.50;
  else if (totalWeight <= 5) estimatedRate = 16.50;
  else if (totalWeight <= 10) estimatedRate = 22.00;
  else if (totalWeight <= 20) estimatedRate = 35.00;
  else if (totalWeight <= 30) estimatedRate = 45.00;
  else if (totalWeight <= 50) estimatedRate = 65.00;
  else if (totalWeight <= 70) estimatedRate = 85.00;
  else estimatedRate = Math.max(85, totalWeight * 1.25);

  const result = [{
    carrier: 'USPS',
    service: 'Priority Mail (estimated)',
    serviceCode: 'PRIORITY_EST',
    priceCents: Math.round(estimatedRate * 100),
    estDays: 2,
    detail: {
      totalWeight,
      estimatedRate,
      source: 'simple_estimated',
      note: 'Estimated rate - actual may vary'
    },
  }];

  console.log('[SIMPLE USPS] Returning rate:', result[0]);
  return result;
}

// ---- TQL placeholder (enable later) ----
async function getTqlRates(/* { to, pallets } */) {
  // Return [] for now. When you enable:
  // - Call your TQL quote endpoint with pallet dims/weight and addresses
  // - Return rates in the same shape as UPS above
  return [];
}

export default async function handler(req, res) {
  try {
    const { items, to } = req.body || {};
    if (!Array.isArray(items) || !to) {
      return res.status(400).json({ error: 'items and to required' });
    }

    // First, pack the cart using our packer
    const packResp = await fetch(new URL('/api/shipping/pack', `http://${req.headers.host}`).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const pack = await packResp.json();

    // Fan out to carriers with error handling
    const [ups, usps, tql] = await Promise.all([
      getUpsRates({ to, parcels: pack.parcels, pallets: pack.pallets }).catch(e => {
        console.error('[UPS] Error:', e.message);
        return [];
      }),
      getSimpleUspsRates(to, pack.parcels).catch(e => {
        console.error('[USPS] Error:', e.message);
        return [];
      }),
      getTqlRates({ to, pallets: pack.pallets }).catch(e => {
        console.error('[TQL] Error:', e.message);
        return [];
      }),
    ]);

    const rates = [...ups, ...usps, ...tql].sort((a, b) => a.priceCents - b.priceCents);

    return res.status(200).json({ rates, pack });
  } catch (e) {
    console.error('rates error', e);
    return res.status(500).json({ error: 'rate failed' });
  }
}
