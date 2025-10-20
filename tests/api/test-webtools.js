// Test USPS WebTools directly
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    console.log('[TEST-WEBTOOLS] Starting test...');
    
    // Check environment variables
    const userId = process.env.USPS_WEBTOOLS_USERID;
    const password = process.env.USPS_WEBTOOLS_PASSWORD;
    
    console.log('[TEST-WEBTOOLS] Environment check:', {
      hasUserId: !!userId,
      hasPassword: !!password,
      userIdLength: userId?.length,
      userId: userId ? `${userId.substring(0, 8)}...` : 'missing'
    });
    
    if (!userId) {
      return res.status(400).json({
        error: 'Missing USPS_WEBTOOLS_USERID environment variable',
        found: {
          USPS_WEBTOOLS_USERID: !!userId,
          USPS_WEBTOOLS_PASSWORD: !!password
        }
      });
    }
    
    // Build test XML request
    const shipFromZip = '85296'; // Gilbert, AZ
    const destZip = '90210'; // Beverly Hills, CA
    const weightOz = 16; // 1 pound
    
    const xml = `<RateV4Request USERID="${userId}">
      <Package ID="1">
        <Service>PRIORITY</Service>
        <ZipOrigination>${shipFromZip}</ZipOrigination>
        <ZipDestination>${destZip}</ZipDestination>
        <Pounds>1</Pounds>
        <Ounces>0</Ounces>
        <Container>VARIABLE</Container>
        <Size>REGULAR</Size>
        <Machinable>true</Machinable>
      </Package>
    </RateV4Request>`;
    
    const query = `API=RateV4&XML=${encodeURIComponent(xml)}`;
    const url = `https://secure.shippingapis.com/ShippingAPI.dll?${query}`;
    
    console.log('[TEST-WEBTOOLS] Request URL:', url.substring(0, 100) + '...');
    console.log('[TEST-WEBTOOLS] XML:', xml);
    
    // Make the request
    const response = await fetch(url, { method: 'GET' });
    const responseText = await response.text();
    
    console.log('[TEST-WEBTOOLS] Response status:', response.status);
    console.log('[TEST-WEBTOOLS] Response text:', responseText);
    
    if (!response.ok) {
      return res.status(200).json({
        success: false,
        error: 'HTTP request failed',
        status: response.status,
        response: responseText,
        requestDetails: {
          url: url.substring(0, 100) + '...',
          xml: xml
        }
      });
    }
    
    // Check for errors in XML
    if (/Error/i.test(responseText)) {
      return res.status(200).json({
        success: false,
        error: 'USPS API returned error',
        response: responseText,
        requestDetails: {
          userId: `${userId.substring(0, 8)}...`,
          shipFromZip,
          destZip
        }
      });
    }
    
    // Extract rates
    const rates = [...responseText.matchAll(/<Rate>([\d.]+)<\/Rate>/g)].map(m => Number(m[1]));
    const services = [...responseText.matchAll(/<MailService>(.*?)<\/MailService>/g)].map(m => m[1]);
    
    console.log('[TEST-WEBTOOLS] Extracted rates:', rates);
    console.log('[TEST-WEBTOOLS] Extracted services:', services);
    
    if (!rates.length) {
      return res.status(200).json({
        success: false,
        error: 'No rates found in response',
        response: responseText,
        parsedData: {
          rates,
          services
        }
      });
    }
    
    // Success
    return res.status(200).json({
      success: true,
      message: 'WebTools working successfully!',
      rates: rates,
      services: services,
      totalRate: rates.reduce((a, b) => a + b, 0),
      response: responseText,
      requestDetails: {
        userId: `${userId.substring(0, 8)}...`,
        shipFromZip,
        destZip,
        weightOz
      }
    });
    
  } catch (error) {
    console.error('[TEST-WEBTOOLS] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
