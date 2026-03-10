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
Phase 0 (Week 1–2)   Website live + Shopify Partner account
Phase 1 (Week 2–6)   App Store readiness (OAuth, billing, listing)
Phase 2 (Week 6–8)   Shopify App Store submission + review
Phase 3 (Month 3+)   Technology Partner Track + agentic ecosystem
Phase 4 (Month 4–6)  A2A integration + outcome-based pricing
Phase 5 (Month 6+)   Platform Intelligence Layer + predictive intelligence
```

The website (Phase 0) is a prerequisite for App Store submission — Shopify requires a public-facing app URL, privacy policy, and terms of service page before review.

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

### Required pages (for App Store submission)

| Page | URL | Purpose |
|------|-----|---------|
| Home / Marketing | `/` | Conversion + App Store link |
| Privacy Policy | `/privacy` | Required by Shopify |
| Terms of Service | `/terms` | Required by Shopify |
| Contact / Support | `/support` | Required by Shopify |

### Home Page Structure

```
HERO
  Headline: "Operational automation for Shopify teams"
  Sub: "Skills that run 24/7 — backorder alerts, risk responses,
        inventory notifications — without human initiation."
  CTA: [Install on Shopify] [See how it works ↓]
  Trust: "Built for Shopify · Gorgias · Fulfil"

HOW IT WORKS (3 steps)
  1. Connect your store (OAuth — 60 seconds)
  2. Activate a skill (pre-built for your stack)
  3. It runs automatically (see cost before you go live)

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
  Privacy Policy · Terms · Support · [Shopify App Store link]
```

### Messaging principles from blue ocean analysis

- Lead with **outcomes**, not features: "Customers notified before they contact you" not "Shopify webhook processing"
- Highlight **simulation**: this is the unique differentiator no competitor has
- Contrast with manual: "Every automatically-created ticket is one your team didn't have to notice, investigate, and write"
- Keep e-commerce specific — don't generalize to "any business" at launch

---

## Phase 1: Shopify App Store Readiness (Weeks 2–6)

**Goal:** App passes Shopify's review checklist. All technical and listing requirements met.

### Technical Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| Shopify OAuth flow | Build | Merchant installs → redirected to OAuth → tokens stored per-account |
| Shopify Billing API | Build | Charge subscription through Shopify (required for App Store) |
| HTTPS on app.clarissi.com | Done (Phase 0) | |
| Merchant data isolation | Verify | Each merchant's data scoped to their shop domain |
| Privacy policy page | Build (Phase 0) | Must be live and linked from app |
| Terms of service page | Build (Phase 0) | |
| Support contact | Build | `support@clarissi.com` or support form at `/support` |
| App icon | Design | 1200×1200px, JPEG or PNG, no rounded corners (Shopify adds them) |

### Shopify OAuth Integration

The shopify-backorder package already has Shopify webhook handling. The App Store version needs a full OAuth install flow:

```
Merchant clicks "Install" on App Store
  → Shopify redirects to https://app.clarissi.com/auth/shopify?shop=merchant.myshopify.com
  → App redirects to Shopify OAuth consent screen
  → Merchant approves scopes
  → Shopify redirects to https://app.clarissi.com/auth/shopify/callback?code=xxx&shop=xxx
  → App exchanges code for access token
  → Token stored per shop domain in DB
  → Merchant lands on Clarissi dashboard
```

Required OAuth scopes (start minimal, add as needed):
- `read_orders` — for backorder detection
- `read_inventory` — for low-stock checking
- `read_products` — for product context

### Shopify Billing API

Shopify requires apps to use their billing API for charging merchants — cannot use Stripe directly for subscription revenue from App Store installs.

```
On install → create RecurringApplicationCharge via Shopify Billing API
Merchant approves charge → webhook confirms
Plans:
  Starter: $0/month (100 ops included, then $2/1,000 ops)
  Professional: $49/month (50,000 ops included)
  Scale: $149/month (200,000 ops included)
```

### App Store Listing Requirements

| Asset | Spec | Notes |
|-------|------|-------|
| App icon | 1200×1200px JPG/PNG | No transparency |
| Screenshots | 1600×900px, up to 8 | Show key flows: dashboard, skill activation, cost preview |
| Demo video | Optional but strongly recommended | 30–90 seconds showing the simulation flow |
| App name | "Clarissi — Operational Automation" | Keep under 30 chars ideally |
| Tagline | ≤100 chars | "24/7 backorder alerts, risk responses, and inventory notifications for Shopify" |
| Description | Up to 2,048 chars | Benefits-led, not feature-led |
| Primary category | Operations | |
| Emergency contact | Required | Email + phone |

---

## Phase 1 Milestones

| Milestone | Target | Done |
|-----------|--------|------|
| Shopify OAuth install flow working on dev store | Week 3 | |
| Shopify Billing API integrated (test mode) | Week 4 | |
| App icon and screenshots created | Week 4 | |
| Full install-to-activation flow tested end-to-end | Week 5 | |
| App store listing draft complete | Week 5 | |
| Legal pages (privacy, terms) finalized | Week 5 | |

---

## Phase 2: Submission and Review (Weeks 6–8)

**Goal:** App live in Shopify App Store.

### Submission Checklist

- [ ] App installs cleanly on a test store (no errors, no broken screens)
- [ ] Core feature (backorder skill activation) works end-to-end
- [ ] Billing plan selection works in test mode
- [ ] Privacy policy URL live and linked in app settings
- [ ] Terms of service URL live
- [ ] Support contact reachable
- [ ] App icon uploaded (1200×1200px)
- [ ] At least 3 screenshots uploaded
- [ ] App listing description written
- [ ] Emergency developer contact added

### Review Timeline

Shopify App Store review typically takes **3–7 business days** for initial review. Common rejection reasons:
- Install flow errors or broken redirects
- Missing privacy policy or terms
- Features described in listing not working
- Billing not implemented or bypassed

Plan for one revision cycle — budget 2 weeks total for submission + review + any fixes.

### Phase 2 Milestones

| Milestone | Target | Done |
|-----------|--------|------|
| Submit app for review | Week 6 | |
| Address any review feedback | Week 7 | |
| App live in Shopify App Store | Week 8 | |
| First external merchant installs | Week 8–9 | |

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

## Phase 5: Platform Intelligence + Predictive (Month 6+)

Based on ADR-012 (Platform Intelligence Layer):
- Recommendation engine: "merchants like you activated these skills"
- Pattern-based alerts: enrichment step failure rates, volume overruns, stale conditions
- Predictive preparation: forecast inventory-zero events from velocity data, pre-stage notification drafts

---

## Goals Summary

| Timeframe | Goal |
|-----------|------|
| Week 2 | `clarissi.com` live, Shopify Partner account active |
| Week 8 | App in Shopify App Store, first external installs |
| Month 3 | Technology Partner Track application submitted |
| Month 4 | A2A integration, Shopify agentic ecosystem listing |
| Month 6 | Outcome-based pricing available, Intelligence Layer Phase 1 live |
| Month 12 | Predictive intelligence, multi-vertical adapter coverage |

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