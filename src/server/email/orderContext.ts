// Derives the fields the order-notification e-mails need from a retrieved Stripe
// Checkout session. Shared by the checkout webhook (which sends the e-mails) and
// the order-print endpoint (which re-renders the notification as a PDF) so the
// two can never drift apart.
import type Stripe from 'stripe';
import { resolveOrderLines, type MetaSummary } from './orderFormatting';

export interface Address {
  name?: string;
  line1?: string;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  try {
    return JSON.parse(raw || '') as T;
  } catch {
    return fallback;
  }
}

export function deriveNotificationContext(session: Stripe.Checkout.Session, lineItems: Stripe.LineItem[] = []) {
  const meta = session.metadata ?? {};

  // Separate the shipping line item from the goods.
  let shippingCents = 0;
  for (const li of lineItems) {
    if ((li.description || '').toLowerCase() === 'shipping') shippingCents += Number(li.amount_total || 0);
  }
  // Prefer an explicit shipping amount from checkout metadata when present.
  const metaShip = Number(meta.ship_amount_cents || 0);
  if (Number.isFinite(metaShip) && metaShip > 0) shippingCents = metaShip;

  const totalCents = Number(session.amount_total || 0);
  const subtotalCents = Math.max(0, totalCents - shippingCents);
  const taxCents = Number(session.total_details?.amount_tax || 0);

  const metaSummary = parseJson<MetaSummary>(meta.summary, {});
  const shippingAddress = parseJson<Address>(meta.ship_address, {});

  const orderDate = new Date(session.created * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });

  return {
    sessionId: session.id,
    customerEmail: session.customer_details?.email || session.customer_email || '',
    customerName: meta.customer_name || meta.business_name || '',
    contactName: meta.contact_name || '',
    customerPhone: session.customer_details?.phone || meta.phone || '',
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents,
    metaSummary,
    orderLines: resolveOrderLines(metaSummary),
    shippingMethod: [meta.ship_carrier, meta.ship_service].filter(Boolean).join(' '),
    shippingAddress,
    billingAddress: (session.customer_details?.address ?? {}) as Address,
    orderDate,
    isTest: (metaSummary.tests ?? 0) > 0,
  };
}
