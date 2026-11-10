// Test USPS OAuth with JSON body (correct format)
// Run with: node api/test-usps-json.js

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

async function testUSPSJSON() {
  const clientId = process.env.USPS_CLIENT_ID;
  const clientSecret = process.env.USPS_CLIENT_SECRET;

  console.log('Testing USPS OAuth with JSON body...');
  console.log('Client ID:', clientId?.substring(0, 10) + '...');
  console.log('');

  // Use the correct endpoint with 's' in apis
  const baseUrl = 'https://apis.usps.com';
  console.log('Using URL:', baseUrl);
  console.log('');

  const body = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials'
  };

  console.log('Request body:', JSON.stringify(body, null, 2));
  console.log('');

  try {
    const response = await fetch(`${baseUrl}/oauth2/v3/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('Response status:', response.status);
    const text = await response.text();
    console.log('Response:', text);

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

testUSPSJSON();
