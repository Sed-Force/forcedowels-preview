// Recalculate shipping and subtotal using actual product prices
import { sql } from '../_lib/db.js';

const KIT_PRICE = 3600; // $36.00 in cents
const BULK_MIN = 5000;

function unitPriceMillsFor(units) {
  if (units >= 160000) return 63;   // 0.063 * 1000
  if (units >= 20000)  return 67.5; // 0.0675 * 1000
  return 72;                        // 0.072 * 1000
}

function bulkTotalCents(units) {
  if (!Number.isFinite(units) || units < BULK_MIN) return 0;
  const mills = unitPriceMillsFor(units);
  return Math.round((units * mills) / 10); // mills->cents
}

function calculateSubtotal(items_summary, quantity) {
  // Parse the items summary to determine what was ordered
  const summary = items_summary.toLowerCase();

  // Check if it's a kit order
  if (summary.includes('kit')) {
    // Extract number of kits from summary like "Kit - 300 units (300) (Qty: 300)"
    // If quantity is 300, that's 1 kit. If 600, that's 2 kits, etc.
    const numKits = Math.max(1, Math.round(quantity / 300));
    return numKits * KIT_PRICE;
  }

  // Check if it's a bulk order (5000+ units)
  if (quantity >= BULK_MIN) {
    return bulkTotalCents(quantity);
  }

  // For other orders, we can't determine exact pricing
  // Return 0 to indicate it needs manual review
  return 0;
}

export default async function handler(req, res) {
  try {
    // Get all orders
    const orders = await sql`
      SELECT invoice_number, items_summary, quantity, amount_cents
      FROM orders
      ORDER BY invoice_number ASC
    `;

    const results = [];
    let updated = 0;
    let skipped = 0;

    for (const order of orders) {
      const subtotalCents = calculateSubtotal(order.items_summary, order.quantity);

      if (subtotalCents === 0) {
        // Can't determine product price, skip
        results.push({
          invoice_number: order.invoice_number,
          status: 'skipped',
          reason: 'Could not determine product pricing',
          items_summary: order.items_summary,
          quantity: order.quantity
        });
        skipped++;
        continue;
      }

      const shippingCents = Math.max(0, order.amount_cents - subtotalCents);

      // Update the order
      await sql`
        UPDATE orders
        SET
          subtotal_cents = ${subtotalCents},
          shipping_cents = ${shippingCents}
        WHERE invoice_number = ${order.invoice_number}
      `;

      results.push({
        invoice_number: order.invoice_number,
        status: 'updated',
        total: (order.amount_cents / 100).toFixed(2),
        subtotal: (subtotalCents / 100).toFixed(2),
        shipping: (shippingCents / 100).toFixed(2),
        items_summary: order.items_summary,
        quantity: order.quantity
      });
      updated++;
    }

    return res.status(200).json({
      success: true,
      message: `Recalculated ${updated} orders, skipped ${skipped} orders`,
      updated,
      skipped,
      results
    });

  } catch (err) {
    console.error('Error recalculating shipping:', err);
    return res.status(500).json({
      error: 'Failed to recalculate',
      message: err.message
    });
  }
}
