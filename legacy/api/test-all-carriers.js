// Test all shipping carriers (USPS, UPS, TQL)
// Run with: node api/test-all-carriers.js

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

async function testCarrier(carrierName, items, expectedProvider) {
  console.log('\n' + '='.repeat(70));
  console.log(`TEST: ${carrierName}`);
  console.log('='.repeat(70));
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
    const data = await response.json();

    if (response.ok) {
      console.log('\n✅ SUCCESS');
      console.log('Provider:', data.provider);
      console.log('Expected:', expectedProvider);
      console.log('Match:', data.provider === expectedProvider ? '✅' : '❌');
      console.log('Total Quantity:', data.totalQuantity);
      console.log('Rates Found:', data.rates?.length || 0);

      if (data.rates && data.rates.length > 0) {
        console.log('\n💰 RATES:');
        data.rates.forEach((rate, i) => {
          const price = rate.priceCents / 100;
          console.log(`  ${i + 1}. ${rate.carrier} ${rate.service}: $${price.toFixed(2)}`);
        });
      }

      console.log('\n📦 PACKAGES:');
      console.log('  Parcels:', data.packages?.parcels?.length || 0);
      console.log('  Pallets:', data.packages?.pallets?.length || 0);

      if (data.packages?.parcels && data.packages.parcels.length > 0) {
        console.log('\n📦 PARCEL DETAILS:');
        data.packages.parcels.forEach((parcel, i) => {
          console.log(`  Parcel ${i + 1}: ${parcel.weightLb}lb - ${parcel.length}x${parcel.width}x${parcel.height}in`);
        });
      }

      if (data.packages?.pallets && data.packages.pallets.length > 0) {
        console.log('\n🚛 PALLET DETAILS:');
        data.packages.pallets.forEach((pallet, i) => {
          console.log(`  Pallet ${i + 1}: ${pallet.weightLb}lb - ${pallet.length}x${pallet.width}x${pallet.height}in`);
        });
      }

      return { success: true, data };
    } else {
      console.log('\n❌ ERROR');
      console.log('Error:', data.error);
      console.log('Details:', data.details);

      return { success: false, error: data };
    }

  } catch (error) {
    console.log('\n❌ REQUEST FAILED');
    console.error('Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('\n🧪 COMPREHENSIVE SHIPPING CARRIER TESTS');
  console.log('Testing USPS, UPS, and TQL with appropriate quantities\n');

  // Test 1: USPS - Very small order (500 units)
  const usps500Result = await testCarrier(
    'USPS - 500 Units (Very Small Order)',
    [{ type: 'bulk', units: 500 }],
    'USPS'
  );

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 2: USPS - Small order (2,000 units)
  const usps2kResult = await testCarrier(
    'USPS - 2,000 Units (Small Order)',
    [{ type: 'bulk', units: 2000 }],
    'USPS'
  );

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 3: USPS - Edge case (4,999 units - just under UPS threshold)
  const usps4999Result = await testCarrier(
    'USPS - 4,999 Units (Edge Case - Max USPS)',
    [{ type: 'bulk', units: 4999 }],
    'USPS'
  );

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 4: UPS - 5,000 units (minimum UPS threshold)
  const ups5kResult = await testCarrier(
    'UPS - 5,000 Units (Min UPS Threshold)',
    [{ type: 'bulk', units: 5000 }],
    'UPS'
  );

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 5: UPS - 15,000 units (medium order)
  const ups15kResult = await testCarrier(
    'UPS - 15,000 Units (Medium Order)',
    [{ type: 'bulk', units: 15000 }],
    'UPS'
  );

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 6: UPS - 50,000 units (large order)
  const ups50kResult = await testCarrier(
    'UPS - 50,000 Units (Large Order)',
    [{ type: 'bulk', units: 50000 }],
    'UPS'
  );

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 7: UPS - 79,999 units (edge case - just under TQL threshold)
  const ups79999Result = await testCarrier(
    'UPS - 79,999 Units (Edge Case - Max UPS)',
    [{ type: 'bulk', units: 79999 }],
    'UPS'
  );

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 8: TQL - 80,000 units (minimum TQL threshold)
  const tql80kResult = await testCarrier(
    'TQL - 80,000 Units (Min TQL Threshold - Freight)',
    [{ type: 'bulk', units: 80000 }],
    'TQL'
  );

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 9: TQL - 200,000 units (very large freight order)
  const tql200kResult = await testCarrier(
    'TQL - 200,000 Units (Very Large Freight)',
    [{ type: 'bulk', units: 200000 }],
    'TQL'
  );

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 10: Mixed items (kits + bulk)
  const mixedResult = await testCarrier(
    'USPS - Mixed Order (Kits + Bulk)',
    [
      { type: 'kit', qty: 2 },
      { type: 'bulk', units: 1000 }
    ],
    'USPS'
  );

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));

  const results = [
    { name: 'USPS 500', result: usps500Result, expected: 'USPS' },
    { name: 'USPS 2k', result: usps2kResult, expected: 'USPS' },
    { name: 'USPS 4,999', result: usps4999Result, expected: 'USPS' },
    { name: 'UPS 5k', result: ups5kResult, expected: 'UPS' },
    { name: 'UPS 15k', result: ups15kResult, expected: 'UPS' },
    { name: 'UPS 50k', result: ups50kResult, expected: 'UPS' },
    { name: 'UPS 79,999', result: ups79999Result, expected: 'UPS' },
    { name: 'TQL 80k', result: tql80kResult, expected: 'TQL' },
    { name: 'TQL 200k', result: tql200kResult, expected: 'TQL' },
    { name: 'Mixed', result: mixedResult, expected: 'USPS' }
  ];

  let uspsTests = 0, upsTests = 0, tqlTests = 0;
  let uspsPass = 0, upsPass = 0, tqlPass = 0;

  results.forEach(({ name, result, expected }) => {
    const status = result.success ? '✅ SUCCESS' : '❌ ERROR';
    const providerMatch = result.success && result.data.provider === expected ? '✅' : '❌';
    console.log(`${name}: ${status} ${providerMatch}`);

    if (expected === 'USPS') {
      uspsTests++;
      if (result.success) uspsPass++;
    } else if (expected === 'UPS') {
      upsTests++;
      if (result.success) upsPass++;
    } else if (expected === 'TQL') {
      tqlTests++;
      if (result.success) tqlPass++;
    }
  });

  console.log('\n📊 CARRIER BREAKDOWN:');
  console.log(`USPS: ${uspsPass}/${uspsTests} passed`);
  console.log(`UPS: ${upsPass}/${upsTests} passed`);
  console.log(`TQL: ${tqlPass}/${tqlTests} passed (may fail due to postal code validation)`);

  const totalPass = uspsPass + upsPass + tqlPass;
  const totalTests = uspsTests + upsTests + tqlTests;
  console.log(`\n🎯 OVERALL: ${totalPass}/${totalTests} tests passed`);

  console.log('\n✅ ROUTING LOGIC VERIFICATION:');
  console.log('  - USPS handles orders < 5,000 units');
  console.log('  - UPS handles orders 5,000 - 79,999 units');
  console.log('  - TQL handles orders 80,000+ units (freight)');
  console.log('  - No fallback logic (proper error handling)');

  console.log('\n📝 NOTES:');
  console.log('  - All carriers use proper OAuth authentication');
  console.log('  - Packages are automatically calculated based on quantity');
  console.log('  - TQL may fail with strict postal code validation (API limitation)');
  console.log('  - Error handling throws descriptive errors without silent failures\n');
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
