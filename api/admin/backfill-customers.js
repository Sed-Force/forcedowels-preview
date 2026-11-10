// ONE-TIME USE: Backfill customers table from existing orders
// Safe to run multiple times - uses UPSERT logic
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Import database
    const { sql } = await import('../_lib/db.js');

    // Get all orders grouped by customer email
    const orders = await sql`
      SELECT
        customer_email,
        customer_name,
        customer_phone,
        COUNT(*) as total_orders,
        SUM(amount_cents) as total_spent_cents,
        MIN(order_date) as first_order_date,
        MAX(order_date) as last_order_date
      FROM orders
      WHERE customer_email IS NOT NULL AND customer_email != ''
      GROUP BY customer_email, customer_name, customer_phone
      ORDER BY customer_email
    `;

    if (orders.length === 0) {
      return res.status(404).json({
        error: 'No orders found',
        message: 'No orders in database to backfill'
      });
    }

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    // Insert or update each customer
    for (const order of orders) {
      try {
        const result = await sql`
          INSERT INTO customers (
            email,
            name,
            phone,
            total_orders,
            total_spent_cents,
            first_order_date,
            last_order_date
          )
          VALUES (
            ${order.customer_email},
            ${order.customer_name || ''},
            ${order.customer_phone || ''},
            ${order.total_orders},
            ${order.total_spent_cents},
            ${order.first_order_date},
            ${order.last_order_date}
          )
          ON CONFLICT (email)
          DO UPDATE SET
            name = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
            phone = COALESCE(NULLIF(EXCLUDED.phone, ''), customers.phone),
            total_orders = EXCLUDED.total_orders,
            total_spent_cents = EXCLUDED.total_spent_cents,
            first_order_date = EXCLUDED.first_order_date,
            last_order_date = EXCLUDED.last_order_date
          RETURNING (xmax = 0) AS inserted
        `;

        // Check if it was an insert (true) or update (false)
        if (result[0].inserted) {
          inserted++;
        } else {
          updated++;
        }
      } catch (err) {
        console.error(`Error processing ${order.customer_email}:`, err);
        errors++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Backfill completed successfully`,
      stats: {
        total_customers_processed: orders.length,
        inserted: inserted,
        updated: updated,
        errors: errors
      }
    });
  } catch (err) {
    console.error('Backfill error:', err);
    return res.status(500).json({
      error: 'Failed to backfill customers',
      message: err.message
    });
  }
}
