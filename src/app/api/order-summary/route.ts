import { errorMessage, jsonError } from '@/server/http';
import { getStripe } from '@/server/stripe';

const formatAmount = (cents = 0, currency = 'usd') =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase() });

const shortId = (sessionId = '') =>
  sessionId.replace('cs_test_', '').replace('cs_live_', '').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();

/** Order confirmation data for the success page, read from the Stripe session. */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId) return jsonError(400, 'Missing session_id');

  const stripe = getStripe();
  if (!stripe) return jsonError(500, 'Missing STRIPE_SECRET_KEY env var');

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items.data.price.product'],
    });
    const currency = session.currency || 'usd';

    const items = (session.line_items?.data || []).map((li) => {
      const product = li.price?.product && typeof li.price.product === 'object' && !('deleted' in li.price.product)
        ? li.price.product
        : null;
      return {
        name: li.description || product?.name || li.price?.nickname || 'Item',
        desc: product?.description || '',
        qty: li.quantity || 1,
        total: formatAmount(li.amount_total ?? li.amount_subtotal ?? 0, currency),
      };
    });

    return Response.json({
      id: session.id,
      short_id: shortId(session.id),
      payment_status: session.payment_status,
      amount_formatted: formatAmount(session.amount_total ?? 0, currency),
      customer_email: session.customer_details?.email || session.customer_email || '',
      items,
    });
  } catch (err) {
    console.error('ORDER_SUMMARY_ERROR', errorMessage(err));
    return jsonError(500, 'Unable to load order summary.');
  }
}
