// Unified shipping service that routes between carriers based on quantity
// Similar to forceDowels architecture

import { getPackagesForBulk, getPackagesForKits, getProviderForQuantity } from './packaging-tiers.js';

const ORIGIN = {
  name: process.env.SHIP_FROM_NAME || 'Force Dowels',
  street: process.env.SHIP_FROM_STREET || '4455 E Nunneley Rd, Ste 103',
  city: process.env.SHIP_FROM_CITY || 'Gilbert',
  state: process.env.SHIP_FROM_STATE || 'AZ',
  zip: process.env.SHIP_FROM_ZIP || '85296',
  postal: process.env.SHIP_FROM_POSTAL || '85296',
  country: process.env.SHIP_FROM_COUNTRY || 'US',
};

/**
 * Unified Shipping Service
 * Routes shipping requests to the appropriate carrier based on quantity and requirements
 */
export class UnifiedShippingService {
  constructor() {
    this.origin = ORIGIN;
  }

  /**
   * Static method to determine provider based on quantity
   * @param {number} totalQuantity - Total units in order
   * @returns {string} Provider name
   */
  static getProviderForQuantity(totalQuantity) {
    return getProviderForQuantity(totalQuantity);
  }

  /**
   * Get shipping rates from all carriers
   * @param {Object} toAddress - Destination address
   * @param {Array} items - Cart items [{type: 'bulk', units: N} or {type: 'kit', qty: N}]
   * @returns {Promise<Object>} Rates response with all carrier rates
   */
  async getShippingRates(toAddress, items) {
    // Calculate total quantity
    const totalQuantity = this.calculateTotalQuantity(items);

    if (!totalQuantity || totalQuantity <= 0) {
      throw new Error('Total quantity must be greater than 0');
    }

    // Determine recommended provider based on quantity
    const recommendedProvider = UnifiedShippingService.getProviderForQuantity(totalQuantity);

    // Convert items to packages
    const packages = this.itemsToPackages(items);

    console.log('[UnifiedShipping] Processing request:', {
      totalQuantity,
      recommendedProvider,
      packageCount: packages.parcels.length + packages.pallets.length
    });

    // Fetch rates from all carriers in parallel
    const allRates = [];
    const errors = [];

    // Only fetch from carriers that can handle the package type
    const carrierPromises = [];

    // USPS - for all parcels under 70 lbs (no pallets)
    // Only call USPS for kits, test orders, or lightweight parcels (bulk orders typically fail USPS validation)
    const isKitsOnly = packages.meta.bulkUnits === 0 && (packages.meta.kitQty > 0 || packages.meta.testQty > 0);

    if (packages.parcels.length > 0 && packages.pallets.length === 0) {
      // Check if any parcel exceeds USPS weight limit (70 lbs)
      const hasHeavyParcel = packages.parcels.some(p => p.weightLb > 70);

      if (!hasHeavyParcel && isKitsOnly) {
        // Only fetch USPS for kits - bulk orders fail USPS validation even when under 70 lbs
        carrierPromises.push(
          this.getUSPSRates(toAddress, packages)
            .then(rates => ({ carrier: 'USPS', rates }))
            .catch(err => {
              console.error('[UnifiedShipping] USPS error:', err.message);
              errors.push({ carrier: 'USPS', error: err.message });
              return { carrier: 'USPS', rates: [] };
            })
        );
      }
    }

    // UPS - for parcels (no pallets)
    if (packages.parcels.length > 0 && packages.pallets.length === 0) {
      carrierPromises.push(
        this.getUPSRates(toAddress, packages)
          .then(rates => ({ carrier: 'UPS', rates }))
          .catch(err => {
            console.error('[UnifiedShipping] UPS error:', err.message);
            errors.push({ carrier: 'UPS', error: err.message });
            return { carrier: 'UPS', rates: [] };
          })
      );
    }

    // TQL - only for pallets
    if (packages.pallets.length > 0) {
      carrierPromises.push(
        this.getTQLRates(toAddress, packages)
          .then(rates => ({ carrier: 'TQL', rates }))
          .catch(err => {
            console.error('[UnifiedShipping] TQL error:', err.message);
            errors.push({ carrier: 'TQL', error: err.message });
            return { carrier: 'TQL', rates: [] };
          })
      );
    }

    // Wait for all carriers to respond
    const results = await Promise.all(carrierPromises);

    // Combine all rates
    for (const result of results) {
      if (result.rates && result.rates.length > 0) {
        allRates.push(...result.rates);
      }
    }

    if (allRates.length === 0) {
      throw new Error('No shipping rates available from any carrier');
    }

    console.log('[UnifiedShipping] Returning rates:', {
      totalRates: allRates.length,
      carriers: results.map(r => `${r.carrier}: ${r.rates.length}`).join(', ')
    });

    return {
      success: true,
      recommendedProvider,
      totalQuantity,
      rates: allRates.map(rate => this.formatRate(rate)),
      packages,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Calculate total quantity from items
   */
  calculateTotalQuantity(items) {
    if (!Array.isArray(items)) {
      throw new Error('Items must be an array');
    }

    return items.reduce((sum, item) => {
      if (!item || !item.type) {
        throw new Error('Each item must have a type property');
      }

      if (item.type === 'bulk') {
        if (typeof item.units !== 'number' || item.units <= 0) {
          throw new Error('Bulk items must have a positive units value');
        }
        return sum + item.units;
      } else if (item.type === 'kit') {
        if (typeof item.qty !== 'number' || item.qty <= 0) {
          throw new Error('Kit items must have a positive qty value');
        }
        return sum + item.qty;
      } else if (item.type === 'test') {
        // Test orders count as 1 unit for shipping calculation purposes
        return sum + 1;
      } else {
        throw new Error(`Unknown item type: ${item.type}`);
      }
    }, 0);
  }

  /**
   * Convert cart items to packages (parcels and pallets)
   */
  itemsToPackages(items) {
    const parcels = [];
    const pallets = [];
    let bulkUnits = 0;
    let kitQty = 0;
    let testQty = 0;

    // Aggregate quantities by type
    for (const item of items) {
      if (item.type === 'bulk') {
        if (typeof item.units !== 'number') {
          throw new Error('Bulk items must have numeric units');
        }
        bulkUnits += item.units;
      } else if (item.type === 'kit') {
        if (typeof item.qty !== 'number') {
          throw new Error('Kit items must have numeric qty');
        }
        kitQty += item.qty;
      } else if (item.type === 'test') {
        // Test items are treated as minimal shipping (like a kit)
        testQty += 1;
      }
    }

    // Convert bulk to packages
    if (bulkUnits > 0) {
      const bulkPackages = getPackagesForBulk(bulkUnits);
      if (!bulkPackages || bulkPackages.length === 0) {
        throw new Error('Failed to create packages for bulk units');
      }
      for (const pkg of bulkPackages) {
        if (pkg.type === 'pallet') {
          pallets.push(pkg);
        } else {
          parcels.push(pkg);
        }
      }
    }

    // Convert kits to packages
    if (kitQty > 0) {
      const kitPackages = getPackagesForKits(kitQty);
      if (!kitPackages || kitPackages.length === 0) {
        throw new Error('Failed to create packages for kits');
      }
      parcels.push(...kitPackages);
    }

    // Convert test items to packages (use kit package as template)
    if (testQty > 0) {
      // Test items ship as a minimal parcel (same as 1 kit)
      const testPackages = getPackagesForKits(1);
      if (testPackages && testPackages.length > 0) {
        parcels.push(...testPackages);
      }
    }

    return {
      parcels,
      pallets,
      meta: { bulkUnits, kitQty, testQty }
    };
  }

  /**
   * Get UPS rates with UPS-specific packaging for kits
   */
  async getUPSRates(toAddress, packages) {
    const { getUpsRates } = await import('./carriers/ups.js');

    // For kits, repackage using UPS-specific dimensions (2 kits per box, 11x9x2)
    const isKitsOnly = packages.meta.bulkUnits === 0 && packages.meta.kitQty > 0;

    if (isKitsOnly) {
      const { getPackagesForKitsUPS } = await import('./packaging-tiers.js');
      const upsKitPackages = getPackagesForKitsUPS(packages.meta.kitQty);

      return getUpsRates({
        to: toAddress,
        parcels: upsKitPackages,
        pallets: []
      });
    }

    return getUpsRates({
      to: toAddress,
      parcels: packages.parcels,
      pallets: packages.pallets
    });
  }

  /**
   * Get USPS rates
   */
  async getUSPSRates(toAddress, packages) {
    const { getUspsRates } = await import('./carriers/usps.js');
    return getUspsRates({
      to: toAddress,
      parcels: packages.parcels
    });
  }

  /**
   * Get TQL rates
   */
  async getTQLRates(toAddress, packages) {
    const { getTqlRates } = await import('./carriers/tql.js');
    return getTqlRates({
      to: toAddress,
      pallets: packages.pallets
    });
  }

  /**
   * Format rate to unified format
   */
  formatRate(rate) {
    if (!rate) {
      throw new Error('Rate object is required');
    }
    if (!rate.carrier) {
      throw new Error('Rate must have carrier');
    }
    if (!rate.service) {
      throw new Error('Rate must have service');
    }
    if (typeof rate.priceCents !== 'number') {
      throw new Error('Rate must have numeric priceCents');
    }

    const serviceCode = rate.serviceCode ?? rate.service.toLowerCase().replace(/\s/g, '-');

    return {
      id: `${rate.carrier.toLowerCase()}-${serviceCode}`,
      service: rate.service,
      carrier: rate.carrier,
      rate: rate.priceCents / 100,
      priceCents: rate.priceCents,
      currency: 'USD',
      delivery_days: rate.estDays ?? null,
      delivery_date: rate.deliveryDate ?? null,
      delivery_date_guaranteed: rate.guaranteed ?? false,
      provider: rate.carrier,
      displayName: `${rate.carrier} ${rate.service}`,
      estimatedDelivery: rate.estDays ? `${rate.estDays} days` : 'TBD',
      serviceCode: rate.serviceCode ?? null,
      detail: rate.detail ?? null
    };
  }
}
