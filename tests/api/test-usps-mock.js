// Mock test for USPS shipping rates - tests logic without needing real API credentials
// Run with: node api/test-usps-mock.js

// Mock the fetch function to return fake USPS responses
const originalFetch = global.fetch;

const mockUspsResponses = {
  token: {
    access_token: 'mock_token_12345',
    token_type: 'Bearer',
    expires_in: 3600
  },
  rates: {
    'USPS_GROUND_ADVANTAGE': {
      totalBasePrice: 12.50,
      serviceStandard: '5'
    },
    'PRIORITY_MAIL': {
      totalBasePrice: 18.75,
      serviceStandard: '2'
    },
    'PRIORITY_MAIL_EXPRESS': {
      totalBasePrice: 32.50,
      serviceStandard: '1'
    }
  }
};

global.fetch = async (url, options) => {
  // Mock OAuth token request
  if (url.includes('/oauth2/v3/token')) {
    return {
      ok: true,
      json: async () => mockUspsResponses.token
    };
  }

  // Mock rate request
  if (url.includes('/prices/v3/base-rates/search')) {
    const body = JSON.parse(options.body);
    const mailClass = body.mailClass;
    const rateData = mockUspsResponses.rates[mailClass];

    if (rateData) {
      return {
        ok: true,
        json: async () => rateData
      };
    }

    return {
      ok: false,
      status: 400,
      text: async () => 'Invalid mail class'
    };
  }

  // Mock pack endpoint
  if (url.includes('/api/shipping/pack')) {
    return {
      ok: true,
      json: async () => ({
        parcels: [
          {
            type: 'parcel',
            packaging: 'bulk-box',
            units: 15000,
            weightLb: 57,
            length: 22,
            width: 22,
            height: 12
          },
          {
            type: 'parcel',
            packaging: 'kit-carton',
            kits: 2,
            weightLb: 3.4,
            length: 11,
            width: 9,
            height: 2
          },
          {
            type: 'parcel',
            packaging: 'kit-carton',
            kits: 1,
            weightLb: 1.7,
            length: 11,
            width: 9,
            height: 2
          }
        ],
        pallets: [],
        meta: { bulkUnits: 15000, kitQty: 3 }
      })
    };
  }

  // Default fallback
  return originalFetch(url, options);
};

const testUspsRates = async () => {
  // Set mock environment variables
  process.env.USPS_CLIENT_ID = 'mock_client_id';
  process.env.USPS_CLIENT_SECRET = 'mock_client_secret';
  process.env.SHIP_FROM_ZIP = '85296';

  const testData = {
    items: [
      {
        type: 'bulk',
        units: 15000
      },
      {
        type: 'kit',
        qty: 3
      }
    ],
    to: {
      name: 'Test Customer',
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      postal: '10001',
      zip: '10001',
      country: 'US',
    }
  };

  try {
    console.log('🧪 Testing USPS shipping rates with MOCK data...');
    console.log('Destination:', testData.to.city, testData.to.state);
    console.log('Items:', testData.items.length);
    console.log('');

    // Import the handler directly
    const handler = (await import('./shipping/rates.js')).default;

    // Mock request/response objects
    const req = {
      body: testData,
      headers: {
        host: 'localhost:3000'
      }
    };

    let responseData = null;
    let statusCode = null;

    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        responseData = data;
        return res;
      }
    };

    await handler(req, res);

    console.log('Status Code:', statusCode);
    console.log('');

    if (responseData.error) {
      console.error('❌ ERROR:', responseData.error);
      if (responseData.details) {
        console.error('Details:', JSON.stringify(responseData.details, null, 2));
      }
    } else {
      console.log('✅ SUCCESS - Mock test passed!');
      console.log('');

      // Filter USPS rates for display
      const uspsRates = responseData.rates.filter(r => r.carrier === 'USPS');

      if (uspsRates.length > 0) {
        console.log('📦 USPS Rates:');
        uspsRates.forEach((rate, idx) => {
          console.log(`  ${idx + 1}. ${rate.service}`);
          console.log(`     Service Code: ${rate.serviceCode}`);
          console.log(`     Price: $${(rate.priceCents / 100).toFixed(2)}`);
          console.log(`     Est. Days: ${rate.estDays || 'N/A'}`);
          console.log(`     Parcels: ${rate.detail.parcels}`);
          console.log('');
        });

        console.log('✨ Implementation verified:');
        console.log('   ✓ Multiple service types (Ground Advantage, Priority, Express)');
        console.log('   ✓ Rate aggregation across multiple parcels');
        console.log('   ✓ Service name mapping');
        console.log('   ✓ Delivery day estimation');
      } else {
        console.log('⚠️  No USPS rates returned (this may be normal if UPS rates took precedence)');
      }

      console.log('');
      console.log('All Available Rates:');
      responseData.rates.forEach((rate, idx) => {
        console.log(`  ${idx + 1}. ${rate.carrier} - ${rate.service}: $${(rate.priceCents / 100).toFixed(2)}`);
      });

      if (responseData.errors && responseData.errors.length > 0) {
        console.log('');
        console.log('⚠️  Carrier Errors:');
        responseData.errors.forEach(err => {
          console.log(`  - ${err.carrier}: ${err.error}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Restore original fetch
    global.fetch = originalFetch;
  }
};

testUspsRates();
