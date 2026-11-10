// Add shipping_cents and subtotal_cents columns to orders table
import { sql } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    // Add shipping_cents column
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS shipping_cents INTEGER DEFAULT 0
      `;
    } catch (err) {
      console.log('shipping_cents column may already exist:', err.message);
    }

    // Add subtotal_cents column
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS subtotal_cents INTEGER DEFAULT 0
      `;
    } catch (err) {
      console.log('subtotal_cents column may already exist:', err.message);
    }

    // For existing orders without these values, calculate them
    // Assume 20% of total is shipping (rough estimate) for historical orders
    await sql`
      UPDATE orders
      SET
        shipping_cents = FLOOR(amount_cents * 0.2),
        subtotal_cents = FLOOR(amount_cents * 0.8)
      WHERE shipping_cents IS NULL OR shipping_cents = 0 OR subtotal_cents IS NULL OR subtotal_cents = 0
    `;

    return res.status(200).json({
      success: true,
      message: 'Added shipping_cents and subtotal_cents columns and populated existing orders'
    });

  } catch (err) {
    console.error('Error adding columns:', err);
    return res.status(500).json({
      error: 'Failed to add columns',
      message: err.message
    });
  }
}
