// /api/checkout.js
// Creates a Stripe Checkout Session with exact pricing.
// - Bulk price uses tenth-of-a-cent math (no rounding to $0.07)
// - Shipping (if provided) becomes its own line item named "Shipping"
// - Never throws unhandled errors (returns JSON with details)

export const config = { runtime: 'nodejs' };

import Stripe from 'stripe';
import {
  MIN_UNITS,
  STEP,
  normalizeSizeId,
  bulkTotalCents,
  kitPriceCents,
  kitUnits,
  pickTier,
  bulkProductName,
  kitProductName,
  compactSummaryLines
} from './_lib/products.js';
import { getAvailabilityMap } from './_lib/availability.js';

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

const asJSON = (res, code, obj) => {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj, null, 2));
};

const toStr = (v) => (v ?? '').toString().trim();

// ---------- pricing ----------
const BULK_MIN = MIN_UNITS;
const BULK_STEP = STEP;

function validateItems(items) {
  const lines = [];
  let tests = 0;

  for (const it of Array.isArray(items) ? items : []) {
    if (it && it.type === 'bulk') {
      let u = Number(it.units || 0);
      if (!Number.isFinite(u)) continue;
      u = Math.max(BULK_MIN, Math.round(u / BULK_STEP) * BULK_STEP);
      const sizeId = normalizeSizeId(it.sizeId);
      const existing = lines.find((l) => l.type === 'bulk' && l.sizeId === sizeId);
      if (existing) existing.units += u;
      else lines.push({ type: 'bulk', sizeId, units: u });
    } else if (it && it.type === 'kit') {
      let q = Number(it.qty || 0);
      if (!Number.isFinite(q) || q < 1) q = 1;
      const sizeId = normalizeSizeId(it.sizeId);
      const existing = lines.find((l) => l.type === 'kit' && l.sizeId === sizeId);
      if (existing) existing.qty += q;
      else lines.push({ type: 'kit', sizeId, qty: q });
    } else if (it && it.type === 'test') {
      tests = 1;
    }
  }

  const bulkUnits = lines.filter((l) => l.type === 'bulk').reduce((sum, l) => sum + l.units, 0);
  const kits = lines.filter((l) => l.type === 'kit').reduce((sum, l) => sum + l.qty, 0);
  return { lines, bulkUnits, kits, tests };
}

// ---------- helpers ----------
function safeParseBody(req) {
  let body = {};
  try {
    body = req.body && typeof req.body === 'object'
      ? req.body
      : JSON.parse(req.body || '{}');
  } catch {
    body = {};
  }
  return body;
}

function originBaseUrl(req) {
  // Build absolute URLs for success/cancel
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${proto}://${host}`;
}

// ---------- handler ----------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return asJSON(res, 405, { error: 'Method not allowed' });
  }

  if (!stripe) {
    return asJSON(res, 500, { error: 'Stripe not configured (missing STRIPE_SECRET_KEY).' });
  }

  const body = safeParseBody(req);
  const items = Array.isArray(body.items) ? body.items : [];
  const shipping = body.shipping || null; // { amount, carrier, service, currency }
  const shippingAddress = body.shippingAddress || null; // { name, line1, city, state, postal_code, country }
  const customerEmail = toStr(body.customerEmail);
  const customerPhone = toStr(body.customerPhone);
  const customerName = toStr(body.customerName); // Company name from checkout form
  const contactName = toStr(body.contactName); // Contact person name from checkout form
  const { lines, bulkUnits, kits, tests } = validateItems(items);

  if (!bulkUnits && !kits && !tests) {
    return asJSON(res, 400, { error: 'Cart is empty.' });
  }

  try {
    const availability = await getAvailabilityMap();
    const outOfStock = lines.find((line) => availability[line.sizeId] === false);
    if (outOfStock) {
      return asJSON(res, 400, {
        error: 'size_out_of_stock',
        message: `${bulkProductName(outOfStock.sizeId)} is currently out of stock. Please remove it from your cart.`,
        sizeId: outOfStock.sizeId
      });
    }
  } catch (err) {
    console.error('checkout availability check failed:', err);
  }

  try {
    const line_items = [];

    for (const line of lines) {
      if (line.type === 'bulk') {
        const cents = bulkTotalCents(line.sizeId, line.units);
        if (cents <= 0) {
          return asJSON(res, 400, { error: 'Invalid bulk amount.' });
        }
        const tier = pickTier(line.sizeId, line.units);
        line_items.push({
          price_data: {
            currency: 'usd',
            unit_amount: cents,
            product_data: {
              name: bulkProductName(line.sizeId),
              description: `${line.units.toLocaleString()} units • ${tier.label} • $${tier.unitUSD.toFixed(4)}/unit`,
            },
          },
          quantity: 1,
        });
      } else if (line.type === 'kit') {
        const unitsPerKit = kitUnits(line.sizeId);
        line_items.push({
          price_data: {
            currency: 'usd',
            unit_amount: kitPriceCents(line.sizeId),
            product_data: {
              name: kitProductName(line.sizeId),
              description: `${unitsPerKit} units per kit`,
            },
          },
          quantity: line.qty,
        });
      }
    }

    // Test kit ($1)
    if (tests > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          unit_amount: 100,
          product_data: {
            name: '🧪 Webhook Test Order',
            description: 'Test order for webhook verification',
          },
        },
        quantity: 1,
      });
    }

    // Shipping (optional explicit line item)
    // NOTE: Only add shipping as line item if NO shipping address provided
    // If shipping address exists, we'll use shipping_options instead
    let shipAmountCents = 0;
    if (shipping && Number.isFinite(Number(shipping.amount))) {
      shipAmountCents = Math.max(0, Math.round(Number(shipping.amount) * 100));
      // Only add as line item if no shipping address (to avoid double-charging)
      if (shipAmountCents > 0 && !shippingAddress) {
        line_items.push({
          price_data: {
            currency: (shipping.currency || 'USD').toLowerCase(),
            unit_amount: shipAmountCents,
            product_data: {
              name: 'Shipping',
              description: [shipping.carrier, shipping.service].filter(Boolean).join(' • '),
            },
          },
          quantity: 1,
        });
      }
    }

    const base = originBaseUrl(req);
    const successUrl = `${base}/order-success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${base}/cart.html`;

    // Basic metadata for webhook/email rendering
    const metadata = {
      ship_amount_cents: String(shipAmountCents || 0),
      summary: JSON.stringify({
        bulkUnits,
        kits,
        tests,
        lines: compactSummaryLines(lines)
      }),
      ship_carrier: shipping?.carrier || '',
      ship_service: shipping?.service || '',
      ship_address: shippingAddress ? JSON.stringify(shippingAddress) : '',
      customer_name: customerName || '', // Store company name in metadata
      contact_name: contactName || '', // Store contact person name in metadata
    };

    const sessionOptions = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      // You can enable tax here later if desired:
      // automatic_tax: { enabled: true },
    };

    // Pre-fill customer email and phone if provided
    if (customerEmail) {
      sessionOptions.customer_email = customerEmail;
    }
    if (customerPhone) {
      sessionOptions.phone_number_collection = { enabled: true };
    }

    // Pre-fill shipping address if provided
    if (shippingAddress && shippingAddress.line1) {
      sessionOptions.shipping_address_collection = {
        allowed_countries: ['US', 'CA', 'MX']
      };
      sessionOptions.shipping_options = [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: {
            amount: shipAmountCents,
            currency: 'usd'
          },
          display_name: shipping?.carrier && shipping?.service
            ? `${shipping.carrier} ${shipping.service}`
            : 'Shipping',
        }
      }];
      // Store the address in metadata since we can't pre-fill in checkout
      // The address will be collected fresh by Stripe's form
    }

    const session = await stripe.checkout.sessions.create(sessionOptions);

    return asJSON(res, 200, { url: session.url });
  } catch (err) {
    console.error('checkout error:', err);
    // Return a descriptive error to the client (no 500)
    return asJSON(res, 400, {
      error: 'stripe_checkout_failed',
      message: toStr(err?.message || err),
    });
  }
}
