// Test USPS OAuth with Basic Auth
// Run with: node api/test-usps-basic.js

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

async function testUSPSBasicAuth() {
  const clientId = process.env.USPS_CLIENT_ID;
  const clientSecret = process.env.USPS_CLIENT_SECRET;
  const env = process.env.USPS_ENV;

  console.log('Testing USPS OAuth with HTTP Basic Auth...');
  console.log('Environment:', env || 'not set');
  console.log('Client ID:', clientId?.substring(0, 10) + '...');
  console.log('');

  const baseUrl = env === 'production'
    ? 'https://api.usps.com'
    : 'https://api-cat.usps.com';

  console.log('Using URL:', baseUrl);
  console.log('');

  // Method 1: HTTP Basic Auth with credentials in body
  console.log('=== Method 1: Basic Auth Header ===');
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const response = await fetch(`${baseUrl}/oauth2/v3/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials&scope=prices',
    });

    console.log('Response status:', response.status);
    const text = await response.text();
    console.log('Response:', text);

    if (response.ok) {
      console.log('\n✅ SUCCESS with Basic Auth!');
      return;
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n');
}

testUSPSBasicAuth();
