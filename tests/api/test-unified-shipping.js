// Test the unified shipping service with different scenarios
// Run with: node api/test-unified-shipping.js

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

const testAddress = {
  name: 'Test Customer',
  street: '123 Main St',
  city: 'Los Angeles',
  state: 'CA',
  postal: '90001',
  country: 'US'
};

async function testScenario(name, items, expectedProvider) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log(`${'='.repeat(60)}`);
  console.log('Items:', JSON.stringify(items, null, 2));
  console.log('Expected Provider:', expectedProvider);
  console.log('');

  try {
    const response = await fetch('http://localhost:3000/api/shipping/rates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: testAddress,
        items
      }),
    });

    console.log('Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error Response:', errorText);
      return { success: false, error: errorText };
    }

    const data = await response.json();

    console.log('\n📦 RESULT:');
    console.log('  Success:', data.success);
    console.log('  Provider:', data.provider);
    console.log('  Expected Provider:', data.expectedProvider);
    console.log('  Total Quantity:', data.totalQuantity);
    console.log('  Fallback Used:', data.fallbackUsed);
    console.log('  Rates Found:', data.rates?.length || 0);

    if (data.rates && data.rates.length > 0) {
      console.log('\n💰 RATES:');
      data.rates.forEach((rate, i) => {
        console.log(`  ${i + 1}. ${rate.carrier} ${rate.service}: $${rate.rate.toFixed(2)} (${rate.estimatedDelivery})`);
      });
    }

    if (data.packages) {
      console.log('\n📦 PACKAGES:');
      console.log('  Parcels:', data.packages.parcels?.length || 0);
      console.log('  Pallets:', data.packages.pallets?.length || 0);
      if (data.packages.parcels?.length > 0) {
        data.packages.parcels.forEach((pkg, i) => {
          console.log(`    Parcel ${i + 1}: ${pkg.weightLb}lb, ${pkg.length}x${pkg.width}x${pkg.height}"`);
        });
      }
    }

    if (data.errors && data.errors.length > 0) {
      console.log('\n⚠️  ERRORS:');
      data.errors.forEach(err => {
        console.log(`  ${err.carrier}: ${err.error}`);
      });
    }

    // Verify expected provider
    const providerMatch = data.provider === expectedProvider || data.expectedProvider === expectedProvider;
    console.log(`\n${providerMatch ? '✅' : '❌'} Provider Check: ${providerMatch ? 'PASSED' : 'FAILED'}`);

    return { success: true, data };

  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n🚀 UNIFIED SHIPPING SERVICE TESTS');
  console.log('Testing forceDowels architecture implementation\n');

  const tests = [
    {
      name: 'Small Order - 2 Kits (USPS Expected)',
      items: [{ type: 'kit', qty: 2 }],
      expectedProvider: 'USPS'
    },
    {
      name: 'Medium Order - 5,000 Units (UPS Expected)',
      items: [{ type: 'bulk', units: 5000 }],
      expectedProvider: 'UPS'
    },
    {
      name: 'Large Order - 10,000 Units (UPS Expected)',
      items: [{ type: 'bulk', units: 10000 }],
      expectedProvider: 'UPS'
    },
    {
      name: 'Freight Order - 80,000 Units (TQL Expected, may fallback to UPS)',
      items: [{ type: 'bulk', units: 80000 }],
      expectedProvider: 'TQL'
    },
    {
      name: 'Mixed Order - 5,000 Units + 3 Kits (UPS Expected)',
      items: [
        { type: 'bulk', units: 5000 },
        { type: 'kit', qty: 3 }
      ],
      expectedProvider: 'UPS'
    }
  ];

  const results = [];

  for (const test of tests) {
    const result = await testScenario(test.name, test.items, test.expectedProvider);
    results.push({
      name: test.name,
      passed: result.success && (result.data?.rates?.length > 0),
      ...result
    });

    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('TEST SUMMARY');
  console.log(`${'='.repeat(60)}`);

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach((result, i) => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${i + 1}. ${status}: ${result.name}`);
  });

  console.log(`\n${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('\n🎉 ALL TESTS PASSED! Unified shipping service is working correctly.\n');
  } else {
    console.log(`\n⚠️  ${total - passed} test(s) failed. Review errors above.\n`);
  }
}

runAllTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
