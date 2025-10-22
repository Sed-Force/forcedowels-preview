// Test TQL 80,000 unit threshold
// Verify TQL is NOT called for orders < 80k and IS called for orders >= 80k
// Run with: node test-tql-threshold.js

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

async function testOrder(units, description) {
  console.log('\n' + '='.repeat(70));
  console.log(`TEST: ${description}`);
  console.log(`Quantity: ${units.toLocaleString()} units`);
  console.log('='.repeat(70));

  const testAddress = {
    name: 'Test Customer',
    street: '123 Main St',
    city: 'Phoenix',
    state: 'AZ',
    postal: '85001',
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

    const data = await response.json();

    if (response.ok) {
      console.log('\n✅ SUCCESS');
      console.log('Recommended Provider:', data.recommendedProvider || 'N/A');
      console.log('Total Quantity:', data.totalQuantity);
      console.log('Rates Found:', data.rates?.length || 0);

      // Check which carriers returned rates
      const carriers = new Set();
      if (data.rates && data.rates.length > 0) {
        data.rates.forEach(rate => carriers.add(rate.carrier));
      }

      console.log('\n📦 CARRIERS USED:');
      if (carriers.size > 0) {
        carriers.forEach(carrier => {
          const carrierRates = data.rates.filter(r => r.carrier === carrier);
          console.log(`  - ${carrier}: ${carrierRates.length} rate(s)`);
        });
      } else {
        console.log('  None');
      }

      // Check package type
      console.log('\n📦 PACKAGE TYPE:');
      if (data.packages?.pallets && data.packages.pallets.length > 0) {
        console.log(`  PALLETS: ${data.packages.pallets.length}`);
        data.packages.pallets.forEach((pallet, i) => {
          console.log(`    Pallet ${i + 1}: ${pallet.weightLb}lb - ${pallet.length}x${pallet.width}x${pallet.height}in`);
        });
      }
      if (data.packages?.parcels && data.packages.parcels.length > 0) {
        console.log(`  PARCELS: ${data.packages.parcels.length}`);
      }

      // Verify TQL usage expectations
      const hasTQL = carriers.has('TQL');
      const shouldHaveTQL = units >= 80000;

      console.log('\n🔍 TQL THRESHOLD CHECK:');
      console.log(`  Order size: ${units.toLocaleString()} units`);
      console.log(`  TQL should be used: ${shouldHaveTQL ? 'YES' : 'NO'}`);
      console.log(`  TQL was used: ${hasTQL ? 'YES' : 'NO'}`);

      if (hasTQL === shouldHaveTQL) {
        console.log(`  ✅ CORRECT: TQL ${hasTQL ? 'was' : 'was not'} used as expected`);
        return { success: true, correct: true, hasTQL, shouldHaveTQL, data };
      } else {
        console.log(`  ❌ ERROR: TQL ${hasTQL ? 'was' : 'was not'} used but ${shouldHaveTQL ? 'should' : 'should not'} have been`);
        return { success: true, correct: false, hasTQL, shouldHaveTQL, data };
      }

    } else {
      console.log('\n❌ REQUEST FAILED');
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
  console.log('\n🧪 TQL 80,000 UNIT THRESHOLD TESTS');
  console.log('Testing that TQL is only used for orders >= 80,000 units\n');

  const tests = [
    { units: 5000, description: 'Small order (5k) - Should use USPS/UPS, NOT TQL' },
    { units: 20000, description: 'Medium order (20k) - Should use UPS, NOT TQL' },
    { units: 40000, description: 'Large order (40k) - Should use UPS, NOT TQL' },
    { units: 79999, description: 'Just below threshold (79,999) - Should use UPS, NOT TQL' },
    { units: 80000, description: 'At threshold (80k) - Should use TQL' },
    { units: 100000, description: 'Above threshold (100k) - Should use TQL' },
    { units: 200000, description: 'Large order (200k) - Should use TQL' }
  ];

  const results = [];

  for (const test of tests) {
    const result = await testOrder(test.units, test.description);
    results.push({ ...test, result });
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));

  let passedCount = 0;
  results.forEach(({ units, description, result }) => {
    const status = result.success && result.correct ? '✅ PASS' : '❌ FAIL';
    console.log(`${units.toLocaleString().padStart(8)} units: ${status} - ${description}`);
    if (result.success && result.correct) passedCount++;
  });

  console.log(`\n🎯 OVERALL: ${passedCount}/${results.length} tests passed`);

  console.log('\n📝 KEY FINDINGS:');
  const belowThreshold = results.filter(r => r.units < 80000);
  const atOrAboveThreshold = results.filter(r => r.units >= 80000);

  const belowWithTQL = belowThreshold.filter(r => r.result.hasTQL).length;
  const aboveWithTQL = atOrAboveThreshold.filter(r => r.result.hasTQL).length;

  console.log(`  Orders < 80k: ${belowWithTQL}/${belowThreshold.length} incorrectly used TQL`);
  console.log(`  Orders >= 80k: ${aboveWithTQL}/${atOrAboveThreshold.length} correctly used TQL`);

  if (passedCount === results.length) {
    console.log('\n🎉 All tests passed! TQL threshold is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Review the threshold logic.');
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
