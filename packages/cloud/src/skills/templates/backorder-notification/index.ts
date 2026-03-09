import type {
  SkillType,
  SkillTemplate,
  TemplateVariable,
  EditableField,
  CompiledPolicy,
  DataEnrichmentSpec,
  NamedTemplates,
} from '@pacore/core';

// ---- SkillType ----

export const BackorderNotificationSkillType: SkillType = {
  id: 'backorder-notification',
  name: 'Backorder Notification',
  description: 'Detect backordered items when an order is placed and notify customers via your support tool.',
  category: 'E-commerce',
};

// ---- Shared pre-compiled policy (authored once, used by all variants) ----
// Uses abstract slot key 'notification' — each template variant maps it to a specific integrationKey.
// This policy is integration-agnostic: it works with Gorgias, Zendesk, Re:amaze, or any future adapter.

const sharedPolicy: CompiledPolicy = {
  version: 2,
  rules: [
    {
      name: 'All items backordered — high priority',
      conditions: [[{ type: 'backorder_status', value: 'all' }]],
      actions: [{
        type: 'invoke',
        targetSlot: 'notification',
        capability: 'create_ticket',
        params: { priority: 'high' },
        templateKey: 'full_backorder',
      }],
    },
    {
      name: 'Some items backordered — normal priority',
      conditions: [[{ type: 'backorder_status', value: 'partial' }]],
      actions: [{
        type: 'invoke',
        targetSlot: 'notification',
        capability: 'create_ticket',
        params: { priority: 'normal' },
        templateKey: 'partial_backorder',
      }],
    },
  ],
  defaultActions: [{ type: 'skip' }],
};

// ---- Shared enrichment spec ----
// Fetches ETA from Shopify variant metafield (custom.backorder_eta) for each backordered item.

const sharedEnrichmentSpec: DataEnrichmentSpec = {
  steps: [
    {
      tool: 'shopify__get_variant_metafields',
      iterateOver: 'backorderedItems',
      inputMapping: { variant_id: 'item.variantId' },
      resultPath: 'item.eta',
    },
  ],
};

// ---- Shared default message templates (plain text — renderers add HTML/formatting) ----

const sharedDefaultTemplates: NamedTemplates = {
  full_backorder: {
    label: 'Full Backorder Apology',
    subject: 'Important update on your order #{{orderNumber}}',
    intro: 'Thank you for your order! Unfortunately, all items are temporarily out of stock — we wanted to let you know and give you options on how to proceed.',
    body: '{{backorderedItemsTable}}\n\nPlease reply with your preference:\nOption A — Hold my order until everything is available\nOption B — Cancel my order for a full refund',
    closing: 'We apologize for the inconvenience and appreciate your patience!',
  },
  partial_backorder: {
    label: 'Partial Backorder Shipping Update',
    subject: 'Shipping update for your order #{{orderNumber}}',
    intro: 'Thank you for your order! Some items are temporarily out of stock — we wanted to let you know and give you a choice on how to proceed.',
    body: '{{backorderedItemsTable}}\n\nHow would you like us to proceed?\nOption A — Split shipment: Reply "A" to this email and we\'ll ship your available items right away. The backordered items will follow in a separate shipment once they\'re back in stock.\n\nOption B — Wait & ship together: No reply needed. If we don\'t hear from you, we\'ll hold the order and ship everything together once all items are available.',
    closing: 'We apologize for the inconvenience and appreciate your patience!',
  },
};

// ---- Template variables ----

const sharedTemplateVariables: TemplateVariable[] = [
  { key: 'customerName',          label: 'Customer Name',                  example: 'Jane Smith' },
  { key: 'orderNumber',           label: 'Order Number',                   example: '1234' },
  { key: 'orderId',               label: 'Order ID',                       example: '5678901' },
  { key: 'customerEmail',         label: 'Customer Email',                 example: 'jane@example.com' },
  { key: 'orderTotal',            label: 'Order Total',                    example: '149.99' },
  { key: 'backorderedCount',      label: 'Number of Backordered Items',    example: '2' },
  { key: 'backorderedItemsTable', label: 'Backordered Items Table',        example: '(formatted item list)' },
];

// ---- Editable fields ----

// Branding fields — only for integrations that don't auto-wrap outbound emails with their own header/footer.
// Gorgias/Re:amaze send body_html as-is; Zendesk wraps it in its own branded email template.
const brandingFields: EditableField[] = [
  {
    key: 'companyName',
    label: 'Company Name',
    type: 'text',
    defaultValue: '',
    hint: 'Shown in the email signature (e.g. "Acme Store")',
  },
  {
    key: 'logoUrl',
    label: 'Logo URL',
    type: 'text',
    defaultValue: '',
    hint: 'Public URL to your logo image — displayed at the top of every email',
  },
  {
    key: 'signature',
    label: 'Email Signature',
    type: 'textarea',
    defaultValue: '',
    hint: 'Appears at the bottom of every email (e.g. "The Acme Support Team")',
  },
];

// Functional fields — apply to all variants regardless of notification tool.
const functionalFields: EditableField[] = [
  {
    key: 'threshold',
    label: 'Inventory Threshold',
    type: 'number',
    defaultValue: 0,
    hint: 'Items at or below this quantity are considered backordered',
  },
  // Full Backorder template fields
  { key: 'templates.full_backorder.subject', label: 'Full Backorder — Subject', type: 'text',     rows: 1, defaultValue: sharedDefaultTemplates.full_backorder.subject, hint: 'Email subject your customer sees' },
  { key: 'templates.full_backorder.intro',   label: 'Full Backorder — Opening', type: 'textarea', rows: 4, defaultValue: sharedDefaultTemplates.full_backorder.intro },
  { key: 'templates.full_backorder.body',    label: 'Full Backorder — Body',    type: 'textarea', rows: 6, defaultValue: sharedDefaultTemplates.full_backorder.body,    hint: '{{backorderedItemsTable}} inserts the item list' },
  { key: 'templates.full_backorder.closing', label: 'Full Backorder — Closing', type: 'textarea', rows: 3, defaultValue: sharedDefaultTemplates.full_backorder.closing },
  // Partial Backorder template fields
  { key: 'templates.partial_backorder.subject', label: 'Partial Backorder — Subject', type: 'text',     rows: 1, defaultValue: sharedDefaultTemplates.partial_backorder.subject, hint: 'Email subject your customer sees' },
  { key: 'templates.partial_backorder.intro',   label: 'Partial Backorder — Opening', type: 'textarea', rows: 4, defaultValue: sharedDefaultTemplates.partial_backorder.intro },
  { key: 'templates.partial_backorder.body',    label: 'Partial Backorder — Body',    type: 'textarea', rows: 6, defaultValue: sharedDefaultTemplates.partial_backorder.body,    hint: '{{backorderedItemsTable}} inserts the item list' },
  { key: 'templates.partial_backorder.closing', label: 'Partial Backorder — Closing', type: 'textarea', rows: 3, defaultValue: sharedDefaultTemplates.partial_backorder.closing },
];

// Gorgias: full branding (logo, company name, signature) + functional
const gorgiasEditableFields = [...brandingFields, ...functionalFields];
// Re:amaze: signature only — Re:amaze handles logo/branding at account level
const reamazeEditableFields: EditableField[] = [
  { key: 'signature', label: 'Message Signature', type: 'textarea', defaultValue: '', hint: 'Shown at the end of every message (e.g. "The Acme Support Team")' },
  ...functionalFields,
];
// Zendesk: functional only — wraps email in its own branded template
const standardEditableFields = functionalFields;

// ---- Three SkillTemplate variants ----

export const BackorderShopifyGorgiasTemplate: SkillTemplate = {
  id: 'backorder-shopify-gorgias',
  skillTypeId: 'backorder-notification',
  name: 'Shopify → Gorgias',
  version: '1.0.0',
  author: 'PA Core',
  price: 0,
  compiledPolicy: sharedPolicy,
  enrichmentSpec: sharedEnrichmentSpec,
  defaultTemplates: sharedDefaultTemplates,
  slots: [
    { key: 'shopify',       label: 'Your Shopify Store',            integrationKey: 'shopify', required: true },
    { key: 'notification',  label: 'Your Gorgias Account',          integrationKey: 'gorgias', required: true },
    { key: 'escalation',    label: 'Escalation Channel (optional)', integrationKey: 'gorgias', required: false },
  ],
  editableFields: gorgiasEditableFields,
  templateVariables: sharedTemplateVariables,
};

export const BackorderShopifyZendeskTemplate: SkillTemplate = {
  id: 'backorder-shopify-zendesk',
  skillTypeId: 'backorder-notification',
  name: 'Shopify → Zendesk',
  version: '1.0.0',
  author: 'PA Core',
  price: 0,
  compiledPolicy: sharedPolicy,
  enrichmentSpec: sharedEnrichmentSpec,
  defaultTemplates: sharedDefaultTemplates,
  slots: [
    { key: 'shopify',       label: 'Your Shopify Store',            integrationKey: 'shopify', required: true },
    { key: 'notification',  label: 'Your Zendesk Account',          integrationKey: 'zendesk', required: true },
    { key: 'escalation',    label: 'Escalation Channel (optional)', integrationKey: 'zendesk', required: false },
  ],
  editableFields: standardEditableFields,
  templateVariables: sharedTemplateVariables,
};

export const BackorderShopifyReamazeTemplate: SkillTemplate = {
  id: 'backorder-shopify-reamaze',
  skillTypeId: 'backorder-notification',
  name: 'Shopify → Re:amaze',
  version: '1.0.0',
  author: 'PA Core',
  price: 0,
  compiledPolicy: sharedPolicy,
  enrichmentSpec: sharedEnrichmentSpec,
  defaultTemplates: sharedDefaultTemplates,
  slots: [
    { key: 'shopify',      label: 'Your Shopify Store',            integrationKey: 'shopify',  required: true },
    { key: 'notification', label: 'Your Re:amaze Account',         integrationKey: 'reamaze',  required: true },
    { key: 'escalation',   label: 'Escalation Channel (optional)', integrationKey: 'reamaze',  required: false },
  ],
  editableFields: reamazeEditableFields,
  templateVariables: sharedTemplateVariables,
};

export const BackorderNotificationTemplates: SkillTemplate[] = [
  BackorderShopifyGorgiasTemplate,
  BackorderShopifyZendeskTemplate,
  BackorderShopifyReamazeTemplate,
];
