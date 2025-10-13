// Test USPS OAuth token generation
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    console.log('[TEST-OAUTH] Starting test...');
    
    // Check environment variables
    const clientId = process.env.USPS_CONSUMER_KEY;
    const clientSecret = process.env.USPS_CONSUMER_SECRET;
    const tokenUrl = process.env.USPS_PORTAL_TOKEN_URL;

    // Try different possible token URLs
    const possibleTokenUrls = [
      tokenUrl, // Current: https://api.usps.com/oauth2/v3/token
      'https://api.usps.com/oauth2/v1/token',
      'https://api.usps.com/oauth/v1/token',
      'https://api.usps.com/oauth/token',
      'https://api.usps.com/token'
    ].filter(Boolean);
    
    console.log('[TEST-OAUTH] Environment check:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasTokenUrl: !!tokenUrl,
      clientIdLength: clientId?.length,
      tokenUrl: tokenUrl
    });
    
    if (!clientId || !clientSecret || !tokenUrl) {
      return res.status(400).json({
        error: 'Missing environment variables',
        missing: {
          USPS_CONSUMER_KEY: !clientId,
          USPS_CONSUMER_SECRET: !clientSecret,
          USPS_PORTAL_TOKEN_URL: !tokenUrl
        }
      });
    }
    
    // Try multiple OAuth approaches with different URLs
    console.log('[TEST-OAUTH] Attempting OAuth request...');

    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const attempts = [];

    // Try each possible token URL
    for (let i = 0; i < possibleTokenUrls.length; i++) {
      const testTokenUrl = possibleTokenUrls[i];
      console.log(`[TEST-OAUTH] Trying token URL ${i + 1}: ${testTokenUrl}`);

      // Try credentials in body (this got furthest before)
      const testResponse = await fetch(testTokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`
      });

      let testResponseText = await testResponse.text();
      let testResponseData;
      try {
        testResponseData = JSON.parse(testResponseText);
      } catch (e) {
        testResponseData = { raw: testResponseText };
      }

      attempts.push({
        attempt: i + 1,
        method: `Credentials in body - URL: ${testTokenUrl}`,
        status: testResponse.status,
        success: testResponse.ok,
        response: testResponseData
      });

      // If this one worked, use it for the final response
      if (testResponse.ok) {
        return res.status(200).json({
          success: true,
          message: 'OAuth token obtained successfully',
          workingUrl: testTokenUrl,
          attempts: attempts,
          tokenLength: testResponseData.access_token?.length,
          expiresIn: testResponseData.expires_in,
          tokenType: testResponseData.token_type,
          scope: testResponseData.scope,
          response: {
            ...testResponseData,
            access_token: testResponseData.access_token ? `${testResponseData.access_token.substring(0, 10)}...` : null
          }
        });
      }
    }

    // If we get here, none of the URLs worked
    return res.status(200).json({
      success: false,
      error: 'All OAuth URLs and methods failed',
      attempts: attempts,
      testedUrls: possibleTokenUrls,
      recommendation: 'Check your USPS Developer Portal for the correct OAuth endpoint URL'
    });
    
  } catch (error) {
    console.error('[TEST-OAUTH] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
