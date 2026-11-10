// Recover the latest missed order from Nov 5
import Stripe from 'stripe';
import { sql } from '../_lib/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const EMAIL_FROM = process.env.EMAIL_FROM || 'orders@forcedowels.com';
const EMAIL_BCC = process.env.EMAIL_BCC || 'info@forcedowels.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function sendViaResend({ to, subject, html }) {
  const body = { from: EMAIL_FROM, to, subject, html };
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    return { ok: false, error: txt, status: resp.status };
  }
  const data = await resp.json();
  return { ok: true, data };
}

export default async function handler(req, res) {
  try {
    const paymentIntentId = 'pi_3SPy2nBZKB1NmC8J0o9MNcwc';

    // Get the session
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1
    });

    if (sessions.data.length === 0) {
      return res.status(404).json({ error: 'No session found' });
    }

    const session = sessions.data[0];
    const sessionId = session.id;

    // Check if already exists
    const existing = await sql`
      SELECT invoice_number FROM orders WHERE session_id = ${sessionId}
    `;

    if (existing.length > 0) {
      return res.status(200).json({ message: 'Order already exists', invoice: existing[0].invoice_number });
    }

    // Get next invoice number
    const counterKey = process.env.VERCEL_ENV === 'production' ? 'invoice_prod' : 'invoice_preview';

    const counterRows = await sql`
      INSERT INTO order_counter (id, seq)
      VALUES (${counterKey}, 1)
      ON CONFLICT (id) DO UPDATE SET seq = order_counter.seq + 1
      RETURNING seq
    `;

    const invoiceNumber = Number(counterRows[0]?.seq ?? 0);

    // Extract data
    const customerName = session.metadata?.customer_name || session.customer_details?.name || '';
    const contactName = session.metadata?.contact_name || '';
    const customerEmail = session.customer_details?.email || '';
    const customerPhone = session.customer_details?.phone || '';

    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId);

    let quantity = 0;
    let kits = 0;
    let itemsSummary = '';

    for (const item of lineItems.data) {
      if (item.description.includes('Starter Kit')) {
        kits += item.quantity;
        quantity += item.quantity * 300;
        itemsSummary = `Kit - 300 units (${item.quantity * 300}) (Qty: ${item.quantity * 300})`;
      } else if (item.description.includes('Force Dowel')) {
        quantity += item.quantity;
        itemsSummary = item.description;
      }
    }

    const totalCents = session.amount_total;
    const shippingCents = Number(session.metadata?.ship_amount_cents || 0);
    const subtotalCents = totalCents - shippingCents;

    const shippingAddress = session.shipping?.address || session.customer_details?.address || {};
    const formatAddr = (a) => `${a.line1||''} ${a.city||''}, ${a.state||''}, ${a.postal_code||''}, ${a.country||''}`;
    const shippingAddressStr = formatAddr(shippingAddress);
    const billingAddressStr = formatAddr(session.customer_details?.address || {});

    const shippingMethod = [session.metadata?.ship_carrier, session.metadata?.ship_service].filter(Boolean).join(' ');

    // Insert into database
    await sql`
      INSERT INTO orders (
        invoice_number, customer_name, contact_name, customer_email, customer_phone,
        items_summary, shipping_method, quantity, status, order_date,
        amount_cents, subtotal_cents, shipping_cents, tracking_number, carrier,
        session_id, shipping_address, billing_address
      ) VALUES (
        ${invoiceNumber}, ${customerName}, ${contactName}, ${customerEmail}, ${customerPhone},
        ${itemsSummary}, ${shippingMethod}, ${quantity}, 'pending', CURRENT_DATE,
        ${totalCents}, ${subtotalCents}, ${shippingCents}, '', '',
        ${sessionId}, ${shippingAddressStr}, ${billingAddressStr}
      )
    `;

    // Send emails
    const results = { customer: null, team: [] };

    // Customer email would go here but let's focus on team notification

    // Team notification
    const internalSubject = `New Order Received - Invoice #${invoiceNumber}`;
    const internalHtml = `
<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;padding:20px;">
<h1 style="color:#d32f2f;">🔔 New Order Received</h1>
<div style="background:#f8f9fa;padding:20px;margin:20px 0;border-radius:6px;">
<p><strong>Invoice #:</strong> ${invoiceNumber}</p>
<p><strong>Company:</strong> ${customerName}</p>
<p><strong>Contact:</strong> ${contactName}</p>
<p><strong>Email:</strong> ${customerEmail}</p>
<p><strong>Phone:</strong> ${customerPhone}</p>
<p><strong>Amount:</strong> $${(totalCents/100).toFixed(2)}</p>
<p><strong>Items:</strong> ${itemsSummary}</p>
<p><strong>Shipping:</strong> ${shippingMethod}</p>
</div>
<div style="background:#fff3cd;padding:15px;border-radius:6px;">
<strong>Action Required:</strong> Process this order in admin panel
</div>
</body></html>`;

    if (EMAIL_BCC && RESEND_API_KEY) {
      const emails = EMAIL_BCC.split(',').map(e => e.trim()).filter(Boolean);
      for (const email of emails) {
        const sent = await sendViaResend({ to: email, subject: internalSubject, html: internalHtml });
        results.team.push({ email, sent: sent.ok });
        await new Promise(r => setTimeout(r, 600)); // Rate limit
      }
    }

    return res.status(200).json({
      success: true,
      invoiceNumber,
      customer: customerEmail,
      amount: totalCents / 100,
      emails: results
    });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
