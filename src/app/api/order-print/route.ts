import { buildInternalNotificationHTML } from '@/server/email/internalNotification';
import { deriveNotificationContext } from '@/server/email/orderContext';
import { errorMessage } from '@/server/http';
import { getStripe } from '@/server/stripe';

const PRINT_HEAD = `
  <style>
    @page { size: A4; margin: 12mm; }
    @media print { .op-toolbar { display: none !important; } }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>`;

const PRINT_TOOLBAR = `
  <div class="op-toolbar" style="position:fixed;top:16px;right:16px;z-index:2147483647;">
    <button type="button" onclick="window.print()"
      style="background:#1C4A99;color:#fff;border:0;border-radius:6px;padding:10px 20px;font:600 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);">
      Download PDF
    </button>
  </div>
  <script>
    window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });
  </script>`;

/** Wrap a rendered notification e-mail in an A4 print view with an auto-print dialog. */
function toPrintDocument(emailHtml: string) {
  return emailHtml
    .replace('</head>', `${PRINT_HEAD}\n</head>`)
    .replace(/(<body[^>]*>)/, `$1\n${PRINT_TOOLBAR}`);
}

const textResponse = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...extra } });

/** Standalone print view of the "New Order Received" notification for a Stripe session. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sessionId = params.get('session') || params.get('session_id');
  if (!sessionId) return textResponse('Missing session parameter', 400);

  const stripe = getStripe();
  if (!stripe) return textResponse('Missing STRIPE_SECRET_KEY', 500);

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });
  } catch (err) {
    console.error('[order-print] Stripe retrieve failed:', errorMessage(err));
    return textResponse('Order not found', 404);
  }

  try {
    const ctx = deriveNotificationContext(session, session.line_items?.data || []);
    const email = buildInternalNotificationHTML({
      invoiceNumber: session.metadata?.invoice_number || '',
      customerName: ctx.customerName || ctx.contactName || ctx.customerEmail,
      customerEmail: ctx.customerEmail,
      customerPhone: ctx.customerPhone,
      orderDate: ctx.orderDate,
      sessionId: ctx.sessionId,
      subtotalCents: ctx.subtotalCents,
      shippingCents: ctx.shippingCents,
      taxCents: ctx.taxCents,
      totalCents: ctx.totalCents,
      metaSummary: ctx.metaSummary,
      shippingMethod: ctx.shippingMethod,
      shippingAddress: ctx.shippingAddress,
      billingAddress: ctx.billingAddress,
      isTest: ctx.isTest,
      showDownloadButton: false,
    });

    return new Response(toPrintDocument(email), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[order-print] Error:', err);
    return textResponse('Unable to render order.', 500);
  }
}
