# Automation Readiness Report — [CUSTOMER NAME]

**Prepared by:** [OPERATOR NAME], Clarissi
**Date:** [DATE]
**Data window:** 90 days ([START DATE] – [END DATE])
**Tickets analyzed:** [N] tickets across Gorgias
**Integrations assessed:** Shopify, Gorgias

---

## Section 1 — Current Exposure

> *Operator: Fill from the `ticket_categories[]` array in the Assessment JSON. Lead with the 2–3 highest-volume categories.*

### Ticket Volume Breakdown (Last 90 Days)

| Category | Tickets | % of Total | Channel | Open Rate | Automation Readiness |
|----------|---------|-----------|---------|-----------|---------------------|
| [Category 1] | [N] | [X]% | Email | [X]% | High / Medium / Low |
| [Category 2] | [N] | [X]% | Email | [X]% | High / Medium / Low |
| [Category 3] | [N] | [X]% | Email | [X]% | High / Medium / Low |
| *(additional rows)* | | | | | |

**Total tickets in window:** [N]
**Tickets in automatable categories:** [N] ([X]% of total)

### Shopify Exposure

> *Operator: Fill from `shopify__analyze_backorder_history` output.*

- Orders with backordered items (90 days): **[N] orders**
- Estimated monthly backorder ticket volume: **[N] tickets/month**
- Top backordered SKUs: [SKU 1], [SKU 2], [SKU 3]

---

## Section 2 — Skills Match Matrix

> *Operator: Fill from `activation_gaps[]` and coverage analysis. List all 4 skills — mark which are immediately activatable.*

The following skills are available on the Clarissi platform. Based on your current integrations and ticket data, here is what applies to your store today:

| Skill | What It Does | Est. Monthly Fires | Status | Requires |
|-------|-------------|-------------------|--------|----------|
| **Backorder Notification** | Notifies customers automatically when their order contains a backordered item — before they ask | [N]/month | ✅ Ready to activate | Shopify ✅  Gorgias ✅ |
| **Low Stock Customer Impact** | When inventory hits zero, identifies open orders with that item and notifies each affected customer proactively | [N]/month | ✅ Ready to activate | Shopify ✅  Gorgias ✅ |
| **High-Risk Order Response** | When Shopify flags an order for fraud risk, alerts your team and optionally notifies the customer | [N]/month | ⚠️ Needs Slack | Shopify ✅  Slack ❌ |
| **Delivery Exception Alert** | When a carrier reports a delivery exception, notifies the affected customer with next steps | [N]/month | ⚠️ Needs AfterShip | AfterShip ❌ |

> **Skills 3 and 4 become available once you connect Slack (for internal team alerts) and AfterShip (for delivery tracking). Your operator will flag these as expansion opportunities in future monthly reviews.**

### Activation Gaps

The following skills can be activated today with no additional setup:

1. **Backorder Notification** — [N] estimated fires/month based on your 90-day backorder history
2. **Low Stock Customer Impact** — [N] estimated fires/month based on your inventory event frequency

---

## Section 3 — Skill Gap Analysis

> *Operator: Fill from `gap_candidates[]`. List P1 and P2 candidates. Keep language customer-facing — no internal jargon.*

Beyond the existing skill catalog, we identified the following ticket categories where automation may be possible but no current skill template exists:

### Priority 1 — High Volume + High Automation Readiness

| Category | Monthly Volume | What Automation Would Look Like |
|----------|---------------|--------------------------------|
| [Gap Category 1] | ~[N]/month | [Plain-English description of trigger + action hypothesis] |

### Priority 2 — Medium Volume or Lower Readiness

| Category | Monthly Volume | Notes |
|----------|---------------|-------|
| [Gap Category 2] | ~[N]/month | [Brief note — e.g. "Mixed signals, would need tag cleanup first"] |

> These gap candidates represent future expansion opportunities. As your Concierge operator, we'll evaluate these in monthly check-ins and propose new skills as the catalog grows.

---

## Section 4 — ROI Projection

> *Operator: Use conservative deflection rates. For backorder notification, 60–70% deflection rate is typical. For low-stock, 40–50%. Adjust based on Yota's actual ticket patterns.*

### Assumptions

- Average cost of a human-handled support ticket: **$5.00**
- Backorder Notification deflection rate: **65%** (industry baseline — we'll measure your actual rate in Month 1)
- Low Stock Impact deflection rate: **45%**

### Monthly Value Estimate

| Skill | Monthly Fires | Deflection Rate | Deflected Tickets | Value Saved |
|-------|--------------|----------------|-------------------|-------------|
| Backorder Notification | [N] | 65% | ~[N × 0.65] | ~$[N × 0.65 × 5] |
| Low Stock Impact | [N] | 45% | ~[N × 0.45] | ~$[N × 0.45 × 5] |
| **Total** | | | **~[sum]** | **~$[sum]** |

### Concierge Investment vs. Return

| | Month 1 | Ongoing |
|--|---------|---------|
| **Base retainer (Standard)** | $1,500 | $1,500/month |
| **Outcome fee** | ~$[deflections × $2.50] | ~$[deflections × $2.50]/month |
| **Assessment credit** | −$1,500 | — |
| **Net cost** | **~$[outcome fee only]** | **~$[retainer + outcome fee]** |
| **Labor cost avoided** | **~$[total value]** | **~$[total value]/month** |

> *Outcome fees begin once we agree on your 90-day historical baseline. We'll walk through the numbers on your first monthly check-in call.*

### Payback Summary

> [2–3 sentence plain-English summary. Example: "Based on your current backorder volume, activating Backorder Notification alone is projected to save your team approximately 45 hours of manual ticket handling per month — roughly $225 in support labor at industry average rates. The Concierge Standard retainer pays back within [X] months of activation."]

---

## Recommendation

**Recommended tier:** Concierge Standard ($1,500/month base)

**Rationale:** [2–3 sentences. Example: "Your ticket volume ([N]/month) and stack complexity (Shopify + Gorgias) are well-suited to the Concierge model. Two skills are ready to activate today. Your operator will tune thresholds in the first 30 days and monitor outcomes weekly."]

**Immediate next steps:**
1. Confirm credentials (Shopify custom app + Gorgias API key) — [LINK TO ONBOARDING GUIDE]
2. Sign Concierge MSA — [LINK]
3. Operator activates Backorder Notification + Low Stock Impact within 48 hours of credential receipt
4. First monthly check-in: [DATE]

---

## Appendix — Operator Notes

> *Internal only — do not share this section with the customer.*

**Ticket clustering quality:** [High / Medium / Low — note if tag consistency was low and clustering was subject-line-based]

**Ambiguous categories:** [List any ticket clusters that required subjective judgment]

**Questions to validate with customer:**
- [Question 1 — e.g. "Confirm whether they manually tag backorder tickets or if it's automatic"]
- [Question 2]

**Data limitations:** [Note if ticket sample was small (<50), or if customer has >500 tickets/month and sample covers <7 days]

**Gap candidate follow-up:** [Any P1 gap candidates worth proposing as custom skill development — include estimated operator hours to build]
