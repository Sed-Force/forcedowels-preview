// /api/checkout.js — MASTER
// Creates a Stripe Checkout Session using SKUs from the client.
// Server maps SKUs -> Stripe Price IDs (from env), validates against an allowlist,
// and (optionally) attaches Clerk identity. Supports shipping + automatic tax.

import { json, applyCORS, verifyAuth } from './_lib/auth.js';
import Stripe from 'stripe';

// ---------- Stripe ----------
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

// Allowlist Stripe Price IDs so only approved prices can be used
const ALLOWLIST = [
  process.env.STRIPE_PRICE_FORCE_100, // 5,000 pack (your $360.00 test price)
  process.env.STRIPE_PRICE_FORCE_500  // 25,000 pack (your $1,687.50 test price)
].filter(Boolean);

// Map browser SKUs to server-side Price IDs (do NOT expose price IDs in HTML/JS)
const PRICE_BY_SKU = {
  'force-100': process.env.STRIPE_PRICE_FORCE_100, // 5,000 pack
  'force-500': process.env.STRIPE_PRICE_FORCE_500  // 25,000 pack
};

// Optional: a comma-separated list of Shipping Rate IDs (shr_...)
const SHIPPING_RATES = String(process.env.STRIPE_SHIPPING_RATE_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// ---------- Handler ----------
export default async function handler(req, res) {
  // CORS / preflight
  if (applyCORS(req, res)) return;
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }
  if (!stripe) {
    return json(res, 501, { error: 'Stripe not configured (set STRIPE_SECRET_KEY)' });
  }

  // Parse body
  let body = {};
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json(res, 400, { error: 'Invalid JSON body' });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return json(res, 400, { error: 'Cart is empty' });

  // Optional: Clerk identity, but do NOT require it
  let identity = null;
  try { identity = await verifyAuth(req); } catch {}

  // Build Stripe line_items from either { sku } OR { priceId } (sku preferred)
  const line_items = [];
  for (const it of items) {
    const qty = Math.max(1, Number(it.quantity || 1));

    const priceFromSku = it.sku ? PRICE_BY_SKU[it.sku] : null;
    const price = String(it.priceId || priceFromSku || '');

    if (!price) {
      return json(res, 400, { error: `Missing price for item (sku=${it.sku || 'n/a'})` });
    }
    if (!ALLOWLIST.includes(price)) {
      return json(res, 400, { error: `Disallowed priceId: ${price}` });
    }

    line_items.push({ price, quantity: qty });
  }
  if (!line_items.length) return json(res, 400, { error: 'Cart is empty' });

  // Build return URLs
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host || ''}`).replace(/\/$/, '');
  const success_url = `${baseUrl}/order-success.html?session_id={CHECKOUT_SESSION_ID}`;
  const cancel_url = `${baseUrl}/order.html#cart`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url,
      cancel_url,

      // Attach identity if available (helps reconciliation in Stripe)
      customer_email: identity?.email || undefined,
      client_reference_id: identity?.userId || undefined,

      allow_promotion_codes: true,
      automatic_tax: { enabled: true },

      // Collect address and optionally offer preset shipping rates
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      shipping_options: SHIPPING_RATES.map(id => ({ shipping_rate: id }))
    });

    return json(res, 200, { ok: true, url: session.url });
  } catch (err) {
    return json(res, 502, { error: 'Stripe session failed', detail: err?.message || String(err) });
  }
}

// ---------- Utils ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
