// Test TQL shipping carrier only
// Run with: node test-tql-only.js

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = resolve(__dirname, '.env.local');
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

async function testTQL(units, city, state, postal) {
  console.log('\n' + '='.repeat(70));
  console.log(`TQL TEST: ${units.toLocaleString()} units`);
  console.log(`Destination: ${city}, ${state} ${postal}`);
  console.log('='.repeat(70));

  const testAddress = {
    name: 'Test Customer',
    street: '123 Main St',
    city,
    state,
    postal,
    country: 'US'
  };

  try {
    const response = await fetch('http://localhost:3000/api/shipping/rates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: testAddress,
        items: [{ type: 'bulk', units }]
      }),
    });

    console.log('Response Status:', response.status);
    const data = await response.json();

    if (response.ok) {
      console.log('\n✅ SUCCESS');
      console.log('Provider:', data.provider);
      console.log('Total Quantity:', data.totalQuantity);
      console.log('Rates Found:', data.rates?.length || 0);

      if (data.rates && data.rates.length > 0) {
        console.log('\n💰 RATES:');
        data.rates.forEach((rate, i) => {
          const price = rate.priceCents / 100;
          console.log(`  ${i + 1}. ${rate.carrier} ${rate.service}: $${price.toFixed(2)}`);
          if (rate.estimatedDays) {
            console.log(`     Estimated delivery: ${rate.estimatedDays} days`);
          }
        });
      }

      console.log('\n🚛 PALLET DETAILS:');
      if (data.packages?.pallets && data.packages.pallets.length > 0) {
        data.packages.pallets.forEach((pallet, i) => {
          console.log(`  Pallet ${i + 1}: ${pallet.weightLb}lb - ${pallet.length}x${pallet.width}x${pallet.height}in`);
        });
      } else {
        console.log('  No pallet information available');
      }

      return { success: true, data };
    } else {
      console.log('\n❌ ERROR');
      console.log('Error:', data.error);
      console.log('Details:', JSON.stringify(data.details, null, 2));

      return { success: false, error: data };
    }

  } catch (error) {
    console.log('\n❌ REQUEST FAILED');
    console.error('Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('\n🧪 TQL FREIGHT CARRIER TESTS');
  console.log('Testing TQL with large orders (80,000+ units)\n');

  // Test 1: 80,000 units - Minimum TQL threshold (Los Angeles)
  const test1 = await testTQL(80000, 'Los Angeles', 'CA', '90001');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: 150,000 units - Large freight order (New York)
  const test2 = await testTQL(150000, 'New York', 'NY', '10001');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 3: 200,000 units - Very large freight (Chicago)
  const test3 = await testTQL(200000, 'Chicago', 'IL', '60601');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 4: 500,000 units - Maximum order (Houston)
  const test4 = await testTQL(500000, 'Houston', 'TX', '77001');

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));

  const results = [
    { name: 'TQL 80k (LA)', result: test1 },
    { name: 'TQL 150k (NYC)', result: test2 },
    { name: 'TQL 200k (Chicago)', result: test3 },
    { name: 'TQL 500k (Houston)', result: test4 }
  ];

  let passed = 0;
  results.forEach(({ name, result }) => {
    const status = result.success ? '✅ SUCCESS' : '❌ ERROR';
    const rateCount = result.success ? `(${result.data?.rates?.length || 0} rates)` : '';
    console.log(`${name}: ${status} ${rateCount}`);
    if (result.success) passed++;
  });

  console.log(`\n🎯 OVERALL: ${passed}/${results.length} tests passed`);

  console.log('\n📝 TQL CARRIER INFO:');
  console.log('  - Handles orders 80,000+ units (freight/LTL)');
  console.log('  - Uses OAuth authentication');
  console.log('  - Returns real-time freight quotes');
  console.log('  - May have strict postal code validation');
  console.log('  - Automatically calculates pallet quantities\n');
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
