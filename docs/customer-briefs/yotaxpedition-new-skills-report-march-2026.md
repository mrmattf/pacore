# New Automation Opportunities — YotaXpedition

**Prepared by:** Clarissi
**Date:** March 2026
**Version:** 2.0 — Platform overlap analysis added; investment verdicts and next-generation opportunities included
**Based on:** Live order and support data analysis — Shopify + Gorgias + Fulfil.io + Turn 14
**Scope:** Net-new skill opportunities with platform overlap analysis — active skills not included

---

## What This Report Covers

Your first Clarissi skills are live and running. This report presents the next wave of automation opportunities identified from a deeper analysis of your order data, support ticket patterns, and your upcoming move to Fulfil.io as your fulfillment platform. Each opportunity is grounded in actual numbers from your store.

This version includes an honest evaluation of each skill against what your existing platforms already do natively — so you only invest in automation that genuinely adds something new.

Skills are organized by how quickly they can be activated. Your team selects which to build — this is a menu, not a mandate.

---

## Your Numbers at a Glance

These are the live signals that drove the analysis:

| Metric | Value |
|--------|-------|
| Open backordered orders | 155 orders · $61,038 GMV |
| Backordered orders 14+ days old | 14 orders — highest cancellation risk |
| Cancellations in last 30 days with Backordered tag | 17 of 50 cancels (34%) |
| GMV lost to backorder-driven cancellations | ~$5,518/month |
| Orders in partial fulfillment | 36 orders · $29,625 GMV |
| Drop ship open orders | 19 orders · $9,790 GMV · 50% cancellation rate |
| Shopify Collective orders with no customer update | 28 orders · avg 5.4 days old |
| SKUs at negative Shopify inventory | 3 SKUs (overselling in progress) |
| High-value open orders ($500+) | 31 orders |
| Average order value | $324.60 |

---

## Platform Capability Overlap Analysis

Before recommending each skill, we evaluated what your existing platforms already do natively. This determines where Clarissi genuinely adds new capability versus where configuration of an existing tool would accomplish the same thing.

Each skill carries one of these verdicts:

| Verdict | Meaning |
|---------|---------|
| **INVEST** | No native equivalent — Clarissi is the only path |
| **INVEST (platform advantage)** | Middleware like Zapier could technically wire this; Clarissi adds operator-controlled templates, deduplication, execution history, and platform governance that bare automation tools lack |
| **REFRAME** | Partial native coverage exists, but Clarissi fills a meaningful gap not addressed natively |
| **DROP** | Native tooling already handles this end-to-end — not worth building |
| **DEFER** | Real value, but lowest ROI in the portfolio — activate after higher-value skills are running |
| **CLARIFY FIRST** | Depends on a configuration question; answer that before investing |
| **CONSOLIDATED** | Merged into another skill — activating separately would create duplicate customer notifications |

### What each platform does (and doesn't do)

**Gorgias AI Agent 2.0** natively handles cancellation requests and pre-fulfillment address edits end-to-end. Has Rules for tag-based auto-replies. Has CSAT collection built-in.
Does NOT: send proactive outbound messages, generate Shopify discount codes, schedule delayed follow-ups, or access Fulfil.io data.

**Fulfil.io** natively syncs real-time inventory → Shopify, and sends PO/shipment/tracking data → Gorgias agent sidebar. Your support agents can see full operational context without leaving Gorgias.
Does NOT: send any customer-facing notifications. Zero proactive outbound on PO events, date slippage, ASN confirmations, or dropship creation. It is a pure operations platform.

**Shopify** receives Fulfil.io inventory sync and sends native order/shipping confirmations.
Does NOT: send PO-event-triggered customer notifications. Back-in-stock is opt-in for browsers only — not targeted at existing order holders.

**Turn 14** is a B2B supplier API only. Nothing customer-facing exists.

### Investment verdict by skill

| Skill | Verdict |
|-------|---------|
| Order Cancellation Intervention | **REFRAME** — Gorgias AI handles cancellations but has no backorder context, ETA, or hold incentive capability |
| Pre-Fulfillment Address Edit | **DROP** — Gorgias AI 2.0 already performs this end-to-end |
| Post-Resolution Review Request | **INVEST** — No native equivalent anywhere in the stack |
| Negative Feedback Recovery | **REFRAME** — Gorgias Rules can auto-reply; Clarissi uniquely adds Shopify discount code generation + delay |
| Partner Product Auto-Response | **INVEST** — No Turn 14 API access in Gorgias natively |
| Inbound PO ETA Update | **INVEST (platform advantage)** — Native chain can't do it; Zapier could wire the mechanics but lacks templates, dedup, and governance |
| Restock Date Change Alert | **INVEST (platform advantage)** — Same rationale as above |
| Pre-Order Ship Date Update | **CONSOLIDATED** — Merged into Restock Date Change Alert |
| Drop Ship Partner Status Update | **INVEST (platform advantage)** — No native customer notification path |
| Oversell Prevention Alert | **CLARIFY FIRST** — Confirm whether Fulfil.io→Shopify inventory sync is active |
| Automated Dropship PO Notification | **DEFER** — Overlaps with Drop Ship Status; start with one |
| High-Value Order Routing Confirmation | **DEFER** — Lowest ROI in the Fulfil.io tier |
| Turn 14 Inventory Sync | **INVEST** — Closes the Turn 14 visibility gap at source |
| Turn 14 Dropship ETA Notification | **INVEST** — Fills the tracking gap Fulfil.io doesn't cover for Turn 14 orders |
| Turn 14 MAP Price Monitor | **INVEST** — No native monitoring exists anywhere in the stack |

---

## Part 1 — Skills Available Now

These skills can be activated once Gorgias webhook support is enabled (a one-time platform configuration). No new integrations required.

---

### Skill: Order Cancellation Intervention

> **Verdict: REFRAME** — Gorgias AI Agent 2.0 processes cancellation requests natively. What it cannot do: check whether the order contains a backordered item, retrieve the restock ETA from Fulfil.io, or offer a hold incentive. Clarissi adds the backorder-awareness layer and operator-controlled response templates on top of Gorgias's base capability.

**What it does:** When a customer submits a cancellation request and their order contains a backordered item, this skill fires before the cancel is executed. It sends the customer a personalized response offering: (1) the restock ETA, (2) a substitute product if available, and (3) an optional hold incentive. If they confirm they still want to cancel, the cancel proceeds.

**Why it matters for you:** 34% of your cancellations in the last 30 days had the Backordered tag. At $324.60 average order value, that represents ~$5,518/month in GMV being lost to customers who waited, got no update, and gave up. This skill catches that moment before revenue walks out the door.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| Monthly backorder cancellations | ~17 orders |
| Average order value | $324.60 |
| GMV at risk per month | ~$5,518 |
| Estimated save rate (30% of interventions succeed) | ~5 orders/month recovered |
| **Estimated monthly GMV recovered** | **~$1,655** |
| Support tickets deflected (cancellation requests now auto-handled) | ~12–15 tickets/month |
| Support cost avoided at $12/ticket | ~$150–$180/month |
| **Combined monthly value estimate** | **~$1,800–$1,835** |

---

### Skill: Pre-Fulfillment Address Edit

> **Verdict: DROP** — Gorgias AI Agent 2.0 already performs this workflow end-to-end: it detects whether the order has been fulfilled, updates the shipping address in Shopify if it hasn't shipped, and confirms with the customer. This is not a gap Clarissi needs to fill. If Gorgias AI is not performing as expected on address edits for your account, notify your Clarissi operator and we will revisit.

> *(Skill details retained for reference. Not recommended for activation.)*

**What it would do:** When a customer contacts support to change their shipping address, this skill checks the order's fulfillment status automatically. If the order hasn't shipped yet: updates the address in Shopify, confirms with the customer, and closes the ticket. If it has already shipped: sends an empathetic reply with carrier contact information and tracking, then flags for human follow-up.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| Estimated address edit tickets/month | ~12–18 tickets |
| Average handle time per ticket (manual) | 12 minutes |
| Support cost avoided at $12/ticket | ~$145–$215/month |
| Orders saved from wrong-address delivery failures | 2–4 orders/month |
| Carrier reshipment cost avoided (~$35/incident) | ~$70–$140/month |
| **Estimated monthly value** | **~$215–$355** |

---

### Skill: Post-Resolution Review Request

> **Verdict: INVEST** — No native equivalent anywhere in the stack. Gorgias CSAT is collection-only. There is no timed post-resolution outreach capability in Gorgias, Shopify, or Fulfil.io.

**What it does:** When a support ticket closes with a 5-star CSAT or a Positive Feedback tag, this skill sends the customer a follow-up message 48 hours later with a direct link to leave a Google or product review. No discount or incentive — just a well-timed ask from a customer who already had a great experience.

**Why it matters for you:** Toyota and 4Runner accessory buyers are a research-first community. They check forums, Facebook groups, and Google reviews before buying. A single positive review from a satisfied customer compounds — it's not just one sale, it's social proof that influences dozens of future purchases. This skill turns your best support moments into public brand assets automatically.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| Positive-tagged tickets per month | ~8–12 (based on observed data) |
| Estimated review conversion rate | ~20–30% |
| New reviews generated per month | ~2–3 |
| Average lifetime value lift per review (automotive accessory context) | $800–$1,200 estimated |
| **Estimated monthly brand value** | **Compounding — difficult to cap** |
| Support cost: zero (no human involvement) | — |

---

### Skill: Negative Feedback Recovery

> **Verdict: REFRAME** — Gorgias Rules can send an auto-reply on negative CSAT. What Gorgias cannot do: generate a Shopify discount code, enforce a configurable delay (24 hours), or query the customer's order history to personalize the offer. The Shopify discount code integration is Clarissi-only capability in this stack.

**What it does:** When a ticket closes with a low CSAT score or a Negative Feedback tag, this skill waits 24 hours and then sends a personal recovery message — acknowledging the experience and offering a one-time discount code toward a future order. The delay is intentional: enough time for the customer to cool down, not so long that they've already moved on.

**Why it matters for you:** For an automotive accessories brand with a loyal Toyota community, one vocal negative experience online can reach thousands. Recovering 3–5 unhappy customers per month isn't just about the immediate sale — it's about keeping them inside your brand rather than posting on forums.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| Negative-tagged tickets per month | ~5–8 (observed in data) |
| Estimated recovery rate (30% respond positively) | ~2–3 customers/month retained |
| Average repurchase value | $324.60 |
| Potential churn prevented per month | ~$650–$975 in retained revenue |
| Negative reviews prevented (estimated) | 1–2/month |
| **Estimated monthly value** | **~$650–$975 + brand protection** |

---

### Skill: Partner Product Auto-Response

> **Verdict: INVEST** — Gorgias has no native integration with Turn 14's API. There is no automated path to pulling live supplier data into a customer response without Clarissi.

**What it does:** When a support ticket arrives tagged as a Partner Product inquiry (products fulfilled by a third-party supplier), this skill automatically responds with the correct fulfillment timeline and supplier shipping context — so your team doesn't have to manually look it up and reply.

**Why it matters for you:** Partner product tickets currently require manual lookup and response. With Turn 14 as your distribution partner on a subset of products, the response is predictable: lead times, shipping origin, and expectations are consistent. This skill eliminates the lookup-and-reply loop entirely for that category.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| Partner product tickets/month | ~10–15 tickets |
| Handle time avoided at 8 min/ticket | ~80–120 minutes/month |
| Support cost avoided at $12/ticket | ~$120–$180/month |
| **Estimated monthly value** | **~$120–$180** |

---

## Part 2 — Skills That Become Available with Fulfil.io

When you connect Fulfil.io as your fulfillment platform, a new category of automation becomes available. Fulfil.io tracks your purchase orders, supplier shipments, and inventory positions in real time — data that Shopify alone doesn't have.

### What Fulfil.io already does (and what it doesn't)

Fulfil.io's integrations with Shopify and Gorgias are powerful — but they serve your operations team, not your customers directly.

| Integration | What transfers | Who benefits |
|-------------|---------------|-------------|
| Fulfil.io → Shopify | Real-time inventory levels, shipment confirmations, tracking numbers, order status | Storefront stays accurate |
| Fulfil.io → Gorgias | Order details, shipment status + tracking, customer order history, real-time sync | **Agents** can see everything |
| Shopify → Gorgias | Customer profile, order history, refund/cancel/duplicate actions | Agents can take action |

The critical gap: Fulfil.io has no customer-facing notification system. When a supplier confirms an ASN, when a PO delivery date slips, when a dropship PO is created — your agents can see it in Gorgias, but your customers hear nothing unless someone manually sends a message.

**Why middleware tools like Zapier aren't the answer:** A Zapier flow could technically wire Fulfil.io webhooks → Shopify order queries → Gorgias ticket creation. But Zapier gives you hardcoded messages with no operator template control, no idempotency deduplication (customers get double-notified on retries), no execution history, and no governance layer. Clarissi's skills provide all of that, plus the ASN-time trigger — which fires days before Shopify's inventory sync catches up.

---

### Skill: Inbound PO ETA Update

> **Verdict: INVEST (platform advantage)** — The Fulfil.io → Shopify → Gorgias integration chain cannot execute this natively. Reason 1: this skill fires on `purchase_order.asn_confirmed` — when the supplier ships to your warehouse — which is days before Shopify's inventory sync updates. No Shopify webhook exists at this moment. Reason 2: Fulfil.io's Gorgias integration surfaces data for agents only; it does not create tickets or message customers. Reason 3: the fan-out (one PO event → identify all Shopify orders waiting on that SKU → send one Gorgias message per customer) requires cross-system orchestration no native tool provides.

**What it does:** The moment a supplier confirms shipment on a Fulfil.io purchase order (via ASN confirmation), this skill identifies every customer waiting on that SKU and sends them a personalized update: "Your item is on its way from our supplier — here's your revised expected delivery date." This fires before the product arrives at your warehouse, before Shopify updates, before your customer has to ask.

**Why it matters for you:** You currently have 155 open backordered orders representing $61,038 in open GMV. 14 of those orders are more than 14 days old with no proactive message. The customers most likely to cancel are the ones who've been waiting the longest without any update. This skill catches them at the best possible moment — when there's finally good news to share.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| Backordered orders currently open | 155 orders · $61,038 GMV |
| Orders 14+ days old (highest cancel risk) | 14 orders |
| Estimated cancellation rate without proactive update | ~15–20% of at-risk orders |
| Orders saved per restock cycle (conservative 30% of at-risk) | ~4–6 orders |
| Value saved per cycle at $324.60 AOV | ~$1,300–$1,950 |
| Reduction in "where is my order" tickets | ~20–30 tickets/month |
| **Estimated monthly value (steady state)** | **~$1,600–$2,250** |

---

### Skill: Restock Date Change Alert

> **Verdict: INVEST (platform advantage)** — No native customer notification exists for PO delivery date slippage. Fulfil.io shows agents the updated date; customers get nothing unless someone manually reaches out. Same platform advantage framing as Inbound PO ETA Update.

**What it does:** When a supplier pushes out a purchase order delivery date in Fulfil.io, this skill automatically notifies every customer with an open backordered order for that SKU — before they contact you. The message is clear: "We've received an updated timeline from our supplier. Here's your new expected date."

**Why it matters for you:** You currently have 61 backordered orders that are 7+ days old. Some of those ETAs may have already slipped without any customer knowing. Every day that passes without an update increases cancellation risk. This skill turns a bad situation (a delayed supplier) into a proactive customer service moment.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| Backordered orders 7+ days old | 61 orders |
| Estimated % with slipped ETAs (no visibility today) | ~20–30% |
| Orders at elevated cancel risk | ~12–18 orders |
| Estimated save rate with proactive update | ~25% of at-risk |
| Value protected per month at $324.60 AOV | ~$975–$1,460 |
| Reactive "what's my ETA" tickets avoided | ~15–20/month |
| **Estimated monthly value** | **~$1,150–$1,700** |

---

### Skill: Pre-Order Expected Ship Date Update

> **Verdict: CONSOLIDATED** — This skill has been merged into Restock Date Change Alert. Both notify waiting customers about ETA changes triggered by Fulfil.io restock date updates. Activating both would send duplicate notifications to the same customers for the same underlying event. Restock Date Change Alert covers the full use case, including priority sequencing for long-waiters. This skill is not recommended as a standalone activation.

*(Skill details retained for reference.)*

**What it would do:** Fulfil.io calculates confirmed restock dates for backordered inventory using supplier data and buffer days for realistic expectations. When that date is refreshed, this skill pushes the updated timeline to customers who are waiting — prioritizing customers who have been waiting the longest.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| High-risk orders (14+ days, no update) | 14 orders |
| Estimated save rate with date update message | ~35% |
| Orders retained per cycle | ~5 orders |
| Value at $324.60 AOV | ~$1,620/cycle |
| **Monthly value** | **Captured within Restock Date Change Alert above** |

---

### Skill: Drop Ship Partner Status Update

> **Verdict: INVEST (platform advantage)** — No native customer notification path exists for Fulfil.io dropship PO status events. Recommended as the primary dropship skill — start here before adding the PO Creation notification to avoid over-notifying customers at two lifecycle stages simultaneously.

**What it does:** When a drop ship order's status changes in Fulfil.io's dropship workflow, this skill fires a proactive customer message: "Your order is being prepared by our fulfillment partner. Here's what to expect and when."

**Why it matters for you:** You have 19 open drop ship orders representing $9,790 in GMV with a 50% cancellation rate. The primary driver of that cancellation rate is lack of visibility — customers can't see what's happening with their order. This skill provides that visibility before customers ask for it.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| Monthly drop ship orders | ~19 orders · $9,790 GMV |
| Current cancellation rate | ~50% |
| GMV at risk per month | ~$4,895 |
| Estimated cancellation reduction with proactive messaging | ~30% fewer cancellations |
| Orders saved per month | ~3 orders |
| **Estimated monthly GMV recovered** | **~$975** |
| Support tickets avoided ("where is my order") | ~8–10/month |
| **Total monthly value estimate** | **~$1,070–$1,095** |

---

### Skill: Oversell Prevention Alert

> **Verdict: CLARIFY FIRST** — Fulfil.io natively syncs inventory levels back to Shopify in real-time. If that sync is fully configured, it should prevent Shopify from accepting orders for out-of-stock SKUs at the source. The 3 current negative-inventory SKUs likely reflect a pre-integration state. Please confirm with your Fulfil.io account manager: is real-time inventory sync to Shopify active and fully configured? If yes, this skill's value narrows to a committed-quantity guardrail for edge cases (sync lag, manual overrides). We recommend clarifying sync status before investing in this skill.

**What it does:** When a new order arrives in Shopify for a SKU that Fulfil.io shows as fully committed against confirmed inbound inventory, this skill fires an immediate internal alert to your operations team via Slack — before more customers are added to a backorder queue that can't be filled.

**Why it matters for you:** You currently have 3 SKUs at negative Shopify inventory, which means Shopify is accepting orders it cannot fill. Fulfil.io knows the committed quantity vs. what's inbound on purchase orders. This skill is the signal that tells your team the moment that gap opens — not after 20 more orders have been taken on a SKU you can't deliver.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| SKUs currently at negative inventory | 3 |
| Avg cost of an oversold order (refund + handling + customer friction) | ~$45–$65 |
| Estimated oversold orders prevented per month | ~5–10 |
| Cost avoided per month | ~$225–$650 |
| Reduction in backorder notification fires (fewer oversold orders) | ~10–15% |
| **Estimated monthly value** | **~$225–$650 + downstream deflection** |

---

### Skill: Automated Dropship PO Creation Notification

> **Verdict: DEFER** — This skill and Drop Ship Partner Status Update address the same customer segment at different lifecycle stages. Used together without deduplication logic, a customer receives two messages for one drop ship order. Start with Drop Ship Partner Status Update (richer context at the moment it matters most). Add PO Creation as a second touchpoint only after the first is running and customer feedback suggests they want earlier notification.

**What it does:** When Fulfil.io automatically creates a dropship purchase order from a sales order, this skill sends the customer a notification at that moment — not when the item ships, not when tracking updates, but when the PO is created. That's the earliest possible signal that their order is moving.

**Why it matters for you:** You have 28 Shopify Collective open orders averaging 5.4 days old with no customer update. These customers are waiting in silence. This skill gives them a meaningful touchpoint the moment the fulfillment partner receives the order.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| Shopify Collective/dropship orders per month | ~28+ orders |
| "Where is my order" tickets currently generated | ~8–12/month from this category |
| Support tickets deflected | ~6–10/month |
| Cost avoided at $12/ticket | ~$70–$120/month |
| Customer satisfaction lift (reduced wait anxiety) | Qualitative |
| **Estimated monthly value** | **~$70–$120 + retention** |

---

### Skill: High-Value Order Routing Confirmation

> **Verdict: DEFER** — Lowest ROI in the Fulfil.io tier ($60–$95/month). "Your order is being prepared at [location]" is weak value relative to build cost. Activate after higher-value Fulfil.io skills have established a baseline.

**What it does:** When Fulfil.io assigns a high-value order to a specific fulfillment location, this skill sends the customer a personalized confirmation: "Your order is being prepared at [location] and will ship by [date]." This fires for orders above a configurable value threshold.

**Why it matters for you:** You have 31 open orders worth $500 or more, including two influencer orders at $1,177 and $1,220. High-value customers have higher expectations and are more likely to contact support if they feel uninformed. This skill gives your most valuable customers a premium experience automatically.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| High-value orders per month ($500+) | ~31 orders |
| Estimated "status check" tickets avoided | ~5–8/month |
| Support cost avoided at $12/ticket | ~$60–$95/month |
| High-value customer retention lift | Compounding (AOV $500+ customers are repeat buyers) |
| **Estimated monthly value** | **~$60–$95 + high-value retention** |

---

## Part 3 — Skills Available with Turn 14 API Connection

Turn 14 Distribution is your primary supplier for a portion of your catalog. They have a production-ready API that makes it possible to automate several workflows that currently require manual monitoring. Activating these skills requires connecting your Turn 14 account credentials.

---

### Skill: Turn 14 Inventory Sync

> **Verdict: INVEST** — Closes the Turn 14 visibility gap at source. No native integration exists between Turn 14 and Shopify without a custom connection.

**What it does:** On a scheduled basis (every 4 hours), this skill queries Turn 14's API for current stock levels across their 4 warehouses for the SKUs you source from them. If Turn 14 shows a SKU as out of stock, it automatically marks the corresponding Shopify product as unavailable — before a customer can order something you can't fulfill.

**Why it matters for you:** The overselling problem you have today with 3 SKUs at negative inventory is partly a Turn 14 visibility problem. When Turn 14 runs out of a SKU, Shopify doesn't know unless someone manually checks. This skill closes that loop automatically.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| SKUs currently overselling | 3+ SKUs |
| Estimated new oversold orders prevented per month | ~5–8 orders |
| Cost of processing an oversold order (refund + support + friction) | ~$45–$65/order |
| Cost avoided per month | ~$225–$520 |
| Reduction in backorder notifications created by Turn 14 stockouts | ~15–20% |
| **Estimated monthly value** | **~$225–$520 + notification reduction** |

---

### Skill: Turn 14 Dropship ETA Notification

> **Verdict: INVEST** — Fills the tracking gap that neither Fulfil.io nor Gorgias covers for Turn 14-managed fulfillment. Note: if Fulfil.io manages your Turn 14 POs directly, the Drop Ship Partner Status Update (Tier C) may already cover this. Confirm with your operator which path applies to your setup.

**What it does:** When an order is fulfilled through Turn 14's dropship program and they create a shipment, this skill queries Turn 14's tracking API and sends the customer a proactive Gorgias message within an hour of fulfillment: "Your order is on its way from our distribution partner — here's your tracking information and estimated delivery."

**Why it matters for you:** Drop ship orders currently have a 50% cancellation rate. A significant portion of that is customers who ordered, waited without any update, and cancelled. Turn 14 has tracking data available within ~1 hour of shipping. This skill delivers it to your customer automatically, at exactly the right moment.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| Turn 14 dropship orders/month | ~15–20 orders |
| "Where is my order" tickets avoided | ~8–12/month |
| Support cost avoided at $12/ticket | ~$95–$145/month |
| Cancellations prevented (customers who cancel without tracking info) | ~2–3 orders/month |
| GMV recovered at $324.60 AOV | ~$650–$975/month |
| **Estimated monthly value** | **~$745–$1,120** |

---

### Skill: Turn 14 MAP Price Monitor

> **Verdict: INVEST** — No native price monitoring exists between Turn 14 and Shopify. Manual weekly audits are the only current alternative.

**What it does:** On a weekly basis, this skill compares Turn 14's current MAP (Minimum Advertised Price) for your sourced SKUs against your Shopify product prices. If any product is priced below MAP, it sends your operations team an internal Gorgias alert to review and correct before it becomes a compliance issue with Turn 14.

**Why it matters for you:** Turn 14 adjusts MAP pricing periodically. Without visibility into those changes, prices drift — either you're leaving margin on the table or you're risking your relationship with the brand. This skill gives you a weekly catch before it becomes a problem.

**ROI Estimate**

| Assumption | Value |
|-----------|-------|
| MAP violations caught per month | ~3–5 SKUs |
| Average margin improvement from correcting under-MAP pricing | $15–$40/SKU |
| Monthly margin recovered | ~$45–$200 |
| MAP violation penalties avoided (brand relationship protection) | Qualitative |
| Time saved vs. manual weekly audit | ~2 hours/month |
| **Estimated monthly value** | **~$45–$200 + brand compliance** |

---

## Part 4 — Next-Generation Skill Opportunities

The following are not yet available on the Clarissi platform. They emerged from this analysis as genuinely novel automation opportunities — capabilities that no combination of Gorgias, Fulfil.io, Shopify, or Turn 14 approximates today. We are presenting them as future roadmap candidates, not current-sprint commitments.

---

### Opportunity A: Pre-Cancellation Retention Cohort

**The insight:** Every cancellation intervention skill in this report is reactive — it fires after a customer submits a cancellation request. But your data already contains the signal that predicts cancellations before they happen: how many days a customer has been waiting on a backordered SKU with no confirmed inbound PO.

**What this skill would do:** When Fulfil.io shows no PO confirmation for a backordered SKU after a configurable window (e.g., 10 days), Clarissi scores all waiting customers by cancellation risk — a function of days waiting, order value, and prior order history. The highest-risk cohort receives a proactive "heads-up" message before they decide to write in and cancel.

**Why it is different from anything in your stack:** This requires simultaneously querying Fulfil.io (is there a confirmed PO?), Shopify (who has open orders for this SKU, and what is their order history?), and Gorgias (have they already contacted support?). No single platform can execute this cross-system risk score. No rule in Gorgias, Shopify Flow, or Fulfil.io can trigger on PO absence.

**Estimated impact:** If 20–30% of pre-cancellation outreach prevents a cancellation, and you have ~14 high-risk orders at any given time, this could prevent 3–5 cancellations per cohort cycle before the cancellation request is ever submitted — recovering GMV before the customer has already decided to leave.

---

### Opportunity B: Supplier Reliability-Adjusted ETA Messaging

**The insight:** A precise delivery date is worse than no date if the supplier consistently misses it. Your customers are automotive enthusiasts who research carefully and remember broken promises. A conservative honest range builds more trust than a specific date that slips.

**What this skill would do:** Before any ETA notification fires (Inbound PO, Restock Date Change), Clarissi checks that supplier's historical on-time delivery rate from Fulfil.io data. If the supplier's slip rate exceeds a configurable threshold (e.g., 20%), the notification automatically uses a date range rather than a specific date: "expected in 3–7 business days" rather than "arriving March 15."

**Why it is different from anything in your stack:** This requires supplier-level historical analysis from Fulfil.io that is not surfaced in any notification or Gorgias view. It is an intelligence layer inserted into the notification pipeline itself — not a standalone notification type. Nothing in the stack can compute and apply this supplier credibility score before sending a customer message.

**Estimated impact:** Reduced false-promise rate → fewer re-contact tickets from customers whose delivery date was missed → fewer negative reviews from customers who were given a date and watched it pass.

---

### Opportunity C: Backorder Cohort Fairness Notification

**The insight:** When a PO ASN confirms and a backordered SKU is finally inbound, there may be 20+ customers waiting. The invisible question is: who gets notified, in what order, and what does the message say about fairness? This is a trust signal that most brands never think about.

**What this skill would do:** When `purchase_order.asn_confirmed` fires, Clarissi sorts all waiting customers by order date (longest wait first). Notifications are sent in sequence. The message for longest-waiters explicitly acknowledges the wait: "You've been waiting the longest — your fulfillment is prioritized." Later-waiters receive a standard restock notification.

**Why it is different from anything in your stack:** No platform creates this prioritized sequencing. Fulfil.io fulfills in its own internal order. Shopify sends no cohort-aware messages. Gorgias has no concept of a "waiting cohort." This is a customer experience innovation with no existing analog in the stack — and it turns a fundamentally negative experience (a long wait) into a trust-building moment.

**Estimated impact:** Qualitative — reduces anxiety-driven support contacts from long-waiters, creates differentiation in how a brand communicates during stock problems, and generates the kind of story a Toyota enthusiast tells their forum community.

---

### Opportunity D: Backorder-to-Pre-Order Conversion

**The insight:** For orders where Fulfil.io shows no confirmed inbound PO (meaning the restock timeline is genuinely unknown, not just delayed), the customer relationship is in limbo. They are neither a pre-order customer with an explicit commitment, nor a customer with a shipping date. This ambiguous state maximizes anxiety and surprise cancellations months later.

**What this skill would do:** When a backordered order exceeds a configurable age threshold AND Fulfil.io shows no confirmed PO for the SKU, Clarissi sends a single conversion offer: "Your item isn't in our current inbound shipments yet. We can hold your order and lock your current price as a pre-order commitment — or we can cancel now if you prefer. Just reply with your preference." Customers who reply to hold are tagged as committed pre-orders. Customers who don't reply within 72 hours receive one follow-up.

**Why it is different from anything in your stack:** This requires detecting PO absence in Fulfil.io, triggering a timed response window, and branching based on customer reply — cross-platform logic that no single tool in the stack can execute. It creates an explicit, consensual holding contract rather than leaving customers in passive limbo.

**Estimated impact:** Even at 30% conversion rate on 14 high-risk orders, that is 4–5 orders explicitly committed to completion per cycle rather than silently drifting toward cancellation. The remaining customers who choose to cancel do so on their terms — before they become frustrated enough to write reviews.

---

### Opportunity E: VIP Tiered Recovery (Enhancement to Negative Feedback Recovery)

**The insight:** A first-time buyer who had a bad experience and a repeat customer who had a bad experience require fundamentally different recovery approaches. Treating them identically undersells your relationship with your loyal Toyota community and over-invests in customers with no demonstrated loyalty.

**What this skill would do:** When a Negative Feedback ticket closes, before sending the recovery message, Clarissi queries Shopify order history for that customer. Customers with 3+ prior orders receive a VIP recovery track: a more personal message, a larger discount code, and optionally a direct contact for follow-up. First-time buyers receive a standard recovery track with a smaller offer.

**Why it is different from anything in your stack:** Gorgias Rules can send a single auto-reply template — they cannot query Shopify order count and branch on it. This multi-adapter intelligence (Gorgias event → Shopify order history lookup → conditional branching) is Clarissi-native capability.

**Estimated impact:** Higher recovery rate for high-LTV customers who are worth more to retain, more appropriate offers for new customers, and preserved brand trust with your community's most loyal buyers — the ones who post on forums and influence future purchases.

---

## Summary — ROI by Skill

### Active Recommendations (INVEST + REFRAME)

| Skill | Readiness | Est. Monthly Value | Verdict |
|-------|-----------|-------------------|---------|
| Order Cancellation Intervention | Ready (Tier B) | ~$1,800–$1,835 | REFRAME — backorder-aware layer on Gorgias AI |
| Post-Resolution Review Request | Ready (Tier B) | Compounding | INVEST — no native equivalent |
| Negative Feedback Recovery | Ready (Tier B) | ~$650–$975 | REFRAME — Shopify discount code integration is Clarissi-only |
| Partner Product Auto-Response | Ready (Tier B) | ~$120–$180 | INVEST — no Turn 14 API in Gorgias natively |
| Inbound PO ETA Update | Fulfil.io (Tier C) | ~$1,600–$2,250 | INVEST (platform advantage) |
| Restock Date Change Alert | Fulfil.io (Tier C) | ~$1,150–$1,700 | INVEST (platform advantage) — absorbs Pre-Order skill |
| Drop Ship Partner Status Update | Fulfil.io (Tier C) | ~$1,070–$1,095 | INVEST (platform advantage) |
| Turn 14 Inventory Sync | Turn 14 (Tier E) | ~$225–$520 | INVEST — closes Turn 14 visibility gap |
| Turn 14 Dropship ETA Notification | Turn 14 (Tier E) | ~$745–$1,120 | INVEST — fills tracking gap |
| Turn 14 MAP Price Monitor | Turn 14 (Tier E) | ~$45–$200 | INVEST — no native monitoring |
| **Total (conservative)** | | **~$7,400–$9,875/month** | |

### Activate After Baseline (DEFER + CLARIFY FIRST)

| Skill | Readiness | Est. Monthly Value | Verdict |
|-------|-----------|-------------------|---------|
| Oversell Prevention Alert | Fulfil.io (Tier C) | ~$225–$650 | CLARIFY FIRST — confirm Fulfil.io→Shopify sync status |
| Automated Dropship PO Notification | Fulfil.io (Tier C) | ~$70–$120 | DEFER — add after Drop Ship Status is running |
| High-Value Order Routing Confirmation | Fulfil.io (Tier C) | ~$60–$95 | DEFER — weakest ROI, activate last |

### Not Recommended

| Skill | Verdict | Reason |
|-------|---------|--------|
| Pre-Fulfillment Address Edit | DROP | Gorgias AI 2.0 already does this end-to-end |
| Pre-Order Expected Ship Date Update | CONSOLIDATED | Merged into Restock Date Change Alert |

### Next-Generation Opportunities (Part 4 — Future Skills)

| Opportunity | Estimated Impact |
|-------------|-----------------|
| Pre-Cancellation Retention Cohort | 3–5 cancellations prevented per cohort cycle before request is made |
| Supplier Reliability-Adjusted ETA Messaging | Reduced false-promise rate, fewer re-contact tickets |
| Backorder Cohort Fairness Notification | Trust differentiation for long-waiters, reduced anxiety contacts |
| Backorder-to-Pre-Order Conversion | 4–5 ambiguous backorders converted to explicit commitments per cycle |
| VIP Tiered Negative Recovery | Higher recovery rate for 3+ order customers, appropriate offers for new buyers |

---

## Recommended Activation Sequence

**Pre-Step — One question before you build (1 day, no build required):**
Confirm with your Fulfil.io account manager: is real-time inventory sync to Shopify active? This determines whether Oversell Prevention Alert is needed as a primary fix or a secondary edge-case safeguard.

**Step 1 — Activate now (Tier B, 2–3 weeks to implement):**
1. Order Cancellation Intervention — highest immediate GMV recovery; directly addresses your 34% backorder-cancel rate with backorder-aware context Gorgias cannot provide
2. Partner Product Auto-Response — lowest effort; eliminates the manual Turn 14 lookup-and-reply loop

**Step 2 — Activate with Fulfil.io go-live (Tier C):**
3. Inbound PO ETA Update — converts 155 backordered orders from a liability into a communications advantage; fires days before Shopify knows about the shipment
4. Restock Date Change Alert — closes the gap on 61 orders that are 7+ days old with no update (absorbs the Pre-Order Ship Date Update use case)
5. Drop Ship Partner Status Update — directly addresses the 50% drop ship cancellation rate

**Step 3 — Activate with Turn 14 credentials (Tier E):**
6. Turn 14 Inventory Sync — prevents overselling at the Turn 14 source before it creates a backorder
7. Turn 14 Dropship ETA Notification — automatic tracking delivery for Turn 14-fulfilled orders

**Step 4 — Add after baseline is established:**
- Negative Feedback Recovery (with VIP tiering enhancement if desired)
- Post-Resolution Review Request
- Automated Dropship PO Notification (second dropship touchpoint, after Drop Ship Status is running)
- Oversell Prevention Alert (if sync clarification reveals an ongoing gap)
- Turn 14 MAP Price Monitor
- High-Value Order Routing Confirmation

**Step 5 — Future roadmap (Part 4 opportunities):**
Discuss with your Clarissi operator after the first 90-day baseline review.
- Pre-Cancellation Retention Cohort — highest strategic value; prevents cancellations before they happen
- Backorder-to-Pre-Order Conversion — converts limbo backorders into explicit commitments
- VIP Tiered Negative Recovery — enhances existing recovery skill with Shopify order history intelligence
- Supplier Reliability-Adjusted ETA Messaging — intelligence layer on top of Fulfil.io notifications
- Backorder Cohort Fairness Notification — trust differentiator for long-waiters

---

*All ROI figures are estimates based on your actual Shopify and Gorgias data as of March 2026. Actual outcomes will vary. Your Clarissi operator will establish baselines in Month 1 and measure against them in monthly reviews.*
