// Test script for USPS shipping rates
// Run with: node api/test-usps-rates.js

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from project root (simple parser)
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
});

console.log('Loaded environment variables from .env.local');

const testUspsRates = async () => {
  const testData = {
    items: [
      {
        type: 'bulk',
        units: 15000  // 15k units = 1 large box (~57 lbs)
      },
      {
        type: 'kit',
        qty: 3  // 3 kits = 2 cartons
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
    console.log('Testing USPS shipping rates...');
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
      console.log('✅ SUCCESS');
      console.log('');
      console.log('Available Rates:');
      responseData.rates.forEach((rate, idx) => {
        console.log(`  ${idx + 1}. ${rate.carrier} - ${rate.service}`);
        console.log(`     Price: $${(rate.priceCents / 100).toFixed(2)}`);
        console.log(`     Est. Days: ${rate.estDays || 'N/A'}`);
        console.log('');
      });

      if (responseData.errors && responseData.errors.length > 0) {
        console.log('⚠️  Carrier Errors:');
        responseData.errors.forEach(err => {
          console.log(`  - ${err.carrier}: ${err.error}`);
        });
        console.log('');
      }

      console.log('Package Info:');
      console.log(`  Parcels: ${responseData.pack.parcels?.length || 0}`);
      console.log(`  Pallets: ${responseData.pack.pallets?.length || 0}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
};

testUspsRates();
