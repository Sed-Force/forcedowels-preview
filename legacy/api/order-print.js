// /api/order-print.js
// Renders the domestic "New Order Received" notification for a Stripe Checkout
// session as a standalone A4 print view. The Download PDF button in the team
// notification email links here; the page opens the browser's print dialog so
// the recipient can save it as a PDF.
export const config = { runtime: 'nodejs' };

import Stripe from 'stripe';
import { buildInternalNotificationHTML } from './_lib/email/internalNotification.js';
import { deriveNotificationContext } from './_lib/email/orderContext.js';

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

// Wrap a rendered notification email in an A4 print view: forced page size,
// a floating Download button, and an auto-triggered print dialog.
export function toPrintDocument(emailHtml) {
  return emailHtml
    .replace('</head>', `${PRINT_HEAD}\n</head>`)
    .replace(/(<body[^>]*>)/, `$1\n${PRINT_TOOLBAR}`);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const sessionId = req.query.session || req.query.session_id;
    if (!sessionId) return res.status(400).send('Missing session parameter');

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(500).send('Missing STRIPE_SECRET_KEY');

    const stripe = new Stripe(key, { apiVersion: '2024-06-20' });

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });
    } catch (err) {
      console.error('[order-print] Stripe retrieve failed:', err?.message || err);
      return res.status(404).send('Order not found');
    }

    const ctx = deriveNotificationContext(session, session.line_items?.data || []);
    const invoiceNumber = session.metadata?.invoice_number || '';

    const email = buildInternalNotificationHTML({
      invoiceNumber,
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
      showDownloadButton: false
    });

    const html = toPrintDocument(email);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html);
  } catch (err) {
    console.error('[order-print] Error:', err);
    return res.status(500).send('Unable to render order.');
  }
}
