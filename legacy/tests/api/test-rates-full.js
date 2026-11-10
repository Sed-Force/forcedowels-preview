// Test the full rates endpoint
// Run with: node api/test-rates-full.js

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
});

async function testRates() {
  console.log('Testing shipping rates endpoint...\n');

  const requestBody = {
    to: {
      country: 'US',
      state: 'CA',
      city: 'Los Angeles',
      postal: '90001',
      street: '123 Main St'
    },
    items: [
      {
        type: 'bulk',
        units: 80000  // Should route to TQL (which will fail - not implemented)
      }
    ]
  };

  console.log('Request:', JSON.stringify(requestBody, null, 2));
  console.log('');

  try {
    const response = await fetch('http://localhost:3000/api/shipping/rates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok && data.rates) {
      console.log('\n✅ SUCCESS! Got rates:');
      data.rates.forEach(rate => {
        console.log(`  ${rate.carrier} ${rate.service}: $${(rate.priceCents / 100).toFixed(2)}`);
      });
    } else {
      console.log('\n❌ FAILED!');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testRates();
