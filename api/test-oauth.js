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
    
    // Try to get OAuth token
    console.log('[TEST-OAUTH] Attempting OAuth request...');
    
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const oauthResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials&scope=prices'
    });
    
    console.log('[TEST-OAUTH] OAuth response status:', oauthResponse.status);
    
    const responseText = await oauthResponse.text();
    console.log('[TEST-OAUTH] OAuth response text:', responseText);
    
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { raw: responseText };
    }
    
    if (!oauthResponse.ok) {
      return res.status(200).json({
        success: false,
        error: 'OAuth request failed',
        status: oauthResponse.status,
        response: responseData,
        requestDetails: {
          url: tokenUrl,
          method: 'POST',
          headers: {
            'Authorization': `Basic ${authString.substring(0, 20)}...`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'grant_type=client_credentials&scope=prices'
        }
      });
    }
    
    // Success
    return res.status(200).json({
      success: true,
      message: 'OAuth token obtained successfully',
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
