// Platform-level ECA (Event-Condition-Action) primitives.
// Used by any skill — not specific to backorder detection.
// Skill-specific condition types and runtime contexts live in their own files (e.g., backorder.ts).

// ---- Actions ----

export type PrimitiveAction =
  | { type: 'skip' }
  | { type: 'escalate'; message?: string; targetSlot?: string };

export interface AdapterAction {
  type: 'invoke';
  targetSlot: string;          // must match a SkillSlot.key in the template
  capability: string;          // e.g., 'create_ticket', 'send_message', 'get_order'
  params: Record<string, unknown>;
  templateKey?: string;        // if set, renders named template and merges subject+message into params
}

export type Action = PrimitiveAction | AdapterAction;

// ---- Compiled Policy ----

export interface CompiledPolicy {
  version: 2;
  rules: PolicyRule[];
  defaultActions: Action[];    // fired when no rule's conditions match
}

export interface PolicyRule {
  name: string;
  conditions: unknown[][];     // outer = OR groups; inner = AND. Skill defines the actual Condition type.
  actions: Action[];
}

// ---- Data Enrichment ----

export interface DataEnrichmentSpec {
  steps: EnrichmentStep[];
}

export interface EnrichmentStep {
  tool: string;                            // e.g. "shopify__get_variant_metafields"
  iterateOver?: string;                    // "backorderedItems" — one call per item; max 50 enforced
  inputMapping: Record<string, string>;   // param name → JSON path in current context
  resultPath: string;                      // "item.eta" — where to merge the result into context
}

// ---- Named Templates ----

export type NamedTemplates = Record<string, TemplateContent>;

export interface TemplateContent {
  label: string;    // human-readable name shown in UI, e.g. "Full Backorder Apology"
  subject: string;  // supports {{orderNumber}}, {{customerName}}, {{eta}}, etc.
  intro: string;
  body: string;
  closing: string;
}
