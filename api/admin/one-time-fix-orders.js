// ONE-TIME USE ONLY: Mark orders 51-54 as shipped without sending emails
// This is a database-only update for orders that were already shipped and customers already notified
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Import database
    const { sql } = await import('../_lib/db.js');

    // The 4 invoice numbers to update
    const invoiceNumbers = [51, 52, 53, 54];

    // Update all 4 orders to 'shipped' status
    const result = await sql`
      UPDATE orders
      SET status = 'shipped',
          updated_at = NOW()
      WHERE invoice_number IN ${sql(invoiceNumbers)}
      RETURNING invoice_number, customer_email, customer_name, status
    `;

    if (result.length === 0) {
      return res.status(404).json({
        error: 'No orders found',
        message: 'Orders 51, 52, 53, 54 were not found in the database'
      });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully updated ${result.length} orders to 'shipped' status`,
      updated_orders: result.map(row => ({
        invoice_number: row.invoice_number,
        customer_email: row.customer_email,
        customer_name: row.customer_name,
        status: row.status
      }))
    });
  } catch (err) {
    console.error('Error updating orders:', err);
    return res.status(500).json({
      error: 'Failed to update orders',
      message: err.message
    });
  }
}
