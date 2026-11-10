// Simple USPS OAuth test
// Run with: node api/test-usps-oauth.js

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

async function testUSPSOAuth() {
  const clientId = process.env.USPS_CLIENT_ID;
  const clientSecret = process.env.USPS_CLIENT_SECRET;
  const env = process.env.USPS_ENV;

  console.log('Testing USPS OAuth...');
  console.log('Environment:', env || 'not set (will use test)');
  console.log('Client ID:', clientId?.substring(0, 10) + '...');
  console.log('Client Secret:', clientSecret?.substring(0, 10) + '...');
  console.log('');

  const baseUrl = env === 'production'
    ? 'https://api.usps.com'
    : 'https://api-cat.usps.com';

  console.log('Using URL:', baseUrl);
  console.log('');

  // Test with form-urlencoded (what we're using)
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  console.log('Request body:', params.toString());
  console.log('');

  try {
    const response = await fetch(`${baseUrl}/oauth2/v3/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    const text = await response.text();
    console.log('Response body:', text);

    if (response.ok) {
      console.log('\n✅ SUCCESS! OAuth token obtained.');
      const data = JSON.parse(text);
      console.log('Token starts with:', data.access_token?.substring(0, 20) + '...');
    } else {
      console.log('\n❌ FAILED! OAuth request rejected.');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testUSPSOAuth();
