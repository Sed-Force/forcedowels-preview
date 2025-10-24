import { sql } from '../_lib/db.js';
import { nextCounter } from '../_lib/db.js';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      customer_name,
      customer_email,
      billing_address = '',
      shipping_address = '',
      quantity,
      amount_cents,
      order_date,
      shipping_method = 'Stripe Link',
      carrier = 'UPS',
      tracking_number = '',
      status = 'shipped',
      shipped_date
    } = req.body;

    // Validate required fields
    if (!customer_name || !customer_email || !quantity || !amount_cents || !order_date) {
      return res.status(400).json({
        error: 'Missing required fields: customer_name, customer_email, quantity, amount_cents, order_date'
      });
    }

    // Generate items_summary based on quantity
    let items_summary = '';
    if (quantity >= 165000) {
      items_summary = `165,000+ (${quantity}) (Qty: ${quantity})`;
    } else if (quantity >= 25000) {
      items_summary = `25,000-164,999 (${quantity}) (Qty: ${quantity})`;
    } else if (quantity >= 5000) {
      items_summary = `5,000-24,999 (${quantity}) (Qty: ${quantity})`;
    } else if (quantity % 300 === 0) {
      // Assume it's a kit order
      const kitQty = quantity / 300;
      items_summary = `Kit - 300 units (${quantity}) (Qty: ${quantity})`;
    } else {
      items_summary = `Custom Order (Qty: ${quantity})`;
    }

    // Get next invoice number (use same key as setup script)
    const counterKey = process.env.VERCEL_ENV === 'production' ? 'invoice_prod' : 'invoice_preview';
    const invoice_number = await nextCounter(counterKey);
    console.log('[add-invoice] Next invoice number:', invoice_number, 'for key:', counterKey);

    // Insert the order
    await sql`
      INSERT INTO orders (
        invoice_number,
        customer_name,
        customer_email,
        billing_address,
        shipping_address,
        items_summary,
        shipping_method,
        quantity,
        status,
        order_date,
        amount_cents,
        tracking_number,
        carrier,
        shipped_date,
        session_id
      ) VALUES (
        ${invoice_number},
        ${customer_name},
        ${customer_email},
        ${billing_address},
        ${shipping_address},
        ${items_summary},
        ${shipping_method},
        ${quantity},
        ${status},
        ${order_date},
        ${amount_cents},
        ${tracking_number},
        ${carrier},
        ${shipped_date || order_date},
        ${`manual_${invoice_number}`}
      )
    `;

    // Update or insert customer record
    const existingCustomer = await sql`
      SELECT * FROM customers WHERE LOWER(email) = LOWER(${customer_email})
    `;

    if (existingCustomer.length > 0) {
      // Update existing customer
      await sql`
        UPDATE customers
        SET
          total_orders = total_orders + 1,
          total_spent_cents = total_spent_cents + ${amount_cents},
          last_order_date = CASE
            WHEN ${order_date} > last_order_date THEN ${order_date}
            ELSE last_order_date
          END,
          first_order_date = CASE
            WHEN ${order_date} < first_order_date THEN ${order_date}
            ELSE first_order_date
          END
        WHERE LOWER(email) = LOWER(${customer_email})
      `;
    } else {
      // Create new customer
      await sql`
        INSERT INTO customers (
          email,
          name,
          total_orders,
          total_spent_cents,
          first_order_date,
          last_order_date
        ) VALUES (
          ${customer_email},
          ${customer_name},
          1,
          ${amount_cents},
          ${order_date},
          ${order_date}
        )
      `;
    }

    return res.status(200).json({
      success: true,
      invoice_number,
      message: `Invoice #${invoice_number} created successfully`
    });

  } catch (error) {
    console.error('Error adding manual invoice:', error);
    return res.status(500).json({
      error: 'Failed to add invoice',
      details: error.message
    });
  }
}
