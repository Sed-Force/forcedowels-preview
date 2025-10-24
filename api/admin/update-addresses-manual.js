import { sql } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Address data from user
    const addressData = [
      {
        invoice: 1,
        billing: '95 Lombardy Street, Brooklyn, NY 11222 US',
        shipping: '96 New South Road, Hicksville, NY 11801 US'
      },
      {
        invoice: 2,
        address: '1705 Sabre St, Hayward, CA 94545 US',
        phone: '(650) 784-4105'
      },
      {
        invoice: 3,
        address: '4742 S 131st Rd, Bolivar, MO 65613 US'
      },
      {
        invoice: 4,
        address: '7765 E Naranja Ave, Mesa, AZ 85209 US',
        phone: '(970) 773-6646'
      },
      {
        invoice: 5,
        address: '1255 G.A.R. Highway, State Rt 6, Somerset, MA 02726 US',
        phone: '(508) 235-4319'
      },
      {
        invoice: 6,
        address: '1130 S Hwy 198, Payson, UT 84651 US',
        name: 'Richard R Elliott'
      },
      {
        invoice: 7,
        address: '1130 S Hwy 198, Payson, UT 84651 US',
        name: 'Richard R Elliott'
      },
      {
        invoice: 8,
        billing: '170 Williams Dr, Ramsey, NJ 07446 US',
        shipping: '50 Furler St, Totowa, NJ 07512 US'
      },
      {
        invoice: 9,
        address: 'Robirosa #8, Prolongación San Esteban, Naucalpan, Méx., MX',
        phone: '+52 55 5250 5005'
      },
      {
        invoice: 10,
        address: 'JDBD 8265, Building No 8265, St Urwah Assaadi, Secondary No 3062, District Alvawadi, Jeddah 23443 SA',
        phone: '+966 54 468 1764'
      },
      {
        invoice: 11,
        address: '9, Beliveau St., Victoriaville QC G6P4C1 CA',
        phone: '(418) 563-8060'
      },
      {
        invoice: 12,
        address: '5357 Kawaihau Rd, Kapaa, HI 96746 US',
        phone: '(808) 346-4639'
      },
      {
        invoice: 13,
        address: '715 West 200 South, Logan, UT 84321 US',
        name: 'Crest Cabinets and Design'
      },
      {
        invoice: 14,
        address: '215 Triple Lakes Ln, Pendergrass, GA 30567 US',
        phone: '(706) 471-0144'
      },
      {
        invoice: 15,
        address: '27 Airport Road, Nashua, NH 03063 US',
        name: 'Gordan Kustura'
      },
      {
        invoice: 16,
        address: '27 Airport Road, Nashua, NH 03063 US',
        name: 'Gordan Kustura'
      },
      {
        invoice: 17,
        billing: 'Ramsey, NJ 07446 US',
        shipping: '50 Furler St, Totowa, NJ 07512 US'
      },
      {
        invoice: 18,
        billing: 'Ramsey, NJ 07446 US',
        shipping: '50 Furler St, Totowa, NJ 07512 US'
      },
      {
        invoice: 19,
        billing: 'Ramsey, NJ 07446 US',
        shipping: '50 Furler St, Totowa, NJ 07512 US'
      },
      {
        invoice: 20,
        address: '165 Trade Street, Bogart, GA 30622 US'
      },
      {
        invoice: 21,
        address: '530 Bluegrass Dr, Canonsburg, PA 15317 US',
        phone: '(412) 758-9087'
      },
      {
        invoice: 22,
        address: 'Po Box 372, Rimfoest, CA 92378 US'
      },
      {
        invoice: 23,
        address: 'Po Box 372, Rimfoest, CA 92378 US'
      },
      {
        invoice: 24,
        billing: 'Calzada Del Farol 6, 72150 Heroica Puebla de Zaragoza, Pue., MX',
        billingName: 'MARIA VON RAESFELD FABRE',
        shipping: '1511 San Patricia Drive, Pharr, TX 78577 US',
        shippingName: 'EUGENIA VON RAESFELD'
      },
      {
        invoice: 25,
        address: '50 furler street, Totowa, NJ 07512 US'
      },
      {
        invoice: 26,
        address: '7235 Blythdale Drive, Dallas, TX 75248 US'
      },
      {
        invoice: 27,
        address: '7235 Blythdale Drive, Dallas, TX 75248 US'
      },
      {
        invoice: 28,
        billing: 'Ramsey, NJ 07446 US',
        shipping: '50 Furler St, Totowa, NJ 07512 US'
      },
      {
        invoice: 29,
        address: '4899 Fairway Drive, Rohnert Park, CA 94928 US'
      },
      {
        invoice: 30,
        address: '4899 Fairway Drive, Rohnert Park, CA 94928 US'
      },
      {
        invoice: 31,
        address: '4899 Fairway Drive, Rohnert Park, CA 94928 US'
      },
      {
        invoice: 32,
        address: '2110 E 52nd St N, Sioux Falls, SD 57104 US',
        name: 'Kyle Cosand'
      },
      {
        invoice: 33,
        address: '4742 S 131st Rd, Bolivar, MO 65613 US',
        name: 'Lee Grant'
      },
      {
        invoice: 34,
        billing: 'Ramsey, NJ 07446 US',
        shipping: '50 Furler St, Totowa, NJ 07512 US'
      },
      {
        invoice: 35,
        address: '6355 Rutherford Dr, Canal Winchester, OH 43110 US'
      },
      {
        invoice: 36,
        address: '6355 Rutherford Dr, Canal Winchester, OH 43110 US'
      },
      {
        invoice: 37,
        address: '316 Kuliouou Road, Honolulu, HI 96821 US'
      },
      {
        invoice: 38,
        address: '316 Kuliouou Road, Honolulu, HI 96821 US'
      },
      {
        invoice: 39,
        address: '316 Kuliouou Road, Honolulu, HI 96821 US'
      },
      {
        invoice: 40,
        address: '3015 Sangra Avenue Southwest, Suite D, Grandville, MI 49418 US'
      },
      {
        invoice: 41,
        address: '3015 Sangra Avenue Southwest, Suite D, Grandville, MI 49418 US'
      },
      {
        invoice: 44,
        address: 'Chula Vista CA'
      }
    ];

    const results = {
      total: addressData.length,
      updated: 0,
      failed: 0,
      errors: []
    };

    // Ensure address columns exist
    try {
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_address TEXT`;
    } catch (e) {
      console.log('[Manual Update] Columns already exist');
    }

    // Process each invoice
    for (const data of addressData) {
      try {
        const invoiceNum = data.invoice;

        // Determine billing and shipping addresses
        let billingAddr = data.billing || data.address || '';
        let shippingAddr = data.shipping || data.address || '';

        // Get existing order data
        const existingOrder = await sql`
          SELECT customer_name, customer_phone
          FROM orders
          WHERE invoice_number = ${invoiceNum}
        `;

        if (existingOrder.length === 0) {
          console.log(`[Manual Update] Invoice #${invoiceNum} not found`);
          results.failed++;
          results.errors.push({
            invoice: invoiceNum,
            error: 'Order not found'
          });
          continue;
        }

        // Prepare update fields
        const updateFields = {
          billing_address: billingAddr,
          shipping_address: shippingAddr
        };

        // Update name if provided and not already set
        let nameUpdate = '';
        if (data.name && !existingOrder[0].customer_name) {
          nameUpdate = `, customer_name = ${data.name}`;
        } else if (data.billingName && !existingOrder[0].customer_name) {
          nameUpdate = `, customer_name = ${data.billingName}`;
        }

        // Update phone if provided and not already set
        let phoneUpdate = '';
        if (data.phone && !existingOrder[0].customer_phone) {
          phoneUpdate = `, customer_phone = ${data.phone}`;
        }

        // Perform update
        await sql`
          UPDATE orders
          SET
            billing_address = ${billingAddr},
            shipping_address = ${shippingAddr}
            ${nameUpdate ? sql`, customer_name = ${data.name || data.billingName}` : sql``}
            ${phoneUpdate ? sql`, customer_phone = ${data.phone}` : sql``}
          WHERE invoice_number = ${invoiceNum}
        `;

        results.updated++;
        console.log(`[Manual Update] Updated invoice #${invoiceNum}`);

      } catch (err) {
        console.error(`[Manual Update] Failed to update invoice #${data.invoice}:`, err.message);
        results.failed++;
        results.errors.push({
          invoice: data.invoice,
          error: err.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Manual update complete: ${results.updated} updated, ${results.failed} failed`,
      results
    });

  } catch (error) {
    console.error('[Manual Update] Error:', error);
    return res.status(500).json({
      error: 'Failed to update addresses',
      details: error.message
    });
  }
}
