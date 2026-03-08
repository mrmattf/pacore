import type { CompiledPolicy, DataEnrichmentSpec, NamedTemplates } from './policy';

// ---- SkillType — the abstract capability shown on SkillsPage ----

export interface SkillType {
  id: string;          // "backorder-notification"
  name: string;        // "Backorder Notification"
  description: string;
  category: string;    // "E-commerce" | "Legal" | "Finance"
}

// ---- TemplateVariable — an available {{variable}} placeholder exposed to UI and API ----

export interface TemplateVariable {
  key: string;       // used in {{key}}
  label: string;     // human-readable description
  example?: string;  // example value shown in UI
}

// ---- SkillTemplate — one concrete implementation (e.g. "Shopify → Zendesk") ----

export interface SkillTemplate {
  id: string;                  // "backorder-shopify-zendesk"
  skillTypeId: string;         // "backorder-notification"
  name: string;                // "Shopify → Zendesk"
  version: string;             // semver
  author: string;              // "PA Core" | integrator name
  price: number;               // 0 = free; marketplace-ready

  // Pre-compiled by skill developer — end users never see or edit these
  compiledPolicy: CompiledPolicy;
  enrichmentSpec: DataEnrichmentSpec;
  defaultTemplates: NamedTemplates;

  // What end users configure
  slots: SkillSlot[];
  editableFields: EditableField[];
  templateVariables?: TemplateVariable[];  // available {{variable}} placeholders
}

// ---- SkillSlot — an integration connection the user must provide ----

export interface SkillSlot {
  key: string;            // "shopify", "zendesk"
  label: string;          // "Your Shopify Store", "Your Zendesk Account"
  integrationKey: string; // "shopify" | "zendesk" | "gorgias" | "freshdesk"
  required: boolean;
}

// ---- EditableField — a template field the end user can customize ----

export interface EditableField {
  key: string;             // dot path, e.g. "threshold" or "templates.full_backorder.subject"
  label: string;
  type: 'text' | 'textarea' | 'number';
  defaultValue: unknown;
  hint?: string;
  rows?: number;           // textarea row height hint for UI
}

// ---- UserSkillConfig — stored in user_skills.configuration JSONB ----
// Credentials are NEVER stored here — fetched via slotConnections[key] → CredentialManager

export interface UserSkillConfig {
  templateId: string;                          // which SkillTemplate was used
  slotConnections: Record<string, string>;     // slot key → IntegrationConnection.id
  fieldOverrides: Record<string, unknown>;     // editable field key → user's value
  namedTemplates: NamedTemplates;              // starts as template defaults; user edits go here
}

// ---- TemplateRequest — coming-soon/vote tracking ----

export interface TemplateRequest {
  id: string;
  skillTypeId: string;
  integrationCombo: string;   // e.g. "WooCommerce → Zendesk"
  description: string;
  voteCount: number;
  createdAt: Date;
}
