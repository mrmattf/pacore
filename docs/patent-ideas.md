# Patent Ideas

> **Note:** These are internal brainstorming notes to bring to an IP attorney for evaluation.
> They are not legal assessments of patentability.

---

## 1. Dynamic LLM Routing with Heterogeneous Provider Fallback

**Summary:** A method of routing natural language user intent to one of multiple competing large language model providers at runtime, selecting based on cost, latency, capability, or availability, with automatic fallback to an alternate provider on failure — without re-presenting the request to the user.

**What makes it potentially novel:** The routing decision is made per-request using runtime metadata (provider health, token cost, model capability flags) rather than static configuration. The user experience is provider-agnostic.

**Where it lives in the code:** `packages/core/src/llm/`, `packages/cloud/src/orchestration/`

---

## 2. Real-Time Tool Discovery via MCP Within an AI Orchestration Loop

**Summary:** A method of dynamically discovering available tools from registered Model Context Protocol (MCP) servers at inference time, injecting the discovered tool schemas into the LLM prompt, and executing the LLM-selected tool against the originating MCP server — without requiring static tool registration at application startup.

**What makes it potentially novel:** Tools are discovered and made available to the LLM mid-conversation, allowing new MCP servers registered by the user to be immediately usable in the same session.

**Where it lives in the code:** `packages/cloud/src/mcp/mcp-registry.ts`, `packages/cloud/src/orchestration/`

---

## 3. Per-Tenant Skill Instantiation with Isolated Credentials Over a Shared Tool Chain

**Summary:** A method of defining a platform-level skill (tool chain + trigger logic) once, then instantiating it per customer with tenant-isolated credentials and configuration, such that all tenants share the same execution code but operate against their own external systems with their own secrets.

**What makes it potentially novel:** The split between the immutable platform-owned skill definition and the mutable tenant-owned configuration/credentials, enforced at the data model level with a foreign key constraint between `skills` and `user_skills`.

**Where it lives in the code:** `packages/cloud/src/skills/`, `packages/cloud/db/schema.sql`

---

## 4. Resource Slot Management via Skill Pause/Resume Without Configuration Loss

**Summary:** A method of managing finite compute/quota slots in a multi-tenant SaaS platform by allowing users to pause an active skill (freeing its slot for reuse) and resume it later (revalidating the slot against the current limit before reactivation) — while preserving all configuration and credential state during the paused period.

**What makes it potentially novel:** The slot is freed without destroying the instance. Resumption re-checks the limit at reactivation time, preventing race conditions where a user activates a second skill while the first is paused and then tries to resume the first.

**Where it lives in the code:** `packages/cloud/src/api/gateway.ts` (pause/resume routes), `packages/cloud/src/billing/billing-manager.ts`

---

## 5. Hybrid Cloud/Edge Skill Execution with Transparent Routing Based on Data Sensitivity

**Summary:** A method of executing the same skill definition either in a cloud runtime or on a locally-running edge agent, with the routing decision made based on user-configured data sensitivity preferences, without changing the skill definition or the triggering mechanism.

**What makes it potentially novel:** The skill is truly portable — the same webhook trigger, tool chain, and configuration works identically in both execution environments. The edge agent pulls work from the cloud queue rather than being pushed to directly.

**Where it lives in the code:** `packages/agent/`, `packages/cloud/src/index.ts`

---

## 6. Deterministic Tool Chain as an Execution Guardrail Beneath a Non-Deterministic LLM Agent

**Summary:** A system architecture in which an LLM agent decides *when* and *whether* to act, but the actual execution is delegated to a deterministic, pre-validated tool chain — preventing the LLM from constructing novel action sequences that could have unintended side effects.

**What makes it potentially novel:** The separation of the decision layer (LLM, non-deterministic) from the execution layer (tool chain, deterministic and auditable) as a first-class architectural constraint, not just a best-practice guideline.

**Where it lives in the code:** `packages/cloud/src/chains/`, `packages/cloud/src/skills/skill-dispatcher.ts`

---

## 7. Scope-Polymorphic Metering for Dual User/Organization Subscription Plans

**Summary:** A metering and limit-enforcement system in which a single execution counter and limit-check function operate identically over two distinct billing scopes (individual user and organization), selected at runtime from the resource being executed — without duplicating enforcement logic.

**What makes it potentially novel:** The `BillingScope` union type and the single `checkLimit(scope, limitKey)` method handle both personal and org billing with one code path, while the DB schema enforces mutual exclusivity of scope via check constraints.

**Where it lives in the code:** `packages/cloud/src/billing/billing-manager.ts`, `packages/core/src/types/organization.ts`

---

---

## 8. Natural Language to Validated DAG Workflow Generation with Human-in-the-Loop Preview

**Summary:** A method of converting a natural language user request into a directed acyclic graph (DAG) workflow using an LLM, presenting the generated workflow to the user for review/refinement before persisting it, and allowing the user to iteratively refine the workflow via further natural language without losing the intermediate draft state.

**What makes it potentially novel:** The draft DAG is held in a transient preview state (not yet saved) and can be refined conversationally. The user approves before any side effects (DB write, webhook registration) occur. This is distinct from auto-saving and then editing.

**Where it lives in the code:** `packages/cloud/src/workflow/workflow-builder.ts`, `packages/web/src/pages/ChatPage.tsx` (`draftWorkflow` / `showWorkflowPreview` state)

---

## 9. Schema-Aware Property Path Parameter Resolution in Multi-Step Workflow Nodes

**Summary:** A method of mapping output data from one workflow node to the input parameters of a downstream node using a declarative property path syntax (e.g., `$input[0].user.email`), resolved at execution time against the actual runtime output, with schema validation at workflow-authoring time.

**What makes it potentially novel:** The parameter resolution is schema-driven — the UI auto-generates input forms from JSON Schema, and the path syntax allows arbitrary nesting into prior node outputs without requiring custom glue code per integration.

**Where it lives in the code:** `packages/web/src/components/SchemaFormBuilder.tsx`, `packages/web/src/components/NodeConfigPanel.tsx`, `packages/cloud/src/workflow/workflow-executor.ts`

---

## 10. Conversation-Driven Organizational Category Suggestion with One-Click Acceptance

**Summary:** A method of analyzing the semantic content of an ongoing AI conversation and proactively suggesting an organizational category for that conversation, presented as a dismissible banner with a single-click acceptance that immediately reorganizes prior and future messages — without interrupting the conversation flow.

**What makes it potentially novel:** The category suggestion is generated asynchronously as a side-effect of the conversation, surfaced non-modally, and accepted or dismissed without the user leaving the chat context.

**Where it lives in the code:** `packages/web/src/components/CategorySuggestionBanner.tsx`, `packages/cloud/src/orchestration/`

---

## 11. Pluggable Webhook Verification Strategy with Per-Trigger Configuration

**Summary:** A method of securing inbound webhook endpoints with a pluggable verification strategy (none, HMAC-SHA256, Slack-style signed secrets, Google OIDC) selected and configured per trigger endpoint, stored as a typed JSON configuration, evaluated at request time without code changes.

**What makes it potentially novel:** The verification strategy is a runtime-configurable policy stored per trigger row, not a compile-time switch. A single webhook handler can verify Shopify HMAC, Slack signatures, and Google OIDC tokens using the same dispatch mechanism.

**Where it lives in the code:** `packages/cloud/src/triggers/webhook-trigger.ts`, `packages/cloud/db/schema.sql` (`verification_config` JSONB column)

---

## 12. Per-User Encrypted Credential Storage with MCP Server Scoping

**Summary:** A method of storing external service credentials (API keys, OAuth tokens, secrets) encrypted per user with a per-record IV, scoped to a specific MCP server registration, such that credentials are never stored in plaintext and are only decrypted at the moment of tool execution on behalf of that user.

**What makes it potentially novel:** Credentials are bound to a specific MCP server ID and user ID pair — a user cannot inadvertently share credentials across servers, and the platform operator cannot access credentials without the encryption key.

**Where it lives in the code:** `packages/cloud/src/mcp/credential-manager.ts`

---

*Last updated: 2026-02-22. Bring to IP attorney before any public disclosure.*
