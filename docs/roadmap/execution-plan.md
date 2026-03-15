# Clarissi — Execution Plan
**Updated:** March 2026

## Brand
- **Product name:** Clarissi
- **Marketing site:** www.clarissi.com
- **Application:** app.clarissi.com
- **Infrastructure:** Cloudflare DNS + Pages (marketing), Railway (app), Cloudflare proxy (app subdomain)

---

## Strategic Sequence

```
Phase 0 (Week 1–2)   Website live + Shopify Partner account + infrastructure
Phase 1 (Week 2–6)   Concierge launch readiness (onboarding, Assessment agent, outcome measurement P0+P1)
Phase 2 (Week 6–8)   First Concierge clients + operator playbook v1
Phase 3 (Month 3+)   Technology Partner Track + agentic ecosystem
Phase 4 (Month 4–6)  A2A integration + outcome-based pricing (automated)
Phase 5 (Month 6+)   Platform Intelligence Layer + self-serve distribution (customer-facing BYOM/skill creation unlocked here)
```

**Strategy shift (March 2026):** Primary GTM is Concierge (managed service), not Shopify App Store listing. See [ADR-013: SEAN Concierge GTM](../decisions/013-sean-concierge-gtm.md) for rationale. App Store distribution is deferred to Phase 5+ when self-serve becomes the deliberate strategy. Shopify Billing API integration is not required until then — Clarissi bills via Stripe invoice, which avoids App Store revenue share requirements entirely.

---

## Phase 0: Foundation (Week 1–2)

**Goal:** www.clarissi.com live, app.clarissi.com pointed at the app, Shopify Partner account created.

### Track A — www.clarissi.com via Cloudflare Pages

Cloudflare Pages is the fastest path since the domain is already on Cloudflare. Setup takes under an hour.

**Steps:**

1. **Create GitHub repo** `clarissi-www` (public or private — Pages supports both)

2. **Initialize with Astro** (recommended for SaaS landing pages — static output, fast builds, good SEO templates)
   ```bash
   npm create astro@latest clarissi-www
   # Choose: Use a template → select a minimal or portfolio template
   # Adjust for SaaS marketing content
   ```
   Alternatively: use plain HTML/Tailwind if moving fast is more important than maintainability.

3. **Deploy to Cloudflare Pages**
   - Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
   - Select `clarissi-www` repo
   - Build settings:
     - Framework preset: Astro
     - Build command: `npm run build`
     - Build output directory: `dist`
   - Deploy — first build takes ~90 seconds

4. **Add custom domain**
   - Pages project → Custom Domains → Set up a custom domain
   - Enter: `clarissi.com` (and add `www.clarissi.com` as a second domain)
   - Since DNS is already on Cloudflare, it adds the CNAME records automatically
   - SSL certificate issued in ~1 minute

5. **Add redirect:** `www.clarissi.com` → `clarissi.com` (or vice versa — pick canonical and be consistent)

**Exit criteria:** `https://clarissi.com` loads the marketing page. PR-based deployments preview on `*.pages.dev` before going live.

---

### Track B — app.clarissi.com via Cloudflare + Railway

1. **Deploy PA Core cloud to Railway**
   - Create a Railway service from the `packages/cloud` directory
   - Set environment variables (DATABASE_URL, REDIS_URL, JWT_SECRET, etc.)
   - Railway generates a URL: `clarissi-app.up.railway.app`

2. **Add custom domain in Railway**
   - Railway service → Settings → Domains → Add custom domain: `app.clarissi.com`
   - Railway shows a CNAME target

3. **Configure Cloudflare DNS**
   - DNS → Add record:
     - Type: `CNAME`
     - Name: `app`
     - Target: `clarissi-app.up.railway.app`
     - Proxy: **Orange cloud ON** (Cloudflare proxy)
   - SSL/TLS mode: Set to **Full** (not Full Strict — Railway's cert is managed by them)

4. **Verify:** `https://app.clarissi.com` loads the app with HTTPS

**Note on Cloudflare + Railway:** Cloudflare proxy provides DDoS protection, CDN edge caching (for static assets), and hides Railway's origin IP. Railway handles the origin certificate.

---

### Track C — Shopify Partner Account

1. **Create partner account:** [partners.shopify.com](https://partners.shopify.com)
2. **Create a development store** for testing during app development
3. **Register a new app** in the Partner Dashboard → Apps → Create app
   - App name: Clarissi
   - App URL: `https://app.clarissi.com`
   - Redirect URLs: `https://app.clarissi.com/auth/shopify/callback`

---

## Phase 0 Milestones

| Milestone | Target | Done |
|-----------|--------|------|
| `clarissi.com` live on Cloudflare Pages | Day 2 | |
| `app.clarissi.com` proxied via Cloudflare | Day 3 | |
| Shopify Partner account created | Day 3 | |
| Marketing page content complete | Day 7 | |
| Privacy policy + Terms of Service pages live | Day 10 | |

---

## www.clarissi.com Page Plan

### Required pages

| Page | URL | Purpose |
|------|-----|---------|
| Home / Marketing | `/` | Conversion — Assessment CTA |
| Privacy Policy | `/privacy` | Required for all customer engagements |
| Terms of Service | `/terms` | Required for Concierge MSA reference |
| Contact / Support | `/support` | Inbound inquiries + Concierge onboarding |

### Home Page Structure

```
HERO
  Headline: "Operational automation for Shopify teams"
  Sub: "Skills that run 24/7 — backorder alerts, risk responses,
        inventory notifications — without human initiation."
  CTA: [Get your Skills Assessment] [See how it works ↓]
  Trust: "Built for Shopify · Gorgias · Fulfil"

HOW IT WORKS (3 steps)
  1. We analyze your Shopify + Gorgias data (Skills Assessment)
  2. We activate the right skills for your stack (Concierge setup)
  3. It runs automatically — we tune it weekly, you see results monthly

SKILLS PREVIEW
  → Backorder Notification (Shopify + Gorgias)
  → Low-Stock Customer Impact
  → High-Risk Order Response
  [Browse all skills →]

SIMULATION CALLOUT (key differentiator)
  "See the outcome and the cost before you activate anything."
  Screenshot/mockup of cost preview screen

PRICING TEASER
  Starter · Professional · Scale
  [See pricing →] or simple 3-column table

FOOTER
  Privacy Policy · Terms · Support · hello@clarissi.com
```

### Messaging principles from blue ocean analysis

- Lead with **outcomes**, not features: "Customers notified before they contact you" not "Shopify webhook processing"
- Highlight **simulation**: this is the unique differentiator no competitor has
- Contrast with manual: "Every automatically-created ticket is one your team didn't have to notice, investigate, and write"
- Keep e-commerce specific — don't generalize to "any business" at launch

---

## Phase 1: Concierge Launch Readiness (Weeks 2–6)

**Goal:** Infrastructure ready to onboard first Concierge clients. Assessment agent running against live customer data. Outcome measurement P0+P1 in place.

### Concierge Onboarding Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| Operator credential setup checklist | Build | Step-by-step guide for operator to configure customer Shopify + Gorgias credentials |
| Webhook registration verification | Done | Shopify custom app creation documented in `shopify-order-adapter.ts` setup guide |
| HTTPS on app.clarissi.com | Done (Phase 0) | |
| Merchant data isolation | Done | Per-account encrypted credential storage in `mcp_credentials` |
| Privacy policy + Terms of Service | Done (Phase 0) | Live at `/privacy` and `/terms` |
| Operator playbook v1 | Build | 10 hrs/client/month breakdown, weekly review checklist, monthly report template |

### Assessment Agent (P3)

The Skills Assessment is the primary sales motion. The Shopify leg is already built via existing MCP tools.

**What's needed:**

1. **`gorgias_get_tickets` MCP tool (1 week):**
   - Pull last 90 days of tickets from Gorgias API
   - Return: ticket count by category/tag, volume trend (week-over-week)
   - Credential injection follows existing per-request pattern (`X-Gorgias-Domain`, `X-Gorgias-API-Key` headers)

2. **Skills Gap Analysis prompt (1 week):**
   - System prompt that instructs LLM to: map ticket categories against skill catalog, identify unmatched high-volume categories, propose candidate skills for each gap
   - Output format: structured JSON → operator converts to PDF

3. **Manual mode (now, before tool is built):**
   - Operator uses Claude Desktop with Shopify MCP tools connected
   - Manually pulls Gorgias ticket data via API (curl or Postman), pastes into context
   - LLM generates report draft; operator assembles PDF from template

### Outcome Measurement P0 — Gorgias Deflection Counting (4 weeks)

After a skill fires, verify the corresponding Gorgias ticket was not created:
- Post-execution: call Gorgias API to check for ticket creation in matching category within 24 hours
- Store result in `skill_executions.result JSONB` as `{ deflected: boolean, verifiedAt: timestamp }`
- Expose via existing `GET /v1/me/skills/:id/executions` endpoint with deflection totals added

**Files:** `packages/cloud/src/api/gateway.ts`, `packages/cloud/src/integrations/gorgias/`

### Outcome Measurement P1 — Baseline Storage (2 weeks)

90-day pre-activation ticket volume per category, stored as baseline for outcome fee attribution:
- At skill activation, pull 90-day Gorgias ticket volume for matching categories
- Store in `user_skills.configuration JSONB` as `{ baseline: { category: string, volume: number, measuredAt: timestamp }[] }`
- Delta calculation at invoice time: current deflection rate − pre-activation baseline rate = attributable deflection

**Files:** `packages/core/src/types/skill.ts`, `packages/cloud/src/skills/skill-dispatcher.ts`

---

## Phase 1 Milestones

| Milestone | Target | Done |
|-----------|--------|------|
| Operator onboarding checklist documented | Week 2 | |
| First Skills Assessment run manually (Yota or prospect) | Week 3 | |
| `gorgias_get_tickets` MCP tool built and tested | Week 4 | |
| Gorgias deflection counting (P0) deployed | Week 5 | |
| Baseline measurement (P1) deployed | Week 5 | |
| Operator playbook v1 documented | Week 5 | |
| IP separation clause + named competitor exclusion signed with Track 1 customers | Week 2 | |

---

## Phase 2: First Concierge Clients (Weeks 6–8)

**Goal:** 2–3 Concierge clients onboarded, paying, and receiving monthly outcome reports. Operator dashboard in place.

### Concierge Client Targets

- Convert 1–2 Track 1 relationships (Yota) to Concierge retainer at $2,000/month base
- Deliver 3 Skills Assessments to qualified prospects; target 2 Concierge conversions
- All clients: outcome fee structure documented in MSA, 90-day baseline measurement started

### Operator Dashboard (P2) — 3–4 weeks

Multi-client view for the PA Core operator:
- Table: all Concierge clients, execution counts last 30 days, deflection totals, last-active skill, trend vs. prior month
- Flag: clients whose deflection rate dropped (needs attention)
- One-click monthly report generation: pulls from execution history, formats as structured summary
- Billing calculation: baseline delta × outcome fee rate = outcome fee owed per client

**Files:** `packages/web/src/pages/BillingPage.tsx` (extend for operator multi-client view)

### Phase 2 Milestones

| Milestone | Target | Done |
|-----------|--------|------|
| First Concierge retainer signed | Week 6 | |
| 3 Skills Assessments delivered | Week 7 | |
| 2 Assessment-to-Concierge conversions | Week 7–8 | |
| Operator dashboard (P2) deployed | Week 8 | |
| First monthly outcome reports delivered to all clients | Month 3 | |

---

## Phase 3: Technology Partner Track (Month 3+)

**Goal:** Accepted into Shopify's Technology Partner Program for co-marketing, conference access, and agentic ecosystem partnership.

### Qualification Requirements

Shopify's Technology Partner Track requires:
- Active app in the App Store
- Demonstrated merchant adoption (installs + engagement)
- Revenue through Shopify Billing

Apply at: Shopify Partner Dashboard → Partner Program → Technology Track application

### Agentic Ecosystem Partnership

Shopify announced Q1 2026 partner recruitment for agentic commerce apps. Target:
- Integration with Shopify's Sidekick (Clarissi skills surfaced as Sidekick context)
- Listing as an "agentic app" in Shopify's new agentic commerce directory
- MCP integration: expose Clarissi's operational skills as tools Shopify's Sidekick can delegate to

---

## Phase 4: A2A Integration + Outcome-Based Pricing (Month 4–6)

Based on [ADR-013 evolution paths analysis]:

**A2A Integration**
- Expose active skills as A2A-addressable agents
- Any orchestrator agent (Claude Desktop, Agentforce, etc.) can delegate operational tasks to Clarissi skills via A2A
- PA Core skill becomes the execution layer for the multi-agent ecosystem

**Outcome-Based Pricing**
- Add outcome tracking: Gorgias ticket created → resolved within SLA → no repeat contact
- Optional pricing tier: pay per outcome (deflected contact), not per operation
- Intelligence Layer (ADR-012) tracks resolution to confirm outcomes

---

## Phase 5: Platform Intelligence + Self-Serve Distribution (Month 6+)

Based on ADR-012 (Platform Intelligence Layer):
- Recommendation engine: "merchants like you activated these skills"
- Pattern-based alerts: enrichment step failure rates, volume overruns, stale conditions
- Predictive preparation: forecast inventory-zero events from velocity data, pre-stage notification drafts
- **Customer-facing skill creation (BYOM):** self-serve skill building via Claude Desktop unlocked in this phase — intentionally deferred from Phases 1–4 while Concierge model is validated and operator tooling matures (see ADR-005)

---

## Goals Summary

| Timeframe | Goal |
|-----------|------|
| Week 2 | `clarissi.com` live, Shopify Partner account active, IP agreements signed with Track 1 customers |
| Week 3 | First Skills Assessment delivered (manually, using existing MCP tools) |
| Week 6 | First Concierge retainer signed; Gorgias deflection counting (P0) deployed |
| Week 8 | 3 Concierge clients at $2,000/month avg; operator dashboard live |
| Month 3 | First monthly outcome reports delivered; Technology Partner Track application submitted |
| Month 4 | A2A integration, Shopify agentic ecosystem listing; outcome fees begin (post-90-day baseline) |
| Month 6 | Automated Assessment report generator; $20K MRR from Concierge |
| Month 12 | 15–20 Concierge clients at $45–80K MRR; 2 operators; agency platform pilots |
| Year 2+ | Self-serve distribution; Shopify App Store listing; multi-vertical expansion |

---

## Cloudflare Quick Reference

```
www.clarissi.com  → Cloudflare Pages (marketing site, GitHub auto-deploy)
app.clarissi.com  → CNAME → Railway URL, Cloudflare proxy ON, SSL: Full
```

**SSL/TLS settings (Cloudflare Dashboard → SSL/TLS):**
- Mode: Full (not Strict) for Railway origin
- Always Use HTTPS: On
- Minimum TLS: 1.2

**Pages auto-deploy:**
- Every push to `main` → production deploy
- Every PR → preview deploy on `*.pages.dev` URL
- Deploy hooks available for manual triggers