# ADR-018: Operator Platform — Identity Model, Credential Intake, and Management Mode Lifecycle

## Status
Accepted

## Context

PA Core is a multi-tier platform with three customer journeys: Skills Assessment, Self-Serve, and Concierge (see ADR-016). The Concierge tier requires a first-class "operator" entity that can manage multiple customer organizations, provision credentials on their behalf, run Skills Assessments, and activate/configure skills for customers.

Prior to this ADR, "operator" was a business role referenced only in documentation. The platform had no operator concept in its data model, no mechanism for operators to manage multiple customers, and no secure path for a customer to submit their API credentials without direct platform access.

Three sub-problems required architectural decisions:

1. **Operator identity**: How do operators differ from regular users and org admins?
2. **Credential intake**: How does a customer securely hand off their Shopify/Gorgias credentials to an operator who will manage them?
3. **Management mode lifecycle**: How does the platform enforce the boundary between operator-managed (Concierge) and customer-managed (Self-Serve) states?

---

## Decision

### 1. Operator Identity: Boolean Flag + Separate Join Table

Operators are regular `users` with `is_operator = true` added to the `users` table. This mirrors the existing `is_admin` boolean pattern (Migration 008) rather than introducing a `user_type` enum.

**Rejected alternative — `user_type ENUM('user', 'operator', 'admin')`:** Enums are harder to migrate and prevent a user from being both admin and operator. The boolean pattern is simpler and consistent with existing code.

Operators are linked to customer orgs via a separate `operator_customers` join table rather than `org_members`:

```sql
CREATE TABLE operator_customers (
  id          VARCHAR(255) PRIMARY KEY,
  operator_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (operator_id, org_id)
);
```

**Why not `org_members`?** Operators must not appear in a customer's "Members" list — they are external Clarissi staff, not org participants. Using `org_members` would give operators org admin visibility and pollute the customer's member management panel. The separate table enforces the correct semantics: one operator can manage many customer orgs; one customer org can only have one assigned operator.

**Authorization enforcement**: Every operator route performs a live DB check via `assertOperatorOwnsOrg(operatorId, orgId, db)` — not a JWT claim check alone. The `requireOperator` middleware also re-checks `is_operator` from the DB on every request. This means operator revocation takes effect immediately, not after JWT expiry.

### 2. Credential Intake: One-Time Token with SHA-256 Hash

The operator generates a one-time intake URL for each customer:

```
https://app.clarissi.com/onboard/<rawToken>
```

The raw token is `randomBytes(32)` (256-bit). Only the SHA-256 hash is stored in `credential_intake_tokens`. The raw token is returned to the operator exactly once and never stored. Customers visit the URL, submit their Shopify and Gorgias API credentials via a web form, and Clarissi encrypts and stores them.

**Token lifecycle columns:**
- `opened_at` — set when the customer first GETs the intake URL (link-click tracking)
- `used_at` — set atomically when the customer POSTs credentials (submission)
- `expires_at` — 7 days from generation

**Atomic consumption** — the POST handler uses a single `UPDATE...WHERE used_at IS NULL RETURNING` to both check and consume the token. PostgreSQL row-level locking ensures only one concurrent submission can succeed, preventing TOCTOU races.

**Bot protection** — Cloudflare Turnstile is required on form submission. The backend verifies the Turnstile token server-side. Dev mode (no `CF_TURNSTILE_SECRET`) bypasses verification; production must have the env var set.

**Credential field mapping** — credentials are stored with the field names that adapters expect:
- Shopify: `{ storeDomain, clientId, clientSecret }` → `ShopifyOrderAdapter` reads these
- Gorgias: `{ subdomain, email, apiKey }` → `GorgiasNotificationAdapter` reads these

Stored via `CredentialManager.storeCredentials({ type: 'org', orgId }, serverId, credentials)` — credentials are org-scoped, not user-scoped.

**Partial state persistence** — the intake form saves `shopifyDomain`, `gorgiasDomain`, and `gorgiasEmail` to `localStorage` (keyed by token) so that if the user switches tabs to retrieve credentials, the non-secret fields are preserved on return. API keys and secrets are explicitly never saved to `localStorage`.

**Operator notification** — no email infrastructure. The operator dashboard shows intake token status (`opened_at` / `used_at`) and a pending badge for customers who have submitted credentials but are not yet onboarded. The operator copies a pre-written email draft from the dashboard to send via their own email client.

### 3. Management Mode Lifecycle

Each customer org has a `customer_profiles` row with `management_mode: 'concierge' | 'self_managed'`.

```sql
CREATE TABLE customer_profiles (
  org_id          VARCHAR(255) PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  management_mode VARCHAR(20) NOT NULL DEFAULT 'concierge'
                  CHECK (management_mode IN ('concierge', 'self_managed')),
  onboarded_at    TIMESTAMPTZ,
  notes           TEXT,         -- operator-private
  handoff_notes   TEXT,         -- surfaced to customer on self-managed transition
  ...
);
```

**Concierge mode**: Operator has exclusive write access to skills for this customer. `assertOperatorWriteAccess` enforces this at the DB level — not via JWT claims. Skills page shows a "Managed by Clarissi" badge with the operator's name and email (fetched from `GET /v1/organizations/:orgId/operator-contact`).

**Self-managed mode**: Operator write access is blocked. Customer org admins manage their own skills. On transition, `handoff_notes` is surfaced to the customer as a dismissible banner on the Skills page on their next login (`localStorage` key `handoff-dismissed-{orgId}` tracks dismissal).

**Mode changes** are operator-initiated only via `PUT /v1/operator/customers/:orgId/mode`. No email is sent. The change takes effect on the customer's next page load (the operator contact endpoint returns the current mode, which controls badge/banner rendering).

---

## Consequences

### Positive
- Operators can manage many customer orgs from a single dashboard without appearing in any customer's member list
- Credential submission is one-time, secure, and auditable (token status visible to operator)
- Management mode boundary is enforced at the DB level — changing a JWT claim cannot elevate or bypass access
- No email infrastructure required — all notifications are dashboard-based
- Intake form correctly frames credential submission as "pull once, we manage from here on" — consistent with marketing claims that Clarissi manages credentials on the customer's behalf

### Negative / Trade-offs
- `requireOperator` makes one extra DB query per operator API request (acceptable: operator routes are low-frequency admin paths)
- Operators currently cannot see a full activity audit log of their own actions — `audit_events` table is not yet implemented; flagged as future work (SOC 2 Type II access control gap)

### Out of Scope
- **Self-service acquisition path**: Public signup for self-serve customers. Operators can create `self_managed` customer profiles directly, covering operator-referred self-serve. Public open registration is a separate initiative.
- **Customer-initiated self-managed request**: Customers cannot request self-managed transition from within the app. Operator-initiated only in v1.
- **Audit events**: A dedicated `audit_events` table for immutable operator action logs (skill activations, mode changes, credential intake submissions). Required for SOC 2 Type II evidence — tracked as future work.

---

## Related ADRs
- ADR-008: Platform reliability (CredentialManager, AdapterRegistry)
- ADR-013: Concierge model and operator-managed delivery
- ADR-015: Assessment-first sales motion
- ADR-016: Three-tier customer journey (Assessment → Self-Serve → Concierge)
- ADR-017: Operator skill discovery and two-pass Assessment
