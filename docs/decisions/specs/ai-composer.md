# AI Composer Specification

## Overview

The AI Composer is a conversational interface that enables e-commerce merchants to create Skill compositions using natural language instead of traditional drag-and-drop workflow builders.

**Core principle**: Merchants describe business intent; AI translates to system configuration.

## Problem Statement

### Traditional Workflow Builders (Zapier, n8n, Make)

| Issue | Impact |
|-------|--------|
| Requires workflow thinking | Merchants must learn system abstractions |
| Generic primitives | "Create record" vs "Create backorder ticket" |
| Manual edge case handling | Merchant must anticipate all scenarios |
| No domain context | Builder doesn't understand e-commerce operations |
| Test manually | No simulation before activation |

### PA Core AI Composer Solution

| Capability | Benefit |
|------------|---------|
| Natural language input | Merchant speaks in business terms |
| E-commerce primitives | "Backorder", "VIP customer", "Fulfillment" |
| Proactive edge case questions | AI asks about scenarios merchant might miss |
| Domain knowledge | AI knows Shopify, Gorgias, inventory patterns |
| Simulation before activation | AI tests with sample data |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  USER INTERFACE LAYER                                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Chat Interface (Web / Embedded / CLI)                   │    │
│  │  - Conversational input                                  │    │
│  │  - Visual composition preview                            │    │
│  │  - Inline editing                                        │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  AI COMPOSER AGENT                                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Intent Understanding                                    │    │
│  │  - Parse natural language                                │    │
│  │  - Map to e-commerce concepts                            │    │
│  │  - Identify required integrations                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Composition Generator                                   │    │
│  │  - Select appropriate Skills                             │    │
│  │  - Configure parameters                                  │    │
│  │  - Generate YAML/JSON composition                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Edge Case Analyzer                                      │    │
│  │  - Identify potential failure modes                      │    │
│  │  - Generate clarifying questions                         │    │
│  │  - Suggest default behaviors                             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Simulator                                               │    │
│  │  - Generate test scenarios                               │    │
│  │  - Execute dry-run                                       │    │
│  │  - Preview outputs (tickets, emails, tags)               │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  DOMAIN KNOWLEDGE LAYER                                          │
│                                                                  │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────────────┐  │
│  │ Integration   │ │ Pattern       │ │ E-Commerce            │  │
│  │ Schemas       │ │ Library       │ │ Ontology              │  │
│  │ (Shopify,     │ │ (backorder,   │ │ (order, customer,     │  │
│  │  Gorgias...)  │ │  routing...)  │ │  fulfillment...)      │  │
│  └───────────────┘ └───────────────┘ └───────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  SKILL RUNTIME                                                   │
│                                                                  │
│  Compositions execute via deterministic tool chains              │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Intent Understanding

Translates merchant language to system concepts:

| Merchant Says | AI Understands |
|---------------|----------------|
| "Over $500" | `order.total_price > 500` |
| "VIP customer" | `customer.tags.includes("VIP")` OR `order.total_price > threshold` |
| "Backordered items" | `line_items.filter(i => inventory[i.variant_id] < i.quantity)` |
| "Escalate" | Create ticket with priority: HIGH |
| "Personalized email" | Template with customer-specific merge fields |

**E-Commerce Ontology**:

```yaml
# Core e-commerce concepts the AI understands
ontology:
  entities:
    order:
      properties: [number, total_price, line_items, customer, status]
      states: [pending, paid, fulfilled, refunded, cancelled]
    customer:
      properties: [email, name, tags, order_count, lifetime_value]
      segments: [new, returning, vip, at_risk]
    line_item:
      properties: [variant_id, quantity, price, fulfillment_status]
    inventory:
      properties: [available, incoming, committed]

  events:
    order_created: "New order placed"
    order_fulfilled: "Order shipped"
    inventory_low: "Stock below threshold"
    backorder_detected: "Ordered quantity exceeds available"

  actions:
    create_ticket: "Open support case"
    send_email: "Send notification to customer"
    tag_order: "Add metadata to order"
    update_inventory: "Adjust stock levels"
```

### 2. Composition Generator

Generates Skill compositions from understood intent:

**Input**: Parsed intent from natural language

**Output**: Structured composition

```yaml
# Generated composition example
apiVersion: pacore.io/v1
kind: SkillComposition
metadata:
  name: vip-backorder-escalation
  created_by: ai-composer
  created_at: 2026-02-18T10:30:00Z

spec:
  trigger:
    skill: backorder-detection
    event: backorder.detected

  conditions:
    - type: any
      rules:
        - field: order.total_price
          operator: gt
          value: 500
        - field: customer.tags
          operator: contains
          value: "VIP"

  actions:
    - skill: gorgias.create_ticket
      params:
        priority: high
        assignee_team: vip-support
        subject: "VIP Backorder - Order #{{order.number}}"
        body: |
          Customer: {{customer.name}} ({{customer.email}})
          Order Total: {{order.total_price | currency}}
          Backordered Items:
          {{#each backorder.items}}
          - {{this.title}} ({{this.quantity}} units)
          {{/each}}

    - skill: klaviyo.send_email
      params:
        template_id: vip_backorder_apology
        to: "{{customer.email}}"
        data:
          customer_name: "{{customer.first_name}}"
          order_number: "{{order.number}}"
          items: "{{backorder.items}}"

    - skill: shopify.tag_order
      params:
        order_id: "{{order.id}}"
        tags:
          - "VIP-BACKORDER"
          - "ESCALATED"
```

### 3. Edge Case Analyzer

Proactively identifies scenarios the merchant might not consider:

**Analysis Categories**:

| Category | Example Questions |
|----------|-------------------|
| **Availability** | "What if the VIP team is unavailable?" |
| **Data completeness** | "What if we don't have an ETA for the item?" |
| **Timing** | "Should this run on weekends?" |
| **Volume** | "What if there are 100+ backorders at once?" |
| **Errors** | "What if Gorgias API fails?" |
| **Duplicates** | "What if same order triggers twice?" |

**Edge Case Resolution**:

```yaml
# Edge case configurations added to composition
edge_cases:
  - scenario: vip_team_unavailable
    question: "What if the VIP team is unavailable?"
    options:
      - label: "Assign to next available agent"
        config: { fallback_assignee: "general-support" }
      - label: "Hold for VIP team"
        config: { queue: "vip-pending" }
      - label: "Escalate to manager"
        config: { escalate_to: "support-manager" }
    selected: "Assign to next available agent"

  - scenario: missing_eta
    question: "What if we don't have an ETA for the backordered item?"
    options:
      - label: "Say 'We'll update you soon'"
        config: { eta_fallback: "We're checking with our supplier and will update you shortly." }
      - label: "Don't send email until ETA known"
        config: { wait_for_eta: true }
    selected: "Say 'We'll update you soon'"

  - scenario: weekend_execution
    question: "Should this run on weekends?"
    options:
      - label: "Yes, 24/7"
        config: { schedule: "always" }
      - label: "No, queue for Monday"
        config: { schedule: "business_hours", queue_outside: true }
    selected: "Yes, 24/7"
```

### 4. Simulator

Tests compositions before activation:

**Simulation Process**:

1. Generate realistic test data based on customer's actual data patterns
2. Execute composition in dry-run mode
3. Show what WOULD happen (without actually creating tickets, sending emails)
4. Allow merchant to review and approve

**Simulation Output**:

```
┌─────────────────────────────────────────────────────────────────┐
│  SIMULATION RESULTS                                              │
│                                                                  │
│  Test Order: #12345                                              │
│  Customer: John Smith (john@example.com)                        │
│  Order Value: $750                                               │
│  Backordered: 2 items                                            │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  ✓ Conditions Matched                                            │
│    • Order value ($750) > $500 threshold                        │
│                                                                  │
│  ✓ Action 1: Gorgias Ticket                                      │
│    • Priority: HIGH                                              │
│    • Assigned to: VIP Support Team                              │
│    • Subject: "VIP Backorder - Order #12345"                    │
│    [Preview Ticket Body]                                         │
│                                                                  │
│  ✓ Action 2: Email via Klaviyo                                   │
│    • To: john@example.com                                        │
│    • Template: vip_backorder_apology                            │
│    [Preview Email]                                               │
│                                                                  │
│  ✓ Action 3: Shopify Tags                                        │
│    • Tags added: VIP-BACKORDER, ESCALATED                       │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  [Activate] [Edit Composition] [Run More Simulations]           │
└─────────────────────────────────────────────────────────────────┘
```

## Conversation Flow

### Example: VIP Backorder Escalation

```
MERCHANT: We keep getting complaints about late backorder notifications

AI: I can help with that. Let me check your current setup...

    📊 Current State:
    • Average notification time: 4.2 hours
    • Industry benchmark: 30 minutes
    • You're using manual ticket creation

    Would you like me to set up automatic backorder detection
    and notification?

    [Yes, set it up] [Tell me more] [I have specific requirements]

───────────────────────────────────────────────────────────────────

MERCHANT: Yes but I want VIP customers handled differently

AI: Got it. How would you define a VIP customer?

    [ ] Order value over $___
    [ ] Customer has "VIP" tag in Shopify
    [ ] Customer in specific Klaviyo segment
    [ ] Repeat customer (3+ orders)
    [ ] Other: ___

───────────────────────────────────────────────────────────────────

MERCHANT: Order value over $500 OR they have VIP tag

AI: Perfect. For VIP customers, what should be different?

    [x] Higher priority ticket
    [x] Different Gorgias team assignment
    [x] Personalized email template
    [ ] Phone call from support

    [Continue]

───────────────────────────────────────────────────────────────────

AI: Here's what I'll set up:

    TRIGGER: Order with backordered items

    IF: Order > $500 OR Customer has "VIP" tag
    THEN:
      1. Create HIGH priority Gorgias ticket
         • Assign to: VIP Support Team
      2. Send personalized email (template: vip_backorder_apology)
      3. Tag order: "VIP-BACKORDER"

    ELSE (standard customers):
      1. Create NORMAL priority ticket
      2. Send standard backorder email
      3. Tag order: "BACKORDER"

    A few questions to make this bulletproof:

    1. What if the VIP team is unavailable?
       ( ) Assign to next available
       ( ) Hold for VIP team
       (•) Escalate to manager

    2. Should this run 24/7?
       (•) Yes
       ( ) Business hours only

    [Looks good, test it] [Make changes]

───────────────────────────────────────────────────────────────────

AI: Running simulation with sample order...

    ✓ Simulation passed

    Sample results:
    • Order #12345 ($750, VIP tag) → HIGH priority ticket, VIP email
    • Order #12346 ($200, no tag) → NORMAL priority ticket, standard email
    • Order #12347 ($600, no tag) → HIGH priority ticket, VIP email (over $500)

    [View details] [Activate for real] [Adjust rules]

───────────────────────────────────────────────────────────────────

MERCHANT: Activate for real

AI: ✅ Composition activated!

    Your "VIP Backorder Escalation" is now live.

    I'll monitor the first 24 hours and let you know if I see
    anything unexpected.

    Quick stats to expect:
    • ~15% of backorders will route to VIP team (based on your data)
    • Notification time should drop to <5 minutes

    [View Dashboard] [Make changes] [Set up another automation]
```

## AI Composer Agent Configuration

### System Prompt

```markdown
You are the PA Core AI Composer, an expert in e-commerce operations automation.

## Your Role
Help merchants create Skill compositions by understanding their business intent
and translating it into system configuration.

## Your Knowledge
- E-commerce platforms: Shopify, WooCommerce, BigCommerce
- Support systems: Gorgias, Zendesk, Freshdesk
- Email/SMS: Klaviyo, Attentive, Postscript
- Fulfillment: ShipStation, ShipBob, 3PL providers
- Subscription: Recharge, Bold, Skio

## Your Capabilities
1. Understand merchant intent from natural language
2. Map intent to available Skills and integrations
3. Generate composition configurations
4. Identify edge cases and ask clarifying questions
5. Simulate compositions before activation
6. Explain what will happen in merchant-friendly language

## Your Approach
- Ask clarifying questions when intent is ambiguous
- Proactively surface edge cases the merchant might not consider
- Always show what will happen before activation
- Use merchant's terminology, not technical jargon
- Suggest improvements based on industry benchmarks

## Constraints
- Only compose Skills the customer has access to
- Respect integration credentials and permissions
- Never activate without explicit merchant approval
- Always provide simulation before going live
```

### Available Tools

```typescript
// Tools available to AI Composer agent

interface ComposerTools {
  // Understand customer's current setup
  get_customer_integrations(): Integration[];
  get_available_skills(): Skill[];
  get_customer_data_sample(entity: string): SampleData;

  // Generate compositions
  generate_composition(intent: ParsedIntent): Composition;
  validate_composition(composition: Composition): ValidationResult;

  // Edge case analysis
  analyze_edge_cases(composition: Composition): EdgeCase[];
  apply_edge_case_resolution(composition: Composition, resolutions: Resolution[]): Composition;

  // Simulation
  generate_test_scenarios(composition: Composition): TestScenario[];
  run_simulation(composition: Composition, scenario: TestScenario): SimulationResult;

  // Activation
  activate_composition(composition: Composition): ActivationResult;

  // Monitoring
  get_composition_performance(composition_id: string): PerformanceMetrics;
}
```

## Integration Points

### 1. Web Interface

Primary interface for merchants in PA Core dashboard.

### 2. Embedded Interface

Widget embedded in:
- Shopify Admin (Order pages, Settings)
- Gorgias (Sidebar, Settings)
- Other integrated platforms

### 3. CLI Interface

For developers and power users:

```bash
$ pacore compose "When backorder over $500, escalate to VIP team"

Analyzing intent...
Generating composition...

Composition: vip-backorder-escalation
Trigger: backorder.detected
Conditions: order.total > 500
Actions:
  1. gorgias.create_ticket (priority: high)
  2. klaviyo.send_email (template: vip_backorder)
  3. shopify.tag_order (tags: VIP-BACKORDER)

Edge cases identified:
  - VIP team unavailable: [assign to next available / hold / escalate]

Run simulation? [Y/n]
```

### 4. API Interface

For programmatic composition:

```typescript
const composition = await pacore.composer.create({
  intent: "When backorder over $500, escalate to VIP team",
  options: {
    simulate: true,
    edge_case_defaults: {
      team_unavailable: "escalate_to_manager"
    }
  }
});

if (composition.simulation.passed) {
  await composition.activate();
}
```

## Data Model

### Composition Schema

```typescript
interface SkillComposition {
  id: string;
  name: string;
  description: string;

  // Creation metadata
  created_by: "ai-composer" | "manual";
  created_at: Date;
  conversation_id?: string;  // Link to composer conversation

  // Configuration
  trigger: {
    skill: string;
    event: string;
    filter?: Condition;
  };

  conditions: Condition[];

  actions: {
    skill: string;
    params: Record<string, any>;
    condition?: Condition;  // Conditional action
  }[];

  edge_cases: {
    scenario: string;
    question: string;
    selected_option: string;
    config: Record<string, any>;
  }[];

  // Status
  status: "draft" | "simulated" | "active" | "paused" | "archived";

  // Performance
  metrics?: {
    executions: number;
    success_rate: number;
    avg_execution_time: number;
  };
}

interface Condition {
  type: "all" | "any" | "none";
  rules: {
    field: string;
    operator: "eq" | "neq" | "gt" | "lt" | "contains" | "not_contains";
    value: any;
  }[];
}
```

## Implementation Phases

### Phase 1: Core Conversation Loop (MVP)

- Text-based chat interface
- Intent understanding for common patterns (backorder, VIP, escalation)
- Basic composition generation
- Manual edge case configuration
- Simple simulation (pass/fail)

**Exit criteria**: Merchant can create backorder escalation composition via chat

### Phase 2: Edge Case Intelligence

- Proactive edge case identification
- Smart defaults based on patterns
- Multiple simulation scenarios
- Composition versioning

**Exit criteria**: AI asks about 3+ relevant edge cases per composition

### Phase 3: Visual Layer

- Visual preview of composition (not builder, just preview)
- Inline editing of generated composition
- Real-time simulation updates
- Comparison view (before/after)

**Exit criteria**: Merchant can see and tweak visual representation

### Phase 4: Embedded Deployment

- Shopify Admin embed
- Gorgias sidebar embed
- Contextual suggestions (e.g., "I noticed this order has backorders...")

**Exit criteria**: Composer accessible from within Shopify/Gorgias

### Phase 5: Proactive Composer

- AI notices patterns and suggests compositions
- "80% of your backorder tickets go to VIP team. Want to automate that?"
- Learning from merchant feedback
- Composition recommendations

**Exit criteria**: AI proactively suggests 1+ valid composition per week

## Success Metrics

| Metric | Phase 1 | Phase 3 | Phase 5 |
|--------|---------|---------|---------|
| Composition creation time | 10 min | 5 min | 2 min |
| Compositions created/month | 5 | 20 | 50+ |
| Merchant satisfaction | 3.5/5 | 4.0/5 | 4.5/5 |
| Edge cases caught | 2 | 5 | 8+ |
| Simulation accuracy | 85% | 95% | 99% |

## Open Questions

1. **Composition sharing**: Can merchants share compositions with each other? (Marketplace angle)
2. **Version control**: How to handle composition updates when underlying Skills change?
3. **Multi-language**: Support for non-English merchants?
4. **Offline composition**: Can compositions be exported/imported?
5. **Collaboration**: Multiple team members editing same composition?

## Related Documents

- [ADR-005: Domain-Specialized Builder Agent](../005-builder-agent.md)
- [Product Strategy](../../product-strategy.md)
- [AI Agents](../../ai-agents.md)
