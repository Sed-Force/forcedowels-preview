// /api/admin/ship-order.js
// Mark an order as shipped, store tracking info, and email customer
export const config = { runtime: 'nodejs' };

import Stripe from 'stripe';
import { Resend } from 'resend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });
const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_FROM = process.env.EMAIL_FROM || 'orders@forcedowels.com';
const LOGO_URL = process.env.EMAIL_LOGO_URL || 'https://forcedowels-preview.vercel.app/images/force-dowel-logo.jpg';
const BRAND_BLUE = '#1C4A99';

function buildShippingEmail({ customerName, orderNumber, carrier, trackingNumber }) {
  const hasTracking = trackingNumber && trackingNumber !== 'N/A';

  let trackingSection = '';
  if (hasTracking) {
    let trackingLink = '';
    if (carrier === 'UPS') {
      trackingLink = `https://www.ups.com/track?tracknum=${trackingNumber}`;
    } else if (carrier === 'USPS') {
      trackingLink = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
    }

    trackingSection = `
      <tr>
        <td style="padding:24px;">
          <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid ${BRAND_BLUE};padding-bottom:8px;">Tracking Information</h3>
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;color:#6b7280;font-size:14px;width:120px;"><strong>Carrier:</strong></td>
              <td style="padding:8px 0;color:#111827;font-size:14px;">${carrier}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;font-size:14px;"><strong>Tracking #:</strong></td>
              <td style="padding:8px 0;color:#111827;font-size:14px;font-family:monospace;">${trackingNumber}</td>
            </tr>
            ${trackingLink ? `
            <tr>
              <td colspan="2" style="padding:16px 0 0 0;">
                <a href="${trackingLink}" style="display:inline-block;background:${BRAND_BLUE};color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">Track Your Package</a>
              </td>
            </tr>
            ` : ''}
          </table>
        </td>
      </tr>
    `;
  } else {
    trackingSection = `
      <tr>
        <td style="padding:24px;">
          <h3 style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;border-bottom:2px solid ${BRAND_BLUE};padding-bottom:8px;">Shipping Information</h3>
          <p style="color:#111827;font-size:14px;line-height:1.6;margin:0;">
            Your order is being shipped via <strong>${carrier}</strong>. You will receive tracking information once your shipment is in transit.
          </p>
        </td>
      </tr>
    `;
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your Order Has Shipped</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#f3f4f6;">
    <tr>
      <td style="padding:40px 20px;">
        <table role="presentation" style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background:${BRAND_BLUE};padding:24px;text-align:center;">
              <img src="${LOGO_URL}" alt="Force Dowels" style="height:48px;border-radius:999px;">
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:32px 24px;">
              <h1 style="margin:0 0 16px;color:#111827;font-size:24px;font-weight:700;">Your Order Has Shipped! 📦</h1>
              <p style="margin:0 0 24px;color:#6b7280;font-size:16px;line-height:1.6;">
                Hi ${customerName || 'there'},
              </p>
              <p style="margin:0 0 24px;color:#111827;font-size:16px;line-height:1.6;">
                Great news! Your Force Dowels order <strong>${orderNumber}</strong> has been shipped and is on its way to you.
              </p>
              <p style="margin:0;color:#111827;font-size:16px;line-height:1.6;">
                Thank you for choosing Force Dowels. We appreciate your business and hope you love your order!
              </p>
            </td>
          </tr>

          ${trackingSection}

          <!-- Footer -->
          <tr>
            <td style="padding:24px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">
                Questions? Contact us at <a href="mailto:info@forcedowels.com" style="color:${BRAND_BLUE};text-decoration:none;">info@forcedowels.com</a>
              </p>
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} Force Dowels. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { session_id, carrier, tracking_number } = req.body;

    if (!session_id || !carrier) {
      return res.status(400).json({ error: 'Missing session_id or carrier' });
    }

    // Fetch the session to get customer details
    const session = await stripe.checkout.sessions.retrieve(session_id);

    const customerEmail = session.customer_details?.email || session.customer_email;
    const customerName = session.customer_details?.name || session.shipping?.name || 'Customer';

    if (!customerEmail) {
      return res.status(400).json({ error: 'No customer email found for this order' });
    }

    // Generate order number
    const orderNumber = '#' + session_id.replace('cs_test_', '').replace('cs_live_', '').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();

    // Update the Stripe session metadata
    await stripe.checkout.sessions.update(session_id, {
      metadata: {
        shipping_status: 'shipped',
        carrier: carrier,
        tracking_number: tracking_number || '',
        shipped_at: new Date().toISOString()
      }
    });

    // Send shipping notification email
    const emailHtml = buildShippingEmail({
      customerName,
      orderNumber,
      carrier,
      trackingNumber: tracking_number || null
    });

    await resend.emails.send({
      from: EMAIL_FROM,
      to: customerEmail,
      subject: `Your Force Dowels Order ${orderNumber} Has Shipped!`,
      html: emailHtml
    });

    res.status(200).json({
      success: true,
      message: 'Order marked as shipped and customer notified',
      carrier,
      tracking_number: tracking_number || null
    });
  } catch (err) {
    console.error('Error updating order:', err);
    res.status(500).json({ error: 'Failed to update order', message: err.message });
  }
}

