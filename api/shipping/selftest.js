// /api/shipping/selftest.js
export const config = { runtime: 'nodejs' };

const json = (res, code, data) => {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data, null, 2));
};

export default async function handler(req, res) {
  try {
    const from = {
      name: process.env.SHIP_FROM_NAME,
      street: process.env.SHIP_FROM_STREET,
      city: process.env.SHIP_FROM_CITY,
      state: process.env.SHIP_FROM_STATE,
      postal: process.env.SHIP_FROM_ZIP,
      country: process.env.SHIP_FROM_COUNTRY || 'US',
    };

    const out = {
      env: {
        ups: {
          clientId: !!process.env.UPS_CLIENT_ID,
          clientSecret: !!process.env.UPS_CLIENT_SECRET,
          shipperNumber: !!process.env.UPS_ACCOUNT_NUMBER,
          env: process.env.UPS_ENV || 'missing',
        },
        usps: {
          webtoolsUserId: !!process.env.USPS_WEBTOOLS_USERID,
        },
        tql: {
          clientId: !!process.env.TQL_CLIENT_ID,
          clientSecret: !!process.env.TQL_CLIENT_SECRET,
          username: !!process.env.TQL_USERNAME,
          password: !!process.env.TQL_PASSWORD,
          baseUrl: !!process.env.TQL_BASE_URL,
          testBaseUrl: !!process.env.TQL_TEST_BASE_URL,
        },
        shipFrom: {
          name: !!from.name, street: !!from.street, city: !!from.city,
          state: !!from.state, postal: !!from.postal, country: !!from.country
        }
      },
      ups: { ok: false },
      usps: { ok: false },
      tql: { ok: true, note: 'Placeholder LTL implemented' },
    };

    // ---- UPS: token + simple Ground rate test ----
    if (out.env.ups.clientId && out.env.ups.clientSecret && out.env.ups.shipperNumber) {
      const upsHost = (process.env.UPS_ENV || 'test') === 'prod'
        ? 'https://onlinetools.ups.com'
        : 'https://wwwcie.ups.com';

      // OAuth token
      let tokenResp, tokenData;
      try {
        tokenResp = await fetch(`${upsHost}/security/v1/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-merchant-id': process.env.UPS_ACCOUNT_NUMBER,
            'Authorization': 'Basic ' + Buffer
              .from(`${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`)
              .toString('base64'),
          },
          body: 'grant_type=client_credentials'
        });
        tokenData = await tokenResp.json().catch(() => ({}));
      } catch (e) {
        out.ups.error = `OAuth request failed: ${String(e)}`;
      }

      if (tokenResp?.ok && tokenData?.access_token) {
        out.ups.oauth = 'ok';
        // Build a tiny test: 19 lb, 15x15x12 from your origin to your own ZIP
        const rateBody = {
          RateRequest: {
            Request: { TransactionReference: { CustomerContext: 'FD selftest' } },
            Shipment: {
              Shipper: {
                Name: from.name || 'Shipper',
                ShipperNumber: process.env.UPS_ACCOUNT_NUMBER,
                Address: {
                  AddressLine: from.street || 'Address',
                  City: from.city, StateProvinceCode: from.state,
                  PostalCode: from.postal, CountryCode: from.country || 'US'
                }
              },
              ShipFrom: { Address: { City: from.city, StateProvinceCode: from.state, PostalCode: from.postal, CountryCode: from.country || 'US' } },
              ShipTo:   { Address: { City: from.city, StateProvinceCode: from.state, PostalCode: from.postal, CountryCode: from.country || 'US' } },
              Service: { Code: '03', Description: 'Ground' },
              Package: [{
                PackagingType: { Code: '02' }, // customer supplied
                Dimensions: { UnitOfMeasurement: { Code: 'IN' }, Length: '15', Width: '15', Height: '12' },
                PackageWeight: { UnitOfMeasurement: { Code: 'LBS' }, Weight: '19' }
              }]
            }
          }
        };

        let rateResp, rateJson;
        try {
          rateResp = await fetch(`${upsHost}/api/rating/v2403/Rate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tokenData.access_token}`,
              'transId': `fd-${Date.now()}`,
              'transactionSrc': 'forcedowels'
            },
            body: JSON.stringify(rateBody)
          });
          rateJson = await rateResp.json().catch(() => ({}));
        } catch (e) {
          out.ups.error = `Rate request failed: ${String(e)}`;
        }

        if (rateResp?.ok) {
          out.ups.ok = true;
          out.ups.sample = rateJson?.RateResponse || rateJson;
        } else {
          out.ups.error = rateJson?.response?.errors?.[0]?.message || JSON.stringify(rateJson);
        }
      } else {
        out.ups.error = tokenData?.response?.errors?.[0]?.message || JSON.stringify(tokenData || {});
      }
    } else {
      out.ups.error = 'Missing UPS env vars (CLIENT_ID/SECRET/ACCOUNT_NUMBER).';
    }

    // ---- USPS: WebTools RateV4 test ----
    if (out.env.usps.webtoolsUserId) {
      const userId = process.env.USPS_WEBTOOLS_USERID;
      const xml = `
        <RateV4Request USERID="${userId}">
          <Revision>2</Revision>
          <Package ID="1">
            <Service>PRIORITY</Service>
            <ZipOrigination>${from.postal}</ZipOrigination>
            <ZipDestination>${from.postal}</ZipDestination>
            <Pounds>19</Pounds><Ounces>0</Ounces>
            <Container>VARIABLE</Container>
            <Size>REGULAR</Size>
            <Width>15</Width><Length>15</Length><Height>12</Height>
            <Machinable>true</Machinable>
          </Package>
        </RateV4Request>`.replace(/\s+/g, ' ').trim();

      const url = `https://secure.shippingapis.com/ShippingAPI.dll?API=RateV4&XML=${encodeURIComponent(xml)}`;
      let r, text;
      try { r = await fetch(url); text = await r.text(); }
      catch (e) { out.usps.error = `WebTools fetch failed: ${String(e)}`; }

      if (r?.ok && text && !/Error/i.test(text)) {
        out.usps.ok = true;
        out.usps.sample = text.slice(0, 600); // include snippet
      } else {
        out.usps.error = text || 'No response';
      }
    } else {
      out.usps.error = 'Missing USPS_WEBTOOLS_USERID env var.';
    }

    json(res, 200, out);
  } catch (e) {
    json(res, 500, { error: String(e) });
  }
}

// /api/shipping/selftest.js
export const config = { runtime: 'nodejs' };

const asJSON = (res, code, obj) => {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj, null, 2));
};

export default async function handler(req, res) {
  const ups = {
    clientId:      !!process.env.UPS_CLIENT_ID,
    clientSecret:  !!process.env.UPS_CLIENT_SECRET,
    shipperNumber: !!process.env.UPS_ACCOUNT_NUMBER,
    env:           process.env.UPS_ENV || 'test',
  };
  const usps = {
    webtoolsUserId: !!process.env.USPS_WEBTOOLS_USERID,
  };
  const shipFrom = {
    name: !!process.env.SHIP_FROM_NAME,
    street: !!process.env.SHIP_FROM_STREET,
    city: !!process.env.SHIP_FROM_CITY,
    state: !!process.env.SHIP_FROM_STATE,
    postal: !!process.env.SHIP_FROM_ZIP,
    country: !!process.env.SHIP_FROM_COUNTRY,
  };

  asJSON(res, 200, { ups, usps, shipFrom });
}
