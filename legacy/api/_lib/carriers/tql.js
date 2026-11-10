// TQL (Total Quality Logistics) API Service for LTL shipping quotes
export const config = { runtime: 'nodejs' };

import { getTQLToken } from './tql-auth.js';

const TQL_BASE_URL = process.env.TQL_BASE_URL || 'https://public.api.tql.com';
const TQL_SUBSCRIPTION_KEY = process.env.NEXT_PUBLIC_TQL_SUBSCRIPTION_KEY;

// Validate origin configuration
const SHIP_FROM_CITY = process.env.SHIP_FROM_CITY;
const SHIP_FROM_STATE = process.env.SHIP_FROM_STATE;
const SHIP_FROM_ZIP = process.env.SHIP_FROM_ZIP;
const SHIP_FROM_COUNTRY = process.env.SHIP_FROM_COUNTRY ?? 'US';

if (!SHIP_FROM_CITY || !SHIP_FROM_STATE || !SHIP_FROM_ZIP) {
  throw new Error('Missing required SHIP_FROM environment variables for TQL');
}

/**
 * @typedef {Object} TQLAddress
 * @property {string} city
 * @property {string} state
 * @property {string} postalCode
 * @property {string} country
 * @property {string} [name]
 * @property {string} [streetAddress]
 * @property {string} [contactName]
 * @property {string} [contactPhone]
 * @property {string} [hoursOpen]
 * @property {string} [hoursClosed]
 */

/**
 * @typedef {Object} TQLItem
 * @property {string} description
 * @property {number} weight
 * @property {number} dimensionLength
 * @property {number} dimensionWidth
 * @property {number} dimensionHeight
 * @property {number} quantity
 * @property {string} freightClassCode
 * @property {string} [unitTypeCode]
 * @property {string} [nmfc]
 * @property {boolean} [isHazmat]
 * @property {boolean} [isStackable]
 */

/**
 * @typedef {Object} TQLQuoteRequest
 * @property {TQLAddress} origin
 * @property {TQLAddress} destination
 * @property {TQLItem[]} quoteCommodities
 * @property {string} [shipmentDate]
 * @property {string} [pickLocationType]
 * @property {string} [dropLocationType]
 * @property {string[]} [accessorials]
 */

/**
 * @typedef {Object} TQLRate
 * @property {number} id
 * @property {string} carrier
 * @property {string} scac
 * @property {number} customerRate
 * @property {string} [carrierQuoteId]
 * @property {string} serviceLevel
 * @property {string} serviceType
 * @property {number} transitDays
 * @property {number} maxLiabilityNew
 * @property {number} maxLiabilityUsed
 * @property {string} serviceLevelDescription
 * @property {any[]} priceCharges
 * @property {boolean} isPreferred
 * @property {boolean} isCarrierOfTheYear
 * @property {boolean} isEconomy
 */

/**
 * @typedef {Object} TQLQuoteResponse
 * @property {Object} content
 * @property {number} content.quoteId
 * @property {TQLRate[]} content.carrierPrices
 * @property {any[]} content.quoteCommodities
 * @property {string} content.createdDate
 * @property {string} content.shipmentDate
 * @property {string} content.expirationDate
 * @property {number} statusCode
 * @property {string} informationalMessage
 */

/**
 * TQL Service Class
 */
export class TQLService {
  constructor() {
    this.baseUrl = TQL_BASE_URL;
    this.subscriptionKey = TQL_SUBSCRIPTION_KEY;
  }

  /**
   * Create a new LTL quote
   * @param {TQLQuoteRequest} quoteData
   * @returns {Promise<TQLQuoteResponse>}
   */
  async createQuote(quoteData) {
    const token = await getTQLToken();

    const endpoint = `${this.baseUrl}/ltl/quotes`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        'Authorization': `Bearer ${token.access_token}`
      },
      body: JSON.stringify(quoteData)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`TQL quote creation failed: ${response.status} - ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    return result;
  }

  /**
   * Get an existing quote by ID
   * @param {string} quoteId
   * @returns {Promise<TQLQuoteResponse>}
   */
  async getQuote(quoteId) {
    const token = await getTQLToken();

    const response = await fetch(`${this.baseUrl}/ltl/quotes/${quoteId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        'Authorization': `Bearer ${token.access_token}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`TQL quote retrieval failed: ${response.status} - ${JSON.stringify(error)}`);
    }

    return response.json();
  }
}

/**
 * Determine freight class based on weight and dimensions
 * @param {number} weight - Weight in pounds
 * @param {number[]} dimensions - Dimensions in inches [length, width, height]
 * @returns {string} Freight class code
 */
function determineFreightClass(weight, dimensions) {
  const [length, width, height] = dimensions;
  const volume = (length * width * height) / 1728; // cubic feet
  const density = weight / volume; // lbs per cubic foot

  // Standard freight class determination for wooden products
  if (density >= 30) return '55';
  if (density >= 22.5) return '60';
  if (density >= 15) return '65';
  if (density >= 13.5) return '70';
  if (density >= 12) return '77.5';
  if (density >= 10.5) return '85';
  if (density >= 9) return '92.5';
  if (density >= 8) return '100';
  if (density >= 6) return '110';
  if (density >= 5) return '125';
  if (density >= 4) return '150';
  if (density >= 3) return '175';
  if (density >= 2) return '200';
  if (density >= 1) return '250';
  return '300'; // lowest density class
}

/**
 * Get TQL shipping rates (main export function)
 * @param {Object} options
 * @param {Object} options.to - Destination address
 * @param {Array} options.pallets - Array of pallet objects
 * @returns {Promise<Array>} Array of rate objects
 */
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

  // Calculate freight class based on density (weight / volume)
  // For Force Dowels: use NMFC 161030, freight class based on density
  const quoteCommodities = pallets.map((pallet, index) => {
    const freightClassCode = determineFreightClass(pallet.weightLb, [
      pallet.length,
      pallet.width,
      pallet.height
    ]);

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
      country: SHIP_FROM_COUNTRY === 'US' ? 'USA' : SHIP_FROM_COUNTRY,
    },
    destination: {
      city: to.city,
      state: to.state,
      postalCode: to.postal ?? to.zip,
      country: to.country === 'US' ? 'USA' : (to.country || 'USA'),
    },
    quoteCommodities,
    shipmentDate: new Date().toISOString().split('T')[0],
    pickLocationType: 'Commercial',
    dropLocationType: 'Commercial',
    accessorials: [],
  };

  console.log('[TQL] Requesting LTL freight quote...');

  // Submit freight quote request to TQL LTL endpoint
  const tqlService = new TQLService();
  const data = await tqlService.createQuote(quoteRequest);

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
