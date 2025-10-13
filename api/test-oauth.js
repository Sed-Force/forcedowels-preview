// Test USPS OAuth token generation
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    console.log('[TEST-OAUTH] Starting test...');
    
    // Check environment variables
    const clientId = process.env.USPS_CONSUMER_KEY;
    const clientSecret = process.env.USPS_CONSUMER_SECRET;
    const tokenUrl = process.env.USPS_PORTAL_TOKEN_URL;
    
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
    
    // Try multiple OAuth approaches
    console.log('[TEST-OAUTH] Attempting OAuth request...');

    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const attempts = [];

    // Attempt 1: Basic auth with scope=prices
    console.log('[TEST-OAUTH] Attempt 1: Basic auth with scope=prices');
    let oauthResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials&scope=prices'
    });

    let responseText = await oauthResponse.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { raw: responseText };
    }

    attempts.push({
      attempt: 1,
      method: 'Basic auth with scope=prices',
      status: oauthResponse.status,
      success: oauthResponse.ok,
      response: responseData
    });

    // If first attempt failed, try without scope
    if (!oauthResponse.ok) {
      console.log('[TEST-OAUTH] Attempt 2: Basic auth without scope');
      oauthResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: 'grant_type=client_credentials'
      });

      responseText = await oauthResponse.text();
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = { raw: responseText };
      }

      attempts.push({
        attempt: 2,
        method: 'Basic auth without scope',
        status: oauthResponse.status,
        success: oauthResponse.ok,
        response: responseData
      });
    }

    // If still failed, try credentials in body
    if (!oauthResponse.ok) {
      console.log('[TEST-OAUTH] Attempt 3: Credentials in body');
      oauthResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`
      });

      responseText = await oauthResponse.text();
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = { raw: responseText };
      }

      attempts.push({
        attempt: 3,
        method: 'Credentials in body',
        status: oauthResponse.status,
        success: oauthResponse.ok,
        response: responseData
      });
    }

    if (!oauthResponse.ok) {
      return res.status(200).json({
        success: false,
        error: 'All OAuth attempts failed',
        attempts: attempts,
        finalStatus: oauthResponse.status,
        finalResponse: responseData
      });
    }
    
    // Success
    return res.status(200).json({
      success: true,
      message: 'OAuth token obtained successfully',
      attempts: attempts,
      successfulAttempt: attempts.find(a => a.success),
      tokenLength: responseData.access_token?.length,
      expiresIn: responseData.expires_in,
      tokenType: responseData.token_type,
      scope: responseData.scope,
      // Don't return the actual token for security
      response: {
        ...responseData,
        access_token: responseData.access_token ? `${responseData.access_token.substring(0, 10)}...` : null
      }
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
