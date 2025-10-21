# Stripe Webhook Setup Guide

## Problem
Orders complete in Stripe but no emails are sent to customers or internal team.

## Solution
Configure Stripe webhook to trigger email notifications when orders are completed.

## Steps

### 1. Add Webhook in Stripe Dashboard

1. Go to https://dashboard.stripe.com/webhooks
2. Click **"Add endpoint"** button
3. Enter webhook URL: `https://www.forcedowels.com/api/stripe-webhook`
4. Under "Events to send", select: **`checkout.session.completed`**
5. Click **"Add endpoint"**

### 2. Copy Webhook Signing Secret

After creating the endpoint, Stripe will show you a **Signing secret** that looks like:
```
whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Copy this secret** - you'll need it in the next step.

### 3. Update Vercel Environment Variable

1. Go to https://vercel.com (your project settings)
2. Navigate to: **Settings → Environment Variables**
3. Find `STRIPE_WEBHOOK_SECRET`
4. Click **Edit** or **Delete and re-add**
5. Paste the new signing secret from Step 2
6. Make sure it's enabled for **Production** environment
7. Click **Save**

### 4. Redeploy (if needed)

Environment variable changes usually take effect immediately, but if emails still don't work:

```bash
vercel deploy --prod
```

### 5. Test the Webhook

1. Make a test purchase on your live site (use the $1 test product!)
2. Go to Stripe Dashboard → Webhooks → Click your endpoint
3. Check the "Recent deliveries" tab - you should see successful webhook calls
4. Check your email - you should receive:
   - Customer confirmation email (to customer's email)
   - Internal notifications (to info@forcedowels.com, sales@forcedowels.com, etc.)

## Troubleshooting

### If emails still don't arrive:

1. **Check Stripe webhook logs:**
   - Go to Stripe Dashboard → Webhooks
   - Click your endpoint
   - Look for failed deliveries with error messages

2. **Check Vercel function logs:**
   - Go to Vercel project dashboard
   - Click "Functions" tab
   - Look for `/api/stripe-webhook` logs

3. **Verify environment variables are set:**
   ```bash
   vercel env pull .env.local
   ```
   Then check that these exist in `.env.local`:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `EMAIL_BCC`

4. **Test webhook manually:**
   - In Stripe Dashboard → Webhooks → Your endpoint
   - Click "Send test webhook"
   - Select `checkout.session.completed`
   - Check if it succeeds

## What Should Happen

When a customer completes checkout:

1. Stripe processes payment
2. Stripe sends `checkout.session.completed` event to your webhook
3. Your webhook (`/api/stripe-webhook`):
   - Saves order to database
   - Generates invoice number
   - Sends customer confirmation email
   - Sends internal notification to: info@forcedowels.com, sales@forcedowels.com, scott@forcecabinets.com, officeadmin@forcecabinets.com
4. Order appears in admin panel at admin.forcedowels.com

## Current Webhook Endpoint

Your webhook endpoint is: `https://www.forcedowels.com/api/stripe-webhook`

Make sure this matches exactly what's configured in Stripe Dashboard.
