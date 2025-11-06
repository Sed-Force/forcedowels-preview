// Test endpoint to diagnose webhook initialization error
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    // Test 1: Can we import Stripe?
    const Stripe = (await import('stripe')).default;
    const stripeSecret = process.env.STRIPE_SECRET_KEY;

    // Test 2: Can we instantiate Stripe?
    const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

    // Test 3: Can we import email builders?
    const { buildInternationalOrderConfirmationEmail } = await import('./_lib/email/internationalOrderConfirmation.js');
    const { buildInternationalInternalNotificationHTML } = await import('./_lib/email/internationalInternalNotification.js');

    return res.status(200).json({
      success: true,
      tests: {
        stripe_import: !!Stripe,
        stripe_instance: !!stripe,
        email_builders_imported: !!buildInternationalOrderConfirmationEmail && !!buildInternationalInternalNotificationHTML,
        has_secret: !!stripeSecret
      }
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Initialization test failed',
      message: err.message,
      stack: err.stack
    });
  }
}
