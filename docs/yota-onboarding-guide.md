# Customer Onboarding Guide — Credential Setup

Use this guide when collecting credentials from a new Concierge customer.
Send this to the customer after the Assessment readout call, before skill activation begins.

> **This is a reusable template.** Replace [CUSTOMER NAME] and send as-is.
> Estimated customer time: 15 minutes.

---

## What We Need and Why

To activate your Clarissi skills, we need read-only API access to your Shopify store and your Gorgias account.

**What we do with these credentials:**
- Shopify: read order data and inventory levels so skills can evaluate each incoming order
- Gorgias: create support tickets on your behalf when a skill fires (e.g. a backorder notification email to your customer)

**What we don't do:**
- We never modify orders, adjust inventory, or issue refunds
- Credentials are encrypted at rest using AES-256-GCM and stored per-account
- You can revoke access at any time by deleting the custom app in Shopify or rotating your Gorgias API key

---

## Part 1 — Shopify Custom App

You'll create a private custom app in your Shopify store. This takes about 10 minutes.

### Step 1 — Open the Develop Apps section

1. Log in to your Shopify Admin (`yourstore.myshopify.com/admin`)
2. Click **Apps** in the left sidebar
3. Click **Develop apps** (top right of the Apps page)
4. If prompted, click **Allow custom app development**

### Step 2 — Create the app

1. Click **Create an app**
2. App name: `Clarissi Automation`
3. App developer: leave as yourself
4. Click **Create app**

### Step 3 — Configure API access

1. On the app detail page, click **Configure Admin API scopes**
2. Enable these scopes (search each one):
   - `read_orders`
   - `read_inventory`
   - `read_products`
   - `read_customers`
3. Click **Save**

### Step 4 — Install and copy credentials

1. Click **Install app** → confirm
2. Go to the **API credentials** tab
3. Copy these three values and send them to your operator:

| Field | Where to find it |
|-------|-----------------|
| **Store domain** | Your Shopify Admin URL, e.g. `yourstore.myshopify.com` |
| **API key** | Labeled "API key" on the credentials tab |
| **API secret key** | Labeled "API secret key" — click to reveal |

> Keep the API secret key private. Do not share it in email — use the secure form your operator provides.

---

## Part 2 — Gorgias API Key

This takes about 2 minutes.

1. Log in to your Gorgias account
2. Go to **Settings** → **REST API**
3. Under **API Keys**, click **Generate API Key**
4. Copy these three values:

| Field | Where to find it |
|-------|-----------------|
| **Subdomain** | The part before `.gorgias.com` in your URL, e.g. `yourstore` |
| **Email** | Your Gorgias login email address |
| **API key** | The key you just generated |

---

## Part 3 — Send to Your Operator

Once you have both sets of credentials, send them via your operator's secure credential form (link provided separately). Do not send credentials in plain email.

If you have any questions during setup, reply to your operator — we're happy to walk through it on a quick call.

---

## What Happens Next

After we receive your credentials:
1. We'll connect your Shopify and Gorgias accounts to the Clarissi platform
2. We'll verify both connections are working
3. We'll activate your first skill(s) in test mode — you won't see any customer-facing messages yet
4. We'll run a test event and share the execution log with you
5. Once you're satisfied, we'll switch to live mode

Expected time from credential receipt to first live skill: **1–2 business days.**

---

## Revoking Access

You can revoke Clarissi's access at any time:

- **Shopify:** Shopify Admin → Apps → Clarissi Automation → Delete app
- **Gorgias:** Settings → REST API → Delete the API key

Revoking access will immediately stop all skills from firing. Contact your operator first if you'd like to pause rather than fully disconnect.
