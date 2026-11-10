// /api/shipping/rates.js
// Unified shipping rates endpoint using the new architecture
// Automatically routes to UPS, USPS, or TQL based on quantity

export const config = { runtime: 'nodejs' };

import { UnifiedShippingService } from '../_lib/unified-shipping-service.js';

/**
 * POST /api/shipping/rates
 *
 * Request body:
 * {
 *   to: { name, street, city, state, postal/zip, country },
 *   items: [
 *     { type: 'bulk', units: 10000 } or
 *     { type: 'kit', qty: 5 }
 *   ]
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   provider: 'UPS' | 'USPS' | 'TQL',
 *   expectedProvider: string,
 *   totalQuantity: number,
 *   fallbackUsed: boolean,
 *   rates: [
 *     {
 *       id: string,
 *       service: string,
 *       carrier: string,
 *       rate: number,
 *       priceCents: number,
 *       currency: 'USD',
 *       delivery_days?: number,
 *       displayName: string,
 *       estimatedDelivery: string,
 *       ...
 *     }
 *   ],
 *   packages: { parcels: [], pallets: [], meta: {} },
 *   errors?: [{ carrier, error }]
 * }
 */
export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Return API documentation
    return res.status(200).json({
      endpoint: '/api/shipping/rates',
      method: 'POST',
      description: 'Get shipping rates from appropriate carrier based on quantity',
      requiredFields: {
        to: {
          name: 'string (optional)',
          street: 'string',
          city: 'string',
          state: 'string (2-letter code)',
          postal: 'string (or zip)',
          country: 'string (2-letter code, default: US)'
        },
        items: [
          { type: 'bulk', units: 'number (Force Dowel bulk units)' },
          { type: 'kit', qty: 'number (starter kit quantity)' }
        ]
      },
      routing: {
        'USPS': 'Small parcels and kits (< 5,000 units)',
        'UPS': 'Medium to large parcels (5,000 - 79,999 units)',
        'TQL': 'Freight/pallets (80,000+ units)'
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, to } = req.body || {};

    // Validate required fields
    if (!Array.isArray(items) || !to) {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'items (array) and to (object) are required'
      });
    }

    // Validate destination address
    const requiredFields = ['city', 'state', 'country'];
    for (const field of requiredFields) {
      if (!to[field]) {
        return res.status(400).json({
          error: 'Invalid destination address',
          details: `Missing required field: ${field}`
        });
      }
    }

    if (!to.postal && !to.zip) {
      return res.status(400).json({
        error: 'Invalid destination address',
        details: 'Either postal or zip is required'
      });
    }

    // Validate items
    if (items.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'items array cannot be empty'
      });
    }

    // Log request details
    console.log('[Rates API] Request received:', {
      destination: `${to.city}, ${to.state} ${to.postal || to.zip}`,
      itemCount: items.length,
      items: items.map(i => `${i.type}: ${i.units || i.qty}`)
    });

    // Get rates using unified service - throws on error
    const shippingService = new UnifiedShippingService();
    const result = await shippingService.getShippingRates(to, items);

    // Log result
    console.log('[Rates API] Result:', {
      success: result.success,
      provider: result.provider,
      rateCount: result.rates.length
    });

    // Return result
    return res.status(200).json(result);

  } catch (error) {
    console.error('[Rates API] Unexpected error:', error);
    return res.status(500).json({
      error: 'Shipping rate request failed',
      details: error.message
    });
  }
}
