import type {
  SkillType,
  SkillTemplate,
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

// ---- Shared default message templates ----

const sharedDefaultTemplates: NamedTemplates = {
  full_backorder: {
    label: 'Full Backorder Apology',
    subject: 'Important update on your order #{{orderNumber}}',
    intro: 'Hi {{customerName}},<br><br>Thank you for your order #{{orderNumber}}. We\'re sorry to let you know that all items are temporarily out of stock.',
    body: '{{backorderedItemsTable}}<br><p>Please reply with your preference:<br><strong>A</strong> — Hold my order until everything is available<br><strong>B</strong> — Cancel my order</p>',
    closing: 'We apologize for the inconvenience and will do our best to get your order to you as soon as possible. Thank you for your patience.',
  },
  partial_backorder: {
    label: 'Partial Backorder Shipping Update',
    subject: 'Shipping update for your order #{{orderNumber}}',
    intro: 'Hi {{customerName}},<br><br>Thank you for your order #{{orderNumber}}. Some items are temporarily out of stock and will ship separately.',
    body: '{{backorderedItemsTable}}<br><p>Please reply with your preference:<br><strong>A</strong> — Ship available items now; send backordered items when ready<br><strong>B</strong> — Wait until everything is in stock and ship together</p>',
    closing: 'We apologize for the delay and appreciate your understanding.',
  },
};

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
  {
    key: 'templates.full_backorder.subject',
    label: 'Full Backorder Ticket Subject',
    type: 'text',
    defaultValue: 'Important update on your order #{{orderNumber}}',
    hint: 'Your customer sees this as the email subject from your support tool',
  },
  {
    key: 'templates.partial_backorder.subject',
    label: 'Partial Backorder Ticket Subject',
    type: 'text',
    defaultValue: 'Shipping update for your order #{{orderNumber}}',
    hint: 'Your customer sees this as the email subject from your support tool',
  },
];

// Gorgias, Re:amaze: branding + functional (6 fields) — send body_html as-is
const gorgiasEditableFields = [...brandingFields, ...functionalFields];
// Zendesk: functional only (3 fields) — wraps email in its own branded template
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
    { key: 'shopify',       label: 'Your Shopify Store',   integrationKey: 'shopify',  required: true },
    { key: 'notification',  label: 'Your Gorgias Account', integrationKey: 'gorgias',  required: true },
  ],
  editableFields: gorgiasEditableFields,
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
    { key: 'shopify',       label: 'Your Shopify Store',   integrationKey: 'shopify',  required: true },
    { key: 'notification',  label: 'Your Zendesk Account', integrationKey: 'zendesk',  required: true },
  ],
  editableFields: standardEditableFields,
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
    { key: 'shopify',      label: 'Your Shopify Store',    integrationKey: 'shopify',   required: true },
    { key: 'notification', label: 'Your Re:amaze Account', integrationKey: 'reamaze',   required: true },
  ],
  editableFields: gorgiasEditableFields,
};

export const BackorderNotificationTemplates: SkillTemplate[] = [
  BackorderShopifyGorgiasTemplate,
  BackorderShopifyZendeskTemplate,
  BackorderShopifyReamazeTemplate,
];
