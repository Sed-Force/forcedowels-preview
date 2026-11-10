import type Stripe from 'stripe';
import {
  bulkProductName, bulkTotalCents, compactSummaryLines, kitPriceCents, kitProductName, kitUnits,
  normalizeSizeId, pickTier, sizeLabel, type OrderLine,
} from '@/lib/products';
import { verifyAuth } from '@/server/auth';
import { getAvailabilityMap } from '@/server/availability';
import { buildEmailHtml } from '@/server/email/internationalRequest';
import { emailBranding, getResend, parseList, subjectPrefix } from '@/server/email';
import { errorMessage, jsonError, readJson, siteBaseUrl } from '@/server/http';
import { getStripe } from '@/server/stripe';

interface InternationalOrderBody {
  action?: 'request' | 'reserve';
  order_type?: 'kit' | 'bulk';
  quantity?: number;
  units?: number;
  display?: string;
  business_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  shipping_address?: string;
  tax_id?: string;
  comments?: string;
  size?: string;
  shipping_label?: { filename?: string; content?: string; type?: string };
}

/** Create a Stripe checkout that reserves stock while shipping is quoted by hand. */
async function createReservation(request: Request, body: InternationalOrderBody) {
  const stripe = getStripe();
  if (!stripe) return jsonError(500, 'Stripe not configured (missing STRIPE_SECRET_KEY).');

  const { order_type, units, business_name, contact_name, email, phone, shipping_address, tax_id } = body;
  const quantity = Number(body.quantity);
  const sizeId = normalizeSizeId(body.size);
  const line: OrderLine = order_type === 'bulk'
    ? { type: 'bulk', sizeId, units: quantity }
    : { type: 'kit', sizeId, qty: quantity };

  let lineItem: Stripe.Checkout.SessionCreateParams.LineItem;
  if (line.type === 'bulk') {
    const cents = bulkTotalCents(sizeId, line.units);
    if (cents <= 0) return jsonError(400, 'Invalid bulk amount');
    lineItem = {
      price_data: {
        currency: 'usd',
        unit_amount: cents,
        product_data: {
          name: `${bulkProductName(sizeId)} (International Order)`,
          description: `${sizeLabel(sizeId)} • ${pickTier(sizeId, line.units).label} • ${line.units.toLocaleString()} units • Awaiting shipping quote`,
        },
      },
      quantity: 1,
    };
  } else {
    lineItem = {
      price_data: {
        currency: 'usd',
        unit_amount: kitPriceCents(sizeId),
        product_data: {
          name: `${kitProductName(sizeId)} (International Order)`,
          description: `${kitUnits(sizeId)} units per kit • Awaiting shipping quote`,
        },
      },
      quantity: line.qty,
    };
  }

  try {
    const base = siteBaseUrl(request);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      allowed_payment_method_types: ['card'],
      line_items: [lineItem],
      success_url: `${base}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/order`,
      customer_email: email,
      phone_number_collection: { enabled: true },
      metadata: {
        international_order: 'true',
        business_name: business_name ?? '',
        contact_name: contact_name ?? '',
        customer_name: business_name ?? '',
        phone: phone ?? '',
        tax_id: tax_id ?? '',
        quantity_selection: String(quantity),
        ship_address: JSON.stringify({
          name: contact_name, line1: shipping_address, city: '', state: '', postal_code: '', country: 'International',
        }),
        awaiting_shipping_quote: 'true',
        summary: JSON.stringify({
          bulkUnits: line.type === 'bulk' ? line.units : 0,
          kits: line.type === 'kit' ? line.qty : 0,
          tests: 0,
          lines: compactSummaryLines([line]),
        }),
        units: String(units || quantity),
        order_type: order_type ?? '',
      },
    });
    return Response.json({
      ok: true,
      checkoutUrl: session.url,
      status: 'checkout_created',
      note: 'Redirecting to Stripe checkout for payment...',
    });
  } catch (err) {
    console.error('[International Order] Stripe error:', err);
    return jsonError(500, 'Failed to create checkout session', {
      detail: errorMessage(err),
      note: 'Please try again or contact us directly at info@forcedowels.com',
    });
  }
}

export async function POST(request: Request) {
  const body = await readJson<InternationalOrderBody>(request);
  if (!body) return jsonError(400, 'Invalid JSON body');

  const {
    action, order_type, quantity, display, business_name, contact_name,
    email, phone, shipping_address, tax_id, comments, shipping_label,
  } = body;

  if (!action || !order_type || !quantity || !business_name || !contact_name || !email || !phone || !shipping_address || !tax_id) {
    return jsonError(400, 'Missing required fields');
  }
  if (action !== 'request' && action !== 'reserve') {
    return jsonError(400, 'Invalid action. Must be "request" or "reserve"');
  }

  const sizeId = normalizeSizeId(body.size);
  try {
    const availability = await getAvailabilityMap();
    if (availability[sizeId] === false) {
      return jsonError(400, 'size_out_of_stock', {
        message: `${sizeLabel(sizeId)} is currently out of stock. Please choose another size.`,
      });
    }
  } catch (err) {
    console.error('international-order availability check failed:', err);
  }

  if ((process.env.EMAIL_SEND_MODE || 'send').toLowerCase() === 'disabled') {
    return Response.json({ ok: true, mode: 'disabled', note: 'Email sending disabled in this environment.' });
  }
  const resend = getResend();
  if (!resend) {
    return jsonError(501, 'Email service not configured', { hint: 'Set RESEND_API_KEY and EMAIL_FROM' });
  }
  if (!process.env.EMAIL_FROM) return jsonError(501, 'Missing EMAIL_FROM');

  // Paid reservations are confirmed by the Stripe webhook after payment.
  if (action === 'reserve') return createReservation(request, body);

  const identity = await verifyAuth(request);
  const { blue, logoUrl, logoHeight } = emailBranding();
  const quantityDisplay = display || `${quantity} ${order_type === 'kit' ? 'kit(s)' : 'units'} — ${sizeLabel(sizeId)}`;

  const html = buildEmailHtml({
    action: 'request',
    quantity_display: quantityDisplay,
    business_name, contact_name, email, phone, shipping_address, tax_id, comments,
    identityEmail: identity?.email ?? null,
    identityId: identity?.userId ?? null,
    BRAND_BLUE: blue,
    LOGO_URL: logoUrl,
    LOGO_HEIGHT: logoHeight,
  });

  const text = [
    'International Order Request',
    '',
    `Quantity: ${quantityDisplay}`,
    `Business: ${business_name}`,
    `Contact: ${contact_name}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    '',
    'Shipping Address:',
    shipping_address,
    '',
    `Tax ID: ${tax_id}`,
    comments ? `\nComments: ${comments}` : null,
    '',
    identity?.email ? `Signed-in: ${identity.email}` : null,
  ].filter((line) => line !== null).join('\n');

  const attachments: Array<{ filename: string; content: string }> = [];
  const label = shipping_label?.content?.match(/^data:([^;]+);base64,(.+)$/);
  if (label) attachments.push({ filename: shipping_label?.filename || 'shipping-label.pdf', content: label[2] });

  const recipients = parseList(process.env.CONTACT_INBOX || 'info@forcedowels.com');
  const [primary, ...bcc] = recipients;

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: primary,
    bcc,
    subject: `${subjectPrefix()}International Order Request - ${business_name}`,
    html,
    text,
    replyTo: email,
    ...(attachments.length ? { attachments } : {}),
  });

  if (error) {
    console.error('[International Order] Email error:', error);
    return jsonError(502, 'Email send failed', { detail: error.message });
  }
  return Response.json({ ok: true, emailSent: true, emailId: data?.id ?? null, status: 'requested' });
}
