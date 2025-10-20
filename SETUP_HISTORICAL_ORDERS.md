# Historical Orders Setup Instructions

This document explains how to populate the database with 30 historical orders and configure the system so that new orders start at invoice #31.

## What This Does

1. **Creates an `orders` table** in the database to store all order information
2. **Clears existing orders and distributor applications**
3. **Populates 30 historical orders** (invoices #1-#30) with the data you provided
4. **Sets the invoice counter to 30** so the next new order will be #31
5. **Updates the admin panel** to read from the database instead of only from Stripe

## Prerequisites

- Database must be configured (NEON_DATABASE_URL or DATABASE_URL environment variable)
- Admin setup token must be set in environment variables

## Step 1: Set Environment Variable

Add this to your `.env` file or Vercel environment variables:

```
ADMIN_SETUP_TOKEN=your-secret-token-here
```

Replace `your-secret-token-here` with a secure random string. This protects the setup endpoint from unauthorized access.

## Step 2: Run the Setup Script

Make a POST request to the setup endpoint with the admin token:

```bash
curl -X POST https://your-domain.vercel.app/api/admin/setup-historical-orders \
  -H "Authorization: Bearer your-secret-token-here"
```

For local development:

```bash
curl -X POST http://localhost:3000/api/admin/setup-historical-orders \
  -H "Authorization: Bearer your-secret-token-here"
```

## Step 3: Verify

1. Go to your admin panel
2. Navigate to the Orders tab
3. You should see 30 orders numbered from #30 (most recent) to #1 (oldest)
4. All orders should show correct customer names, emails, quantities, and amounts

## What Happens to Future Orders

- New orders will automatically be saved to the database via the Stripe webhook
- Invoice numbers will continue sequentially (#31, #32, #33, etc.)
- The admin panel will display both historical and new orders
- Shipping status can be updated for all orders (historical and new)

## Historical Orders Summary

The setup includes these 30 orders:

- **#1-#30**: Orders from July 22, 2025 to October 14, 2025
- **Customers**: Various customers including Wolf Studio, Jonathan Ward, Dan Walpole, kyle, lee, and others
- **Products**: Mix of bulk orders (5,000-10,000 units) and kit orders (300-600 units)
- **Status**: Most marked as "paid", some marked as "shipped" with tracking numbers
- **Total Revenue**: Approximately $1,400 across all 30 orders

## Troubleshooting

### Error: "Database not configured"
- Check that your DATABASE_URL or NEON_DATABASE_URL environment variable is set correctly

### Error: "Unauthorized"
- Make sure you're passing the correct ADMIN_SETUP_TOKEN in the Authorization header

### Orders not showing in admin panel
- Check browser console for errors
- Verify the database connection
- Check server logs for errors when fetching orders

## Re-running the Setup

The setup script is idempotent - it will:
1. Drop and recreate the orders table
2. Clear all existing orders
3. Re-insert the 30 historical orders
4. Reset the counter to 30

You can safely run it multiple times if needed.
