// /api/debug/env.js
// Returns booleans only (no secrets) so you can verify the server sees your env vars.

export default async function handler(req, res) {
  const mask = (v) => (v ? true : false);

  const out = {
    ups: {
      clientId:       mask(process.env.UPS_CLIENT_ID),
      clientSecret:   mask(process.env.UPS_CLIENT_SECRET),
      shipperNumber:  mask(process.env.UPS_SHIPPER_NUMBER || process.env.UPS_ACCOUNT_NUMBER),
      env:            process.env.UPS_ENV || '(not set)',
    },
    usps: {
      // WebTools uses a single USERID (no secret)
      webtoolsUserId: mask(
        process.env.USPS_WEBTOOLS_USERID ||
        process.env.USPS_USER_ID ||
        process.env.USPS_CLIENT_ID
      ),
    },
    tql: {
      clientId:      mask(process.env.TQL_CLIENT_ID),
      clientSecret:  mask(process.env.TQL_CLIENT_SECRET),
      username:      mask(process.env.TQL_USERNAME),
      password:      mask(process.env.TQL_PASSWORD),
      baseUrl:       mask(process.env.TQL_BASE_URL),
      testBaseUrl:   mask(process.env.TQL_TEST_BASE_URL),
      pubKeyOnClient: mask(process.env.NEXT_PUBLIC_TQL_SUBSCRIPTION_KEY),
    },
    shipFrom: {
      name:    mask(process.env.SHIP_FROM_NAME),
      street:  mask(process.env.SHIP_FROM_STREET),
      city:    mask(process.env.SHIP_FROM_CITY),
      state:   mask(process.env.SHIP_FROM_STATE),
      postal:  mask(process.env.SHIP_FROM_ZIP),
      country: mask(process.env.SHIP_FROM_COUNTRY),
    },
  };

  res.status(200).json(out);
}
