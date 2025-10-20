// TQL (Total Quality Logistics) carrier integration for freight shipments
export const config = { runtime: 'nodejs' };

const TQL_CLIENT_ID = process.env.TQL_CLIENT_ID;
const TQL_CLIENT_SECRET = process.env.TQL_CLIENT_SECRET;
const TQL_USERNAME = process.env.TQL_USERNAME;
const TQL_PASSWORD = process.env.TQL_PASSWORD;
const TQL_BASE_URL = process.env.TQL_BASE_URL ?? 'https://public.api.tql.com';
const TQL_SUBSCRIPTION_KEY = process.env.NEXT_PUBLIC_TQL_SUBSCRIPTION_KEY;

// Validate origin configuration
const SHIP_FROM_CITY = process.env.SHIP_FROM_CITY;
const SHIP_FROM_STATE = process.env.SHIP_FROM_STATE;
const SHIP_FROM_ZIP = process.env.SHIP_FROM_ZIP;
const SHIP_FROM_COUNTRY = process.env.SHIP_FROM_COUNTRY ?? 'US';

if (!SHIP_FROM_CITY || !SHIP_FROM_STATE || !SHIP_FROM_ZIP) {
  throw new Error('Missing required SHIP_FROM environment variables for TQL');
}

let _tqlToken = null;
let _tqlTokenExp = 0;

async function getTqlAccessToken() {
  if (!TQL_CLIENT_ID || !TQL_CLIENT_SECRET) {
    throw new Error('TQL credentials missing: TQL_CLIENT_ID and TQL_CLIENT_SECRET are required');
  }

  if (!TQL_USERNAME || !TQL_PASSWORD) {
    throw new Error('TQL user credentials missing: TQL_USERNAME and TQL_PASSWORD are required');
  }

  if (!TQL_SUBSCRIPTION_KEY) {
    throw new Error('TQL subscription key missing: NEXT_PUBLIC_TQL_SUBSCRIPTION_KEY is required');
  }

  // Check cached token (expire 5 minutes early for safety)
  const nowSec = Math.floor(Date.now() / 1000);
  if (_tqlToken && nowSec < _tqlTokenExp - 300) {
    return _tqlToken;
  }

  console.log('[TQL] Requesting OAuth token...');

  // TQL uses OAuth 2.0 password grant with form-urlencoded
  // Production scopes - full URLs required
  const scopes = [
    'https://tqlidentity.onmicrosoft.com/services_combined/LTLQuotes.Read',
    'https://tqlidentity.onmicrosoft.com/services_combined/LTLQuotes.Write'
  ].join(' ');

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: TQL_CLIENT_ID,
    client_secret: TQL_CLIENT_SECRET,
    username: TQL_USERNAME,
    password: TQL_PASSWORD,
    scope: scopes,
  });

  const response = await fetch(`${TQL_BASE_URL}/identity/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Ocp-Apim-Subscription-Key': TQL_SUBSCRIPTION_KEY,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TQL OAuth failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('TQL OAuth response missing access_token');
  }

  _tqlToken = data.access_token;
  _tqlTokenExp = nowSec + (data.expires_in ?? 3600);

  console.log('[TQL] OAuth token obtained successfully');
  return _tqlToken;
}

export async function getTqlRates({ to, pallets }) {
  if (!to) {
    throw new Error('Destination address is required');
  }

  if (!Array.isArray(pallets) || pallets.length === 0) {
    throw new Error('TQL requires pallets for freight shipments');
  }

  // Validate destination
  if (!to.city) throw new Error('Destination city is required');
  if (!to.state) throw new Error('Destination state is required');
  if (!to.postal && !to.zip) throw new Error('Destination postal/zip code is required');
  if (!to.country) throw new Error('Destination country is required');

  // Validate each pallet
  for (let i = 0; i < pallets.length; i++) {
    const pallet = pallets[i];
    if (!pallet.weightLb || typeof pallet.weightLb !== 'number') {
      throw new Error(`Pallet ${i + 1} must have numeric weightLb`);
    }
    if (!pallet.length || !pallet.width || !pallet.height) {
      throw new Error(`Pallet ${i + 1} must have length, width, and height`);
    }
  }

  console.log('[TQL] Getting freight rates for', pallets.length, 'pallet(s)');

  // Get OAuth token
  const token = await getTqlAccessToken();

  // Calculate freight class based on density (weight / volume)
  // For Force Dowels: use NMFC 161030, freight class based on density
  const quoteCommodities = pallets.map((pallet, index) => {
    const volumeCuFt = (pallet.length * pallet.width * pallet.height) / 1728; // Convert cubic inches to cubic feet
    const density = pallet.weightLb / volumeCuFt;

    // Freight class based on density (common NMFC classifications)
    let freightClassCode = '50';
    if (density >= 30) freightClassCode = '55';
    else if (density >= 22.5) freightClassCode = '60';
    else if (density >= 15) freightClassCode = '65';
    else if (density >= 13.5) freightClassCode = '70';
    else if (density >= 12) freightClassCode = '77.5';
    else if (density >= 10.5) freightClassCode = '85';
    else if (density >= 9) freightClassCode = '92.5';
    else if (density >= 8) freightClassCode = '100';
    else if (density >= 6) freightClassCode = '110';
    else if (density >= 5) freightClassCode = '125';
    else if (density >= 4) freightClassCode = '150';
    else if (density >= 3) freightClassCode = '175';
    else if (density >= 2) freightClassCode = '200';
    else if (density >= 1) freightClassCode = '250';
    else freightClassCode = '300';

    return {
      description: `Force Dowels - Pallet ${index + 1}`,
      weight: pallet.weightLb,
      dimensionLength: pallet.length,
      dimensionWidth: pallet.width,
      dimensionHeight: pallet.height,
      quantity: 1,
      freightClassCode,
      unitTypeCode: 'PLT',
      nmfc: '161030',
      isHazmat: false,
      isStackable: true,
    };
  });

  // Build TQL LTL quote request
  const quoteRequest = {
    origin: {
      city: SHIP_FROM_CITY,
      state: SHIP_FROM_STATE,
      postalCode: SHIP_FROM_ZIP,
      country: SHIP_FROM_COUNTRY,
    },
    destination: {
      city: to.city,
      state: to.state,
      postalCode: to.postal ?? to.zip,
      country: to.country,
    },
    quoteCommodities,
    shipmentDate: new Date().toISOString().split('T')[0],
    pickLocationType: 'Commercial',
    dropLocationType: 'Commercial',
    accessorials: [],
  };

  console.log('[TQL] Requesting LTL freight quote...');

  // Submit freight quote request to TQL LTL endpoint
  const response = await fetch(`${TQL_BASE_URL}/ltl/quotes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Ocp-Apim-Subscription-Key': TQL_SUBSCRIPTION_KEY,
    },
    body: JSON.stringify(quoteRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TQL LTL quote request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // Parse TQL response - content.carrierPrices is an array of rate options
  if (!data.content || !data.content.carrierPrices || !Array.isArray(data.content.carrierPrices)) {
    throw new Error('TQL response missing content.carrierPrices array');
  }

  if (data.content.carrierPrices.length === 0) {
    throw new Error('TQL returned no freight carrier prices');
  }

  // Convert TQL carrier prices to standard rate format
  const rates = data.content.carrierPrices.map(price => {
    const totalCost = price.customerRate;
    if (!totalCost || typeof totalCost !== 'number') {
      console.warn('[TQL] Carrier price missing valid customerRate, skipping');
      return null;
    }

    return {
      carrier: 'TQL',
      service: price.carrier ?? 'LTL Freight',
      serviceCode: price.scac ?? 'LTL',
      priceCents: Math.round(totalCost * 100),
      estDays: price.transitDays ?? null,
      detail: {
        quoteId: data.content.quoteId,
        carrierScac: price.scac,
        carrierName: price.carrier,
        serviceLevel: price.serviceLevel,
        isPreferred: price.isPreferred ?? false,
        isEconomy: price.isEconomy ?? false,
        liabilityMaximum: price.maxLiabilityNew,
        tqlResponse: price,
      },
    };
  }).filter(rate => rate !== null);

  if (rates.length === 0) {
    throw new Error('TQL returned no valid freight rates');
  }

  console.log(`[TQL] Returning ${rates.length} freight rate(s)`);
  return rates;
}
