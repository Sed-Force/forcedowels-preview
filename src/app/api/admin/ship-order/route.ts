import { sql } from '@/server/db';
import { requireAdmin } from '@/server/adminGuard';
import { type Row } from '@/server/dbRows';
import { emailBranding, escapeHtml, getResend } from '@/server/email';
import { errorMessage, jsonError, readJson } from '@/server/http';
import { getStripe } from '@/server/stripe';

const TRACKING_URLS: Record<string, (n: string) => string> = {
  UPS: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  USPS: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
};

function buildShippingEmail(opts: { customerName: string; orderNumber: string; carrier: string; trackingNumber: string | null }) {
  const { blue, logoUrl } = emailBranding();
  const esc = escapeHtml;
  const carrier = esc(opts.carrier);
  const tracking = opts.trackingNumber && opts.trackingNumber !== 'N/A' ? opts.trackingNumber : null;
  const link = tracking ? TRACKING_URLS[opts.carrier]?.(tracking) : null;

  const section = tracking
    ? `<tr><td style="padding:24px;">
        <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid ${blue};padding-bottom:8px;">Tracking Information</h3>
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:120px;"><strong>Carrier:</strong></td><td style="padding:8px 0;color:#111827;font-size:14px;">${carrier}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Tracking #:</strong></td><td style="padding:8px 0;color:#111827;font-size:14px;font-family:monospace;">${esc(tracking)}</td></tr>
          ${link ? `<tr><td colspan="2" style="padding:16px 0 0;"><a href="${link}" style="display:inline-block;background:${blue};color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">Track Your Package</a></td></tr>` : ''}
        </table></td></tr>`
    : `<tr><td style="padding:24px;">
        <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid ${blue};padding-bottom:8px;">Shipping Information</h3>
        <p style="color:#111827;font-size:14px;line-height:1.6;margin:0;">Your order is being shipped via <strong>${carrier}</strong>. You will receive tracking information once your shipment is in transit.</p>
      </td></tr>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your Order Has Shipped</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;">
<table role="presentation" style="width:100%;border-collapse:collapse;background:#f3f4f6;"><tr><td style="padding:40px 20px;">
<table role="presentation" style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
<tr><td style="background:${blue};padding:24px;text-align:center;"><img src="${logoUrl}" alt="Force Dowels" style="height:48px;"></td></tr>
<tr><td style="padding:32px 24px;">
<h1 style="margin:0 0 16px;color:#111827;font-size:24px;font-weight:700;">Your Order Has Shipped! 📦</h1>
<p style="margin:0 0 24px;color:#6b7280;font-size:16px;line-height:1.6;">Hi ${esc(opts.customerName || 'there')},</p>
<p style="margin:0 0 24px;color:#111827;font-size:16px;line-height:1.6;">Great news! Your Force Dowels order <strong>${esc(opts.orderNumber)}</strong> has been shipped and is on its way to you.</p>
<p style="margin:0;color:#111827;font-size:16px;line-height:1.6;">Thank you for choosing Force Dowels. We appreciate your business and hope you love your order!</p>
</td></tr>
${section}
<tr><td style="padding:24px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
<p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Questions? Contact us at <a href="mailto:info@forcedowels.com" style="color:${blue};text-decoration:none;">info@forcedowels.com</a></p>
<p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} Force Dowels. All rights reserved.</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** Mark an order shipped, store tracking info, and notify the customer. */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!sql) return jsonError(500, 'Database not configured');

  const body = await readJson<{ session_id?: string; carrier?: string; tracking_number?: string; invoice_number?: number }>(request);
  if (!body?.carrier) return jsonError(400, 'Missing carrier');
  if (!body.invoice_number) return jsonError(400, 'Missing invoice_number');
  const { carrier, tracking_number: trackingNumber = '', invoice_number: invoiceNumber, session_id: sessionId } = body;

  try {
    const rows = (await sql`
      UPDATE orders
      SET status = 'shipped', tracking_number = ${trackingNumber}, carrier = ${carrier},
          shipped_date = CURRENT_DATE, updated_at = NOW()
      WHERE invoice_number = ${invoiceNumber}
      RETURNING customer_email, customer_name, invoice_number
    `) as Row[];
    if (rows.length === 0) return jsonError(404, 'Order not found');
    const { customer_email: customerEmail, customer_name: customerName } = rows[0];

    // Best effort: mirror shipping status onto the Stripe session.
    const stripe = getStripe();
    if (stripe && sessionId && /^cs_/.test(sessionId)) {
      try {
        await stripe.checkout.sessions.update(sessionId, {
          metadata: { shipping_status: 'shipped', carrier, tracking_number: trackingNumber, shipped_at: new Date().toISOString() },
        });
      } catch (err) {
        console.warn('Stripe session could not be updated:', errorMessage(err));
      }
    }

    if (!customerEmail) return jsonError(400, 'No customer email found for this order');
    const resend = getResend();
    if (!resend) return jsonError(501, 'Order marked shipped, but e-mail is not configured (RESEND_API_KEY).');

    const orderNumber = `#${rows[0].invoice_number}`;
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'info@forcedowels.com',
      to: customerEmail,
      subject: `Your Force Dowels Order ${orderNumber} Has Shipped!`,
      html: buildShippingEmail({ customerName, orderNumber, carrier, trackingNumber: trackingNumber || null }),
    });
    if (error) return jsonError(502, 'Order marked shipped, but the customer e-mail failed', { message: error.message });

    return Response.json({ success: true, message: 'Order marked as shipped and customer notified', carrier, tracking_number: trackingNumber || null });
  } catch (err) {
    console.error('Error updating order:', err);
    return jsonError(500, 'Failed to update order', { message: errorMessage(err) });
  }
}
