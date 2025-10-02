// /api/checkout.js
// Node.js Serverless function for Vercel

exports.config = { runtime: "nodejs" };

const Stripe = require("stripe");

// ---- ENV REQUIREMENTS ----
// STRIPE_SECRET_KEY           -> sk_test_... (for test mode)
// NEXT_PUBLIC_BASE_URL        -> e.g. https://your-preview.vercel.app
//
// NOTE: We do NOT rely on price IDs here (to avoid fractional-cent issues).
// We compute the total for bulk as 1 line item priced at the full amount.
// The kit uses a fixed $36.00 per kit.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

function tierPricePerUnit(units) {
  // Server-side source of truth for tiered pricing
  if (units >= 160000 && units <= 960000) return 0.063;
  if (units >= 20000 && units < 160000) return 0.0675;
  if (units >= 5000 && units < 20000) return 0.072;
  throw new Error("Invalid bulk units: must be between 5,000 and 960,000.");
}

function normalizeItems(body) {
  // Accept many shapes: {items:[...]}, {cart:[...]}, or a single object
  const raw =
    Array.isArray(body?.items) ? body.items :
    Array.isArray(body?.cart)  ? body.cart  :
    Array.isArray(body)        ? body       :
    body ? [body] : [];

  const out = [];
  for (const it of raw) {
    // Starter Kit
    if (it?.type === "kit" || it?.sku === "FD-KIT-300" || it?.sku === "kit") {
      const qty = Math.max(1, Number(it.qty ?? it.quantity ?? 1));
      out.push({ kind: "kit", qty });
      continue;
    }

    // Bulk
    const units = Number(it?.units ?? it?.qty ?? it?.quantity ?? 0);
    if (units && units >= 5000) {
      // snap to 5k increments to be safe
      const snapped = Math.min(960000, Math.max(5000, Math.round(units / 5000) * 5000));
      out.push({ kind: "bulk", units: snapped });
      continue;
    }
  }
  return out;
}

function buildLineItem(item) {
  if (item.kind === "kit") {
    // $36 per kit
    return {
      price_data: {
        currency: "usd",
        product_data: {
          name: "Force Dowels — Starter Kit (300)",
        },
        unit_amount: 3600, // $36.00
      },
      quantity: item.qty,
    };
  }

  if (item.kind === "bulk") {
    // Compute total and make a single-price line to avoid fractional cents per unit
    const ppu = tierPricePerUnit(item.units);
    const totalCents = Math.round(item.units * ppu * 100); // integer cents
    return {
      price_data: {
        currency: "usd",
        product_data: {
          name: "Force Dowels — Bulk",
          // Keep the details for the customer (and you)
          description: `${item.units.toLocaleString()} units @ $${ppu.toFixed(4)}/unit`,
        },
        unit_amount: totalCents, // charge as ONE item for the full total
      },
      quantity: 1,
    };
  }

  throw new Error("Unknown cart item.");
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "MISSING_STRIPE_SECRET_KEY" });
    }

    // Parse JSON body safely (Vercel Node can give string or object)
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const items = normalizeItems(body);
    if (!items.length) {
      return res.status(400).json({ error: "EMPTY_CART" });
    }

    const line_items = items.map(buildLineItem);

    // /api/checkout.js  (only the important part shown)
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const { items, shipping } = req.body || {};
    // ...you already build lineItems from 'items'
    const lineItems = []; // <-- your existing items push here

    // NEW: add shipping as a line item if provided
    if (shipping && Number.isFinite(shipping.priceCents) && shipping.priceCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Shipping — ${shipping.carrier} ${shipping.service}`,
          },
          unit_amount: Math.round(shipping.priceCents),
        },
        quantity: 1,
      });
    }

    // create the session with lineItems
    // ...
  } catch (e) {
    // ...
  }
}

    // Base URL for redirects (env first; fallback to Host header)
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (req.headers && req.headers.host ? `https://${req.headers.host}` : "http://localhost:3000");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart.html`,
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: ["US", "CA"] },
      metadata: { source: "forcedowels-preview" },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    // Bubble a friendly error to the browser so you can see it in DevTools
    return res.status(500).json({
      error: "CHECKOUT_FAILED",
      message: err?.message || "Internal error",
    });
  }
};
