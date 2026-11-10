// /api/shipping/selftest.js
import { getUspsRates } from './shipping/quote.js'; // or adjust import if placed elsewhere

export default async function handler(req, res) {
  try {
    const mask = (s) => (s ? `${s.slice(0,3)}…${s.slice(-3)}` : '(none)');
    const userId =
      (process.env.USPS_WEBTOOLS_USERID ||
        process.env.USPS_WEBTOOLS_ID ||
        process.env.USPS_USERID ||
        process.env.usps_webtools_id ||
        process.env.USPS_CLIENT_ID ||
        process.env.usps_client_id ||
        '')
        .trim();

    const shipFrom = {
      postal: process.env.SHIP_FROM_POSTAL || '85296',
      state:  process.env.SHIP_FROM_STATE  || 'AZ',
      city:   process.env.SHIP_FROM_CITY   || 'Gilbert',
    };

    const destination = { country: 'US', postal: '10001' }; // NYC test
    const pkgPlan = [{ ounces: 16, size: 'REGULAR', width: 12, length: 12, height: 2 }];

    let usps;
    try {
      const rates = await getUspsRates({ shipFrom, destination, pkgPlan });
      usps = { status: 'available', count: rates.length, sample: rates[0] || null };
    } catch (e) {
      usps = { status: 'unavailable', error: String(e.message || e) };
    }

    res.status(200).json({
      envCheck: {
        USPS_WEBTOOLS_USERID_present: Boolean(userId),
        USPS_WEBTOOLS_USERID_masked: mask(userId),
      },
      shipFrom,
      destination,
      usps,
      note: "If USPS shows 'Authorization failure', your USERID likely isn't enabled for PRODUCTION. Email uspstechsupport@usps.com to enable RateV4 for your USERID."
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
