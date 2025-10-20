// /api/admin/setup-historical-orders.js
// One-time setup script to populate database with historical orders
export const config = { runtime: 'nodejs' };

import { sql } from '../_lib/db.js';
import { upsertCounter } from '../_lib/db.js';

// All orders sorted chronologically (earliest to latest)
const HISTORICAL_ORDERS = [
  // July 2025
  {
    customer_name: 'L',
    customer_email: 'xlianc@gmail.com',
    items_summary: '5,000-20,000 (5000) (Qty: 5000)',
    shipping_method: 'Stripe Link',
    quantity: 5000,
    status: 'shipped',
    order_date: '2025-07-22',
    amount_cents: 38298,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-07-23'
  },
  {
    customer_name: 'Segale Brothers',
    customer_email: 'don@segalebros.com',
    items_summary: 'Custom Order (Qty: 600)',
    shipping_method: 'Stripe Link',
    quantity: 600,
    status: 'shipped',
    order_date: '2025-07-28',
    amount_cents: 4417,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-07-29'
  },
  {
    customer_name: 'lee',
    customer_email: 'lee@acercabinets.com',
    items_summary: '5,000-20,000 (5000) (Qty: 5000)',
    shipping_method: 'UPS Ground',
    quantity: 5000,
    status: 'shipped',
    order_date: '2025-07-31',
    amount_cents: 40003,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-01'
  },

  // August 2025
  {
    customer_name: 'Larry Falken',
    customer_email: 'Ljfalken2@gmail.com',
    items_summary: 'Custom Order (Qty: 500)',
    shipping_method: 'Stripe Link',
    quantity: 500,
    status: 'shipped',
    order_date: '2025-08-01',
    amount_cents: 3899,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-02'
  },
  {
    customer_name: 'North Atlantic Corp',
    customer_email: 'ds@northatlanticcorp.com',
    items_summary: 'Custom Order (Qty: 400)',
    shipping_method: 'Stripe Link',
    quantity: 400,
    status: 'shipped',
    order_date: '2025-08-06',
    amount_cents: 2780,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-07'
  },
  {
    customer_name: 'Richard R Elliott',
    customer_email: 'Snowmtnwoodworking@gmail.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-08-06',
    amount_cents: 6154,
    tracking_number: '1Z9TLG290323856182',
    carrier: 'UPS',
    shipped_date: '2025-08-07'
  },
  {
    customer_name: 'Richard R Elliott',
    customer_email: 'Snowmtnwoodworking@gmail.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-08-06',
    amount_cents: 6154,
    tracking_number: '1Z9TLG290323856182',
    carrier: 'UPS',
    shipped_date: '2025-08-07'
  },
  {
    customer_name: 'purchasing',
    customer_email: 'purchasing@spadina.com',
    items_summary: '5,000-20,000 (5000) (Qty: 5000)',
    shipping_method: 'UPS Ground',
    quantity: 5000,
    status: 'shipped',
    order_date: '2025-08-11',
    amount_cents: 41979,
    tracking_number: '1z9TLG290302464206',
    carrier: 'UPS',
    shipped_date: '2025-08-12'
  },
  {
    customer_name: 'Paris Mexico Design',
    customer_email: 'pgremion@parismexico.net',
    items_summary: '5,000-20,000 (5000) (Qty: 5000)',
    shipping_method: 'Stripe Link',
    quantity: 5000,
    status: 'shipped',
    order_date: '2025-08-11',
    amount_cents: 19633,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-12'
  },
  {
    customer_name: 'Yasser Ali',
    customer_email: 'flm36032@gmail.com',
    items_summary: '5,000-20,000 (20000) (Qty: 20000)',
    shipping_method: 'Stripe Link',
    quantity: 20000,
    status: 'shipped',
    order_date: '2025-08-12',
    amount_cents: 77912,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-13'
  },
  {
    customer_name: 'Marathon Hardware',
    customer_email: 'erik.janelle@marathonhardware.com',
    items_summary: '5,000-20,000 (8000) (Qty: 8000)',
    shipping_method: 'Stripe Link',
    quantity: 8000,
    status: 'shipped',
    order_date: '2025-08-13',
    amount_cents: 32843,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-14'
  },
  {
    customer_name: 'Abellex Millworks',
    customer_email: 'noah@abellex.com',
    items_summary: 'Custom Order (Qty: 1500)',
    shipping_method: 'Stripe Link',
    quantity: 1500,
    status: 'shipped',
    order_date: '2025-08-14',
    amount_cents: 9305,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-15'
  },
  {
    customer_name: 'Blake Barber',
    customer_email: 'Production@cabinetsbycrest.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-08-14',
    amount_cents: 6154,
    tracking_number: '1Z4YBT220320014214',
    carrier: 'UPS',
    shipped_date: '2025-08-18'
  },
  {
    customer_name: 'Shelby Woodworking',
    customer_email: 'making127@gmail.com',
    items_summary: 'Custom Order (Qty: 800)',
    shipping_method: 'Stripe Link',
    quantity: 800,
    status: 'shipped',
    order_date: '2025-08-15',
    amount_cents: 5450,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-16'
  },
  {
    customer_name: 'Gordan Kustura',
    customer_email: 'gordan@merrimackstone.com',
    items_summary: '5,000-20,000 (5000) (Qty: 5000)',
    shipping_method: 'UPS Ground',
    quantity: 5000,
    status: 'shipped',
    order_date: '2025-08-18',
    amount_cents: 41979,
    tracking_number: '1Z41T4PW0324845834',
    carrier: 'UPS',
    shipped_date: '2025-08-18'
  },
  {
    customer_name: 'Gordan Kustura',
    customer_email: 'gordan@merrimackstone.com',
    items_summary: '5,000-20,000 (5000) (Qty: 5000)',
    shipping_method: 'UPS Ground',
    quantity: 5000,
    status: 'shipped',
    order_date: '2025-08-18',
    amount_cents: 41979,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-19'
  },
  {
    customer_name: 'purchasing',
    customer_email: 'purchasing@spadina.com',
    items_summary: '5,000-20,000 (5000) (Qty: 5000)',
    shipping_method: 'UPS Ground',
    quantity: 5000,
    status: 'shipped',
    order_date: '2025-08-25',
    amount_cents: 38298,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-26'
  },
  {
    customer_name: 'purchasing',
    customer_email: 'purchasing@spadina.com',
    items_summary: '5,000-20,000 (5000) (Qty: 5000)',
    shipping_method: 'UPS Ground',
    quantity: 5000,
    status: 'shipped',
    order_date: '2025-08-25',
    amount_cents: 38298,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-26'
  },
  {
    customer_name: 'Yehuda Spadina',
    customer_email: 'yehuda@spadina.com',
    items_summary: '5,000-20,000 (8000) (Qty: 8000)',
    shipping_method: 'Stripe Link',
    quantity: 8000,
    status: 'shipped',
    order_date: '2025-08-26',
    amount_cents: 30384,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-27'
  },
  {
    customer_name: 'Levin',
    customer_email: 'info@thematerialreserve.com',
    items_summary: '5,000-20,000 (5000) (Qty: 5000)',
    shipping_method: 'UPS Ground',
    quantity: 5000,
    status: 'shipped',
    order_date: '2025-08-30',
    amount_cents: 37797,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-08-31'
  },

  // September 2025
  {
    customer_name: 'Gary Miller',
    customer_email: 'gary@shelfnation.com',
    items_summary: 'Custom Order (Qty: 600)',
    shipping_method: 'Stripe Link',
    quantity: 600,
    status: 'shipped',
    order_date: '2025-09-02',
    amount_cents: 4500,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-03'
  },
  {
    customer_name: 'Jason Risnes',
    customer_email: 'jason.risnes@yahoo.com',
    items_summary: 'Kit - 300 units (600) (Qty: 600)',
    shipping_method: 'UPS Ground',
    quantity: 600,
    status: 'shipped',
    order_date: '2025-09-04',
    amount_cents: 8993,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-05'
  },
  {
    customer_name: 'Jason Risnes',
    customer_email: 'jason.risnes@yahoo.com',
    items_summary: 'Kit - 300 units (600) (Qty: 600)',
    shipping_method: 'UPS Ground',
    quantity: 600,
    status: 'shipped',
    order_date: '2025-09-04',
    amount_cents: 8993,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-05'
  },
  {
    customer_name: 'eugenia.vrf',
    customer_email: 'eugenia.vrf@sincrology.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-09-05',
    amount_cents: 5660,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-06'
  },
  {
    customer_name: 'purchasing',
    customer_email: 'purchasing@spadina.com',
    items_summary: '5,000-20,000 (10000) (Qty: 10000)',
    shipping_method: 'UPS Ground',
    quantity: 10000,
    status: 'shipped',
    order_date: '2025-09-08',
    amount_cents: 80463,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-09'
  },
  {
    customer_name: 'Avron Levin',
    customer_email: 'avronlevin@gmail.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-09-12',
    amount_cents: 5660,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-13'
  },
  {
    customer_name: 'Avron Levin',
    customer_email: 'avronlevin@gmail.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-09-12',
    amount_cents: 5660,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-13'
  },
  {
    customer_name: 'purchasing',
    customer_email: 'purchasing@spadina.com',
    items_summary: '5,000-20,000 (10000) (Qty: 10000)',
    shipping_method: 'UPS Ground',
    quantity: 10000,
    status: 'shipped',
    order_date: '2025-09-16',
    amount_cents: 70000,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-17'
  },
  {
    customer_name: 'Mohannad halaweh',
    customer_email: 'fairwaycustomcabinets@gmail.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-09-16',
    amount_cents: 5660,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-17'
  },
  {
    customer_name: 'Mohannad halaweh',
    customer_email: 'fairwaycustomcabinets@gmail.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-09-16',
    amount_cents: 5660,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-17'
  },
  {
    customer_name: 'Mohannad halaweh',
    customer_email: 'fairwaycustomcabinets@gmail.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-09-16',
    amount_cents: 5660,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-17'
  },
  {
    customer_name: 'kyle',
    customer_email: 'kyle@cosandconstruction.com',
    items_summary: '5,000-20,000 (5000) (Qty: 5000)',
    shipping_method: 'UPS Ground',
    quantity: 5000,
    status: 'shipped',
    order_date: '2025-09-18',
    amount_cents: 40003,
    tracking_number: '1Z 4YB T16 03 0372 4054',
    carrier: 'UPS',
    shipped_date: '2025-09-19'
  },
  {
    customer_name: 'lee',
    customer_email: 'lee@acercabinets.com',
    items_summary: '5,000-20,000 (5000) (Qty: 5000)',
    shipping_method: 'UPS Ground',
    quantity: 5000,
    status: 'shipped',
    order_date: '2025-09-19',
    amount_cents: 37432,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-20'
  },
  {
    customer_name: 'Spadina',
    customer_email: 'purchasing@spadina.com',
    items_summary: 'Custom Order (Qty: 2500)',
    shipping_method: 'Stripe Link',
    quantity: 2500,
    status: 'shipped',
    order_date: '2025-09-23',
    amount_cents: 10463,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-09-24'
  },
  {
    customer_name: 'Dan Walpole',
    customer_email: 'dwalpole@milltechllc.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-09-30',
    amount_cents: 6397,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-10-01'
  },
  {
    customer_name: 'Dan Walpole',
    customer_email: 'dwalpole@milltechllc.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-09-30',
    amount_cents: 6397,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-10-01'
  },

  // October 2025
  {
    customer_name: 'Jonathan Ward',
    customer_email: 'jonathan@dreamclosetshawaii.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-10-10',
    amount_cents: 7023,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-10-11'
  },
  {
    customer_name: 'Jonathan Ward',
    customer_email: 'jonathan@dreamclosetshawaii.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-10-10',
    amount_cents: 7023,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-10-11'
  },
  {
    customer_name: 'Jonathan Ward',
    customer_email: 'jonathan@dreamclosetshawaii.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-10-10',
    amount_cents: 7023,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-10-11'
  },
  {
    customer_name: 'Wolf Studio',
    customer_email: 'wolfwoodco@gmail.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-10-14',
    amount_cents: 6522,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-10-15'
  },
  {
    customer_name: 'Wolf Studio',
    customer_email: 'wolfwoodco@gmail.com',
    items_summary: 'Kit - 300 units (300) (Qty: 300)',
    shipping_method: 'UPS Ground',
    quantity: 300,
    status: 'shipped',
    order_date: '2025-10-14',
    amount_cents: 6522,
    tracking_number: '',
    carrier: 'UPS',
    shipped_date: '2025-10-15'
  }
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Security check - require admin auth (skip in development if not set)
  const authHeader = req.headers.authorization;
  const adminToken = process.env.ADMIN_SETUP_TOKEN;
  const isDev = process.env.VERCEL_ENV !== 'production';

  if (adminToken && authHeader !== `Bearer ${adminToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!isDev && !adminToken) {
    return res.status(500).json({ error: 'ADMIN_SETUP_TOKEN not configured' });
  }

  try {
    if (!sql) {
      throw new Error('Database not configured');
    }

    console.log('[Setup] Dropping existing orders table if exists...');

    // Drop existing orders table
    await sql`DROP TABLE IF EXISTS orders`;

    console.log('[Setup] Creating orders table...');

    // Create orders table
    await sql`
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        invoice_number INTEGER UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        items_summary TEXT NOT NULL,
        shipping_method TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        status TEXT NOT NULL,
        order_date DATE NOT NULL,
        amount_cents INTEGER NOT NULL,
        tracking_number TEXT,
        carrier TEXT,
        shipped_date DATE,
        session_id TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    console.log('[Setup] Inserting historical orders...');

    // Insert historical orders with sequential invoice numbers
    let invoiceNum = 1;
    for (const order of HISTORICAL_ORDERS) {
      await sql`
        INSERT INTO orders (
          invoice_number,
          customer_name,
          customer_email,
          items_summary,
          shipping_method,
          quantity,
          status,
          order_date,
          amount_cents,
          tracking_number,
          carrier,
          shipped_date
        ) VALUES (
          ${invoiceNum},
          ${order.customer_name},
          ${order.customer_email},
          ${order.items_summary},
          ${order.shipping_method},
          ${order.quantity},
          ${order.status},
          ${order.order_date},
          ${order.amount_cents},
          ${order.tracking_number || ''},
          ${order.carrier},
          ${order.shipped_date || null}
        )
      `;
      invoiceNum++;
    }

    const totalOrders = HISTORICAL_ORDERS.length;
    console.log(`[Setup] Setting invoice counter to ${totalOrders}...`);

    // Set the invoice counter so next order will be totalOrders + 1
    const counterKey = process.env.VERCEL_ENV === 'production' ? 'invoice_prod' : 'invoice_preview';
    await upsertCounter(counterKey, totalOrders);

    console.log('[Setup] Clearing all distributors...');

    // Clear ALL distributors (no active distributors)
    try {
      await sql`DELETE FROM distributors`;
      console.log('[Setup] All distributors cleared');
    } catch (err) {
      console.log('[Setup] No distributors table found, skipping...');
    }

    console.log('[Setup] Creating customers table...');

    // Drop and recreate customers table
    await sql`DROP TABLE IF EXISTS customers`;
    await sql`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        total_orders INTEGER DEFAULT 0,
        total_spent_cents INTEGER DEFAULT 0,
        first_order_date DATE,
        last_order_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    console.log('[Setup] Populating customers from orders...');

    // Extract unique customers from orders and calculate stats
    const customerData = {};
    for (const order of HISTORICAL_ORDERS) {
      const email = order.customer_email.toLowerCase();
      if (!customerData[email]) {
        customerData[email] = {
          email,
          name: order.customer_name,
          total_orders: 0,
          total_spent_cents: 0,
          first_order_date: order.order_date,
          last_order_date: order.order_date
        };
      }
      customerData[email].total_orders++;
      customerData[email].total_spent_cents += order.amount_cents;
      if (order.order_date < customerData[email].first_order_date) {
        customerData[email].first_order_date = order.order_date;
      }
      if (order.order_date > customerData[email].last_order_date) {
        customerData[email].last_order_date = order.order_date;
      }
    }

    // Insert customers
    for (const customer of Object.values(customerData)) {
      await sql`
        INSERT INTO customers (email, name, total_orders, total_spent_cents, first_order_date, last_order_date)
        VALUES (${customer.email}, ${customer.name}, ${customer.total_orders}, ${customer.total_spent_cents}, ${customer.first_order_date}, ${customer.last_order_date})
      `;
    }

    console.log('[Setup] Setup complete!');

    return res.status(200).json({
      success: true,
      message: 'Historical orders setup complete',
      orders_created: totalOrders,
      customers_created: Object.keys(customerData).length,
      distributors_cleared: true,
      next_invoice_number: totalOrders + 1
    });

  } catch (err) {
    console.error('[Setup] Error:', err);
    return res.status(500).json({
      error: 'Setup failed',
      message: err.message
    });
  }
}
