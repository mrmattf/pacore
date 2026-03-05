# Yota Xpedition — Backorder Monitor Setup Guide

This guide covers everything needed to connect the Backorder Monitor service to the Yota Xpedition Shopify store and Gorgias account.
Two options:

Option A — Yota edits your permissions directly (faster)
Ask Yota to:

Go to Settings → Users and permissions → find your collaborator account
Click on it → check Manage and install apps and channels → Save
---

## Prerequisites

- Collaborator access approved for the Yota Shopify store
- Gorgias API credentials from Yota
- Access to the Railway deployment dashboard

---

## Part 1 — Shopify Custom App

### 1.1 Create the App

1. Log into the Yota store admin
2. Go to **Apps** → **Develop apps**
3. Click **Create an app**
4. Name it `Backorder Monitor`
5. Click **Create app**

### 1.2 Configure API Scopes

1. Click **Configure Admin API scopes**
2. Check exactly these three scopes — nothing else:
   - `read_orders`
   - `read_products`
   - `read_inventory`
3. Click **Save**

### 1.3 Install and Copy Credentials

1. Click **Install app** → confirm installation
2. Go to the **API credentials** tab
3. Copy and save these values — you will need them in Part 3:

| Value | Where to find it |
|-------|-----------------|
| `SHOPIFY_STORE_DOMAIN` | The store's `.myshopify.com` domain (e.g. `yota-xpedition.myshopify.com`) |
| `SHOPIFY_CLIENT_ID` | API credentials tab → **Client ID** |
| `SHOPIFY_CLIENT_SECRET` | API credentials tab → **Client secret** |
| `SHOPIFY_ACCESS_TOKEN` | API credentials tab → **Admin API access token** ⚠️ shown once — copy it now |

> **Important:** The Admin API access token is only displayed once. If you miss it, you will need to uninstall and reinstall the app to generate a new one.

---

## Part 2 — Register the Shopify Webhook

### 2.1 Create the Webhook

1. In the store admin go to **Settings** → **Notifications**
2. Scroll to the bottom → **Webhooks** → click **Create webhook**
3. Fill in the fields:
   - **Event**: `Order creation`
   - **Format**: `JSON`
   - **URL**: `https://<your-railway-url>/webhook/orders/create`
   - **Webhook API version**: `2026-01`
4. Click **Save**

### 2.2 Copy the Webhook Secret

1. After saving, the webhook appears in the list
2. Click **Reveal token** next to it
3. Copy the value — this is `SHOPIFY_WEBHOOK_SECRET`

---

## Part 3 — Configure Railway Environment Variables

In the Railway dashboard, open the service and go to **Variables**. Set the following:

### Shopify

```
SHOPIFY_STORE_DOMAIN=yota-xpedition.myshopify.com
SHOPIFY_CLIENT_ID=<from Part 1>
SHOPIFY_CLIENT_SECRET=<from Part 1>
SHOPIFY_ACCESS_TOKEN=<from Part 1>
SHOPIFY_WEBHOOK_SECRET=<from Part 2>
```

### Gorgias

```
GORGIAS_ENABLED=true
GORGIAS_DOMAIN=<subdomain only, e.g. yotaxpedition — not the full URL>
GORGIAS_API_KEY=<Gorgias API key>
GORGIAS_API_EMAIL=<email used to log into Gorgias>
GORGIAS_FROM_EMAIL=<sender email configured in Gorgias email integration>
```

### Optional

```
SLACK_WEBHOOK_URL=<Slack webhook URL for error alerts — leave blank if not needed>
```

After saving all variables, Railway will redeploy the service automatically.

---

## Part 4 — Verify the Service is Running

Once redeployed, confirm the service is healthy:

```
GET https://<your-railway-url>/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "shopify-backorder",
  "mcp": {
    "tools": ["shopify_get_order", "shopify_check_inventory", "gorgias_create_ticket", "gorgias_add_message"]
  }
}
```

Also check the Railway logs for:
```
shopify.token.refreshed
server.started
```

If the token refresh fails, double-check `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`.

---

## Part 5 — End-to-End Test

### 5.1 Create a Test Order

1. In the Shopify admin, find a product that has zero or negative inventory
2. Create a test order for that product using a test email address you can check
3. Wait up to 60 seconds

### 5.2 Check the Logs

In Railway, watch the logs for this sequence:
```
webhook.orders/create received
chain.backorder.detected
chain.backorder.ticket_created
```

### 5.3 Confirm Gorgias Ticket

Log into Gorgias and confirm:
- A ticket was created tagged `backorder` and `automated`
- The ticket sent an email to the customer with the backordered items listed
- The email offers Option A (split shipment) and Option B (wait and ship together)

### 5.4 Manual Trigger (if needed)

If you want to test against a specific existing order without creating a new one:

```
POST https://<your-railway-url>/trigger/<order-id>
Authorization: Bearer <API_SECRET>
```

Replace `<order-id>` with the numeric Shopify order ID (found in the order URL in the admin).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Service fails to start | Missing or wrong Shopify credentials | Check `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` in Railway |
| `shopify.token.refresh_failed` in logs | Wrong Client ID or Secret | Re-copy from the app's API credentials tab |
| Webhook received but no ticket created | Gorgias not configured | Confirm `GORGIAS_ENABLED=true` and all `GORGIAS_*` vars are set |
| `401 Invalid signature` in logs | Wrong webhook secret | Re-copy `SHOPIFY_WEBHOOK_SECRET` from Settings → Notifications → Webhooks |
| Orders not triggering webhook | Webhook not registered or wrong URL | Confirm the webhook URL in Shopify points to the Railway service URL |
| Ticket created but no email sent | Wrong `GORGIAS_FROM_EMAIL` | Must match an email address configured in Gorgias under Settings → Integrations |
