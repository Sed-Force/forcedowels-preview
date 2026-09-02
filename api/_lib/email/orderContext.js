// /api/_lib/email/orderContext.js
// Derives the fields the order-notification emails need from a retrieved Stripe
// Checkout session. Shared by the checkout webhook (which sends the emails) and
// the order-print endpoint (which re-renders the domestic notification as a PDF)
// so the two can never drift apart.

import { resolveOrderLines } from './orderFormatting.js';

export function deriveNotificationContext(session, lineItems = []) {
  // Separate the shipping line item from the goods
  let shippingCents = 0;
  for (const li of lineItems) {
    if ((li.description || '').toLowerCase() === 'shipping') {
      shippingCents += Number(li.amount_total || 0);
    }
  }

  // Prefer an explicit shipping amount from checkout metadata when present
  const metaShip = Number(session.metadata?.ship_amount_cents || 0);
  if (Number.isFinite(metaShip) && metaShip > 0) shippingCents = metaShip;

  const totalCents = Number(session.amount_total || 0);
  const subtotalCents = Math.max(0, totalCents - (shippingCents || 0));
  const taxCents = Number(session.total_details?.amount_tax || 0);

  let metaSummary = {};
  try { metaSummary = JSON.parse(session.metadata?.summary || '{}'); } catch {}

  const { tests = 0 } = metaSummary;

  const shipCarrier = session.metadata?.ship_carrier || '';
  const shipService = session.metadata?.ship_service || '';
  const shippingMethod = [shipCarrier, shipService].filter(Boolean).join(' ');

  const customerName = session.metadata?.customer_name || session.metadata?.business_name || '';
  const contactName = session.metadata?.contact_name || '';
  const customerPhone = session.customer_details?.phone || session.metadata?.phone || '';

  let shippingAddress = {};
  try { shippingAddress = JSON.parse(session.metadata?.ship_address || '{}'); } catch {}

  const billingAddress = session.customer_details?.address || {};

  const orderDate = new Date(session.created * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short'
  });

  return {
    sessionId: session.id,
    customerEmail: session.customer_details?.email || session.customer_email || '',
    customerName,
    contactName,
    customerPhone,
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents,
    metaSummary,
    orderLines: resolveOrderLines(metaSummary),
    shippingMethod,
    shippingAddress,
    billingAddress,
    orderDate,
    isTest: tests > 0
  };
}
