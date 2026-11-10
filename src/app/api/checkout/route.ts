import type Stripe from 'stripe';
import {
  MIN_UNITS, STEP,
  bulkProductName, bulkTotalCents, compactSummaryLines, kitPriceCents, kitProductName, kitUnits,
  normalizeSizeId, pickTier,
  type OrderLine,
} from '@/lib/products';
import { getAvailabilityMap } from '@/server/availability';
import { errorMessage, jsonError, readJson, siteBaseUrl, toStr } from '@/server/http';
import { getStripe } from '@/server/stripe';

interface CheckoutBody {
  items?: Array<{ type?: string; sizeId?: string; units?: number; qty?: number }>;
  shipping?: { amount?: number; carrier?: string; service?: string; currency?: string } | null;
  shippingAddress?: { name?: string; line1?: string } | null;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  contactName?: string;
}

/** Validate and merge raw cart items into canonical order lines. */
function validateItems(items: CheckoutBody['items']) {
  const lines: OrderLine[] = [];
  let tests = 0;

  for (const item of Array.isArray(items) ? items : []) {
    if (item?.type === 'bulk') {
      let units = Number(item.units || 0);
      if (!Number.isFinite(units)) continue;
      units = Math.max(MIN_UNITS, Math.round(units / STEP) * STEP);
      const sizeId = normalizeSizeId(item.sizeId);
      const existing = lines.find((l) => l.type === 'bulk' && l.sizeId === sizeId);
      if (existing && existing.type === 'bulk') existing.units += units;
      else lines.push({ type: 'bulk', sizeId, units });
    } else if (item?.type === 'kit') {
      let qty = Number(item.qty || 0);
      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      const sizeId = normalizeSizeId(item.sizeId);
      const existing = lines.find((l) => l.type === 'kit' && l.sizeId === sizeId);
      if (existing && existing.type === 'kit') existing.qty += qty;
      else lines.push({ type: 'kit', sizeId, qty });
    } else if (item?.type === 'test') {
      tests = 1;
    }
  }

  const bulkUnits = lines.reduce((sum, l) => (l.type === 'bulk' ? sum + l.units : sum), 0);
  const kits = lines.reduce((sum, l) => (l.type === 'kit' ? sum + l.qty : sum), 0);
  return { lines, bulkUnits, kits, tests };
}

/** Creates a Stripe Checkout Session with exact (tenth-of-a-cent) pricing. */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) return jsonError(500, 'Stripe not configured (missing STRIPE_SECRET_KEY).');

  const body = (await readJson<CheckoutBody>(request)) ?? {};
  const shipping = body.shipping || null;
  const shippingAddress = body.shippingAddress || null;
  const customerEmail = toStr(body.customerEmail);
  const customerPhone = toStr(body.customerPhone);
  const customerName = toStr(body.customerName);
  const contactName = toStr(body.contactName);
  const { lines, bulkUnits, kits, tests } = validateItems(body.items);

  if (!bulkUnits && !kits && !tests) return jsonError(400, 'Cart is empty.');

  try {
    const availability = await getAvailabilityMap();
    const outOfStock = lines.find((line) => availability[line.sizeId] === false);
    if (outOfStock) {
      return jsonError(400, 'size_out_of_stock', {
        message: `${bulkProductName(outOfStock.sizeId)} is currently out of stock. Please remove it from your cart.`,
        sizeId: outOfStock.sizeId,
      });
    }
  } catch (err) {
    console.error('checkout availability check failed:', err);
  }

  try {
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const line of lines) {
      if (line.type === 'bulk') {
        const cents = bulkTotalCents(line.sizeId, line.units);
        if (cents <= 0) return jsonError(400, 'Invalid bulk amount.');
        const tier = pickTier(line.sizeId, line.units);
        lineItems.push({
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
      } else {
        lineItems.push({
          price_data: {
            currency: 'usd',
            unit_amount: kitPriceCents(line.sizeId),
            product_data: {
              name: kitProductName(line.sizeId),
              description: `${kitUnits(line.sizeId)} units per kit`,
            },
          },
          quantity: line.qty,
        });
      }
    }

    if (tests > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: 100,
          product_data: { name: '🧪 Webhook Test Order', description: 'Test order for webhook verification' },
        },
        quantity: 1,
      });
    }

    // Without a shipping address the rate is billed as a line item; with one it
    // becomes a Stripe shipping option (never both, to avoid double charging).
    let shipAmountCents = 0;
    if (shipping && Number.isFinite(Number(shipping.amount))) {
      shipAmountCents = Math.max(0, Math.round(Number(shipping.amount) * 100));
      if (shipAmountCents > 0 && !shippingAddress) {
        lineItems.push({
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

    const base = siteBaseUrl(request);
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      allowed_payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${base}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/cart`,
      metadata: {
        ship_amount_cents: String(shipAmountCents || 0),
        summary: JSON.stringify({ bulkUnits, kits, tests, lines: compactSummaryLines(lines) }),
        ship_carrier: shipping?.carrier || '',
        ship_service: shipping?.service || '',
        ship_address: shippingAddress ? JSON.stringify(shippingAddress) : '',
        customer_name: customerName,
        contact_name: contactName,
      },
    };

    if (customerEmail) params.customer_email = customerEmail;
    if (customerPhone) params.phone_number_collection = { enabled: true };

    if (shippingAddress?.line1) {
      params.shipping_address_collection = { allowed_countries: ['US', 'CA', 'MX'] };
      params.shipping_options = [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shipAmountCents, currency: 'usd' },
          display_name: shipping?.carrier && shipping?.service
            ? `${shipping.carrier} ${shipping.service}`
            : 'Shipping',
        },
      }];
    }

    const session = await stripe.checkout.sessions.create(params);
    return Response.json({ url: session.url });
  } catch (err) {
    console.error('checkout error:', err);
    return jsonError(400, 'stripe_checkout_failed', { message: errorMessage(err) });
  }
}
