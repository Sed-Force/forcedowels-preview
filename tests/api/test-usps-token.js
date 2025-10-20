// Test USPS token endpoint (server-side to avoid CORS)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'missing_token',
      description: 'Token is required in request body'
    });
  }

  const rateUrl = 'https://api.usps.com/prices/v3/base-rates/search';
  const shipFromZip = '85296'; // Your Arizona location

  // Test package data
  const testPackage = {
    originZIPCode: shipFromZip,
    destinationZIPCode: '90210', // Beverly Hills, CA
    weight: 80, // 5 lbs in ounces
    length: 12,
    width: 12,
    height: 6,
    mailClass: 'PRIORITY_MAIL',
    processingCategory: 'MACHINABLE',
    destinationEntryFacilityType: 'NONE',
    rateIndicator: 'DR'
  };

  try {
    console.log('Testing USPS token:', token.substring(0, 20) + '...');
    console.log('Test package:', testPackage);

    const response = await fetch(rateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(testPackage)
    });

    const responseText = await response.text();
    console.log('USPS response:', response.status, responseText);

    if (!response.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: 'parse_error', error_description: responseText };
      }

      return res.status(200).json({
        success: false,
        error: errorData.error || 'rate_request_failed',
        description: errorData.error_description || `HTTP ${response.status}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          response: errorData,
          testPackage
        }
      });
    }

    const data = JSON.parse(responseText);
    const rate = data.totalBasePrice || data.price || data.amount;
    
    return res.status(200).json({
      success: true,
      rate: rate || 'No rate found',
      details: data,
      testPackage
    });

  } catch (error) {
    console.error('USPS token test error:', error);
    return res.status(200).json({
      success: false,
      error: 'request_failed',
      description: error.message,
      details: {
        name: error.name,
        testPackage
      }
    });
  }
}
