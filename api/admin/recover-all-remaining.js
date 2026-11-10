// Recover all remaining missed orders from October
import Stripe from 'stripe';
import { sql } from '../_lib/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || 'orders@forcedowels.com';
const EMAIL_BCC = process.env.EMAIL_BCC || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// List of missed payment intents from October
const MISSED_PAYMENT_INTENTS = [
  'pi_3SKi9IBZKB1NmC8J1Fd2waNI', // Oct 21
  'pi_3SIC2aBZKB1NmC8J1O8PcPkd', // Oct 14
  'pi_3SIC25BZKB1NmC8J18zpqqDe', // Oct 14
  'pi_3SGjUPBZKB1NmC8J1mfxfpXm', // Oct 10
  'pi_3SGjSRBZKB1NmC8J1JlKrfv7'  // Oct 10
];

async function sendViaResend({ to, subject, html }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || 'Resend error');
  return { ok: true, data };
}

export default async function handler(req, res) {
  try {
    const results = [];

    for (const piId of MISSED_PAYMENT_INTENTS) {
      try {
        console.log(`Processing payment intent: ${piId}`);

        // Get payment intent
        const pi = await stripe.paymentIntents.retrieve(piId);

        // Get session ID by listing sessions for this payment intent
        const sessions = await stripe.checkout.sessions.list({
          payment_intent: piId,
          limit: 1
        });

        if (sessions.data.length === 0) {
          results.push({
            payment_intent: piId,
            status: 'error',
            message: 'No checkout session found for this payment intent'
          });
          continue;
        }

        // Get session details
        const session = sessions.data[0];

        // Extract data
        const customerEmail = session.customer_details?.email || '';
        const customerName = session.metadata?.customer_name || session.customer_details?.name || '';
        const contactName = session.metadata?.contact_name || '';
        const customerPhone = session.customer_details?.phone || session.shipping?.phone || '';

        const totalCents = session.amount_total || 0;
        const subtotalCents = session.amount_subtotal || 0;
        const shippingCents = (session.shipping_cost?.amount_total || 0);

        const shippingAddress = session.shipping?.address || null;
        const billingAddress = session.customer_details?.address || null;

        const shippingAddressStr = shippingAddress ? JSON.stringify(shippingAddress) : '';
        const billingAddressStr = billingAddress ? JSON.stringify(billingAddress) : '';

        const shipCarrier = session.metadata?.ship_carrier || '';
        const shipService = session.metadata?.ship_service || '';
        const shippingMethod = [shipCarrier, shipService].filter(Boolean).join(' • ');

        // Parse items
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
        let quantity = 0;
        let itemsSummary = '';

        for (const item of lineItems.data) {
          const desc = item.description || '';
          if (desc.toLowerCase().includes('shipping')) continue;
          quantity += item.quantity || 0;
          if (itemsSummary) itemsSummary += ', ';
          itemsSummary += `${desc} (${item.quantity})`;
        }

        // Get next invoice number using the same approach as webhook
        const counterKey = process.env.VERCEL_ENV === 'production' ? 'invoice_prod' : 'invoice_preview';
        const result = await sql`
          INSERT INTO order_counter (id, seq)
          VALUES (${counterKey}, 1)
          ON CONFLICT (id) DO UPDATE SET seq = order_counter.seq + 1
          RETURNING seq
        `;
        const invoiceNumber = result[0].seq;

        // Insert order
        await sql`
          INSERT INTO orders (
            invoice_number,
            customer_name,
            contact_name,
            customer_email,
            customer_phone,
            items_summary,
            shipping_method,
            quantity,
            status,
            order_date,
            amount_cents,
            subtotal_cents,
            shipping_cents,
            tracking_number,
            carrier,
            session_id,
            shipping_address,
            billing_address
          ) VALUES (
            ${invoiceNumber},
            ${customerName},
            ${contactName},
            ${customerEmail},
            ${customerPhone},
            ${itemsSummary},
            ${shippingMethod},
            ${quantity},
            'pending',
            CURRENT_DATE,
            ${totalCents},
            ${subtotalCents},
            ${shippingCents},
            '',
            ${shipCarrier},
            ${session.id},
            ${shippingAddressStr},
            ${billingAddressStr}
          )
        `;

        // Send team notification emails
        const bccEmails = EMAIL_BCC.split(',').map(e => e.trim()).filter(Boolean);
        const emailsSent = [];

        for (const email of bccEmails) {
          try {
            await sendViaResend({
              to: email,
              subject: `🔔 New Order #${invoiceNumber} - ${customerName}`,
              html: `
                <h2>New Order Received (Recovered)</h2>
                <p><strong>Invoice:</strong> #${invoiceNumber}</p>
                <p><strong>Customer:</strong> ${customerName}</p>
                <p><strong>Contact:</strong> ${contactName || 'N/A'}</p>
                <p><strong>Email:</strong> ${customerEmail}</p>
                <p><strong>Phone:</strong> ${customerPhone || 'N/A'}</p>
                <p><strong>Items:</strong> ${itemsSummary}</p>
                <p><strong>Quantity:</strong> ${quantity} units</p>
                <p><strong>Total:</strong> $${(totalCents / 100).toFixed(2)}</p>
                <p><strong>Shipping:</strong> ${shippingMethod}</p>
                <p><em>Note: This order was placed on ${new Date(pi.created * 1000).toLocaleDateString()} and recovered on ${new Date().toLocaleDateString()}.</em></p>
              `
            });
            emailsSent.push(email);
            await new Promise(r => setTimeout(r, 600)); // Rate limit
          } catch (emailErr) {
            console.error(`Failed to send email to ${email}:`, emailErr);
          }
        }

        results.push({
          payment_intent: piId,
          status: 'recovered',
          invoice_number: invoiceNumber,
          customer_email: customerEmail,
          amount: (totalCents / 100).toFixed(2),
          emails_sent: emailsSent.length,
          order_date: new Date(pi.created * 1000).toISOString()
        });

      } catch (err) {
        console.error(`Error recovering ${piId}:`, err);
        results.push({
          payment_intent: piId,
          status: 'error',
          message: err.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Processed ${results.length} missed orders`,
      results
    });

  } catch (err) {
    console.error('Error recovering orders:', err);
    return res.status(500).json({
      error: 'Failed to recover orders',
      message: err.message
    });
  }
}
