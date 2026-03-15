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

export const LowStockImpactSkillType: SkillType = {
  id: 'low-stock-impact',
  name: 'Low Stock Customer Impact',
  description: 'When inventory drops to zero, identify affected open orders and proactively notify each customer with resolution options — before they ask.',
  category: 'E-commerce',
  iconKey: 'BarChart2',
};

// ---- Shared pre-compiled policy ----
// Uses abstract slot key 'notification' — each template variant maps it to a specific integrationKey.
// Per-order evaluation: policy is evaluated once per affected order in the dispatch loop.

const sharedPolicy: CompiledPolicy = {
  version: 2,
  rules: [
    {
      name: 'High-value order — urgent priority',
      conditions: [[{ type: 'order_total_gt', value: 200 }]],
      actions: [{
        type: 'invoke',
        targetSlot: 'notification',
        capability: 'create_ticket',
        params: { priority: 'high' },
        templateKey: 'high_value_stockout',
      }],
    },
  ],
  defaultActions: [{
    type: 'invoke',
    targetSlot: 'notification',
    capability: 'create_ticket',
    params: { priority: 'normal' },
    templateKey: 'stockout_notification',
  }],
};

// ---- Shared enrichment spec ----
// No enrichment steps for MVP — product/order data comes directly from Shopify.

const sharedEnrichmentSpec: DataEnrichmentSpec = {
  steps: [],
};

// ---- Shared default message templates (plain text — renderers add HTML/formatting) ----

const sharedDefaultTemplates: NamedTemplates = {
  stockout_notification: {
    label: 'Out of Stock Customer Notification',
    subject: 'Important update on your order #{{orderNumber}}',
    intro: 'Hi {{customerName}},\n\nWe\'re sorry to let you know that an item in your order #{{orderNumber}} is temporarily out of stock.',
    body: '{{affectedItemsTable}}\n\nPlease reply with your preference:\nA — Hold my order until the item is back in stock\nB — Suggest a comparable substitute item\nC — Cancel the affected item for a full refund',
    closing: 'We apologize for the inconvenience and will process your choice as quickly as possible. Thank you for your patience.',
  },
  high_value_stockout: {
    label: 'High-Value Order Stockout — Priority Response',
    subject: 'Priority update on your order #{{orderNumber}}',
    intro: 'Hi {{customerName}},\n\nI\'m personally reaching out about your order #{{orderNumber}}. An item you\'ve ordered is temporarily out of stock and I want to make this right.',
    body: '{{affectedItemsTable}}\n\nPlease reply and we\'ll take care of you right away:\nA — Hold my order until everything is back in stock\nB — Suggest a comparable substitute item\nC — Cancel the affected item for an immediate full refund',
    closing: 'I\'m sorry for this inconvenience. Your satisfaction is our priority and we\'ll respond to your reply within 2 hours.',
  },
};

// ---- Template variables ----

const sharedTemplateVariables: TemplateVariable[] = [
  { key: 'customerName',      label: 'Customer Name',              example: 'Jane Smith' },
  { key: 'orderNumber',       label: 'Order Number',               example: '1234' },
  { key: 'orderId',           label: 'Order ID',                   example: '5678901' },
  { key: 'customerEmail',     label: 'Customer Email',             example: 'jane@example.com' },
  { key: 'orderTotal',        label: 'Order Total',                example: '149.99' },
  { key: 'productTitle',      label: 'Product Title',              example: 'Blue Widget (L)' },
  { key: 'sku',               label: 'SKU',                        example: 'WIDGET-BLU-L' },
  { key: 'availableQty',      label: 'Available Quantity',         example: '0' },
  { key: 'affectedOrderCount', label: 'Number of Affected Orders', example: '3' },
  { key: 'affectedItemsTable', label: 'Affected Items Table',      example: '(formatted item list)' },
];

// ---- Editable fields ----

// Branding fields — only for integrations that don't auto-wrap outbound emails.
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
    hint: 'Trigger customer notifications when inventory falls at or below this quantity',
  },
  // Stockout notification template fields
  { key: 'templates.stockout_notification.subject', label: 'Standard Notification — Subject', type: 'text',     rows: 1, defaultValue: sharedDefaultTemplates.stockout_notification.subject, hint: 'Your customer sees this as the email subject' },
  { key: 'templates.stockout_notification.intro',   label: 'Standard Notification — Opening', type: 'textarea', rows: 4, defaultValue: sharedDefaultTemplates.stockout_notification.intro },
  { key: 'templates.stockout_notification.body',    label: 'Standard Notification — Body',    type: 'textarea', rows: 6, defaultValue: sharedDefaultTemplates.stockout_notification.body,    hint: '{{affectedItemsTable}} inserts the item list' },
  { key: 'templates.stockout_notification.closing', label: 'Standard Notification — Closing', type: 'textarea', rows: 3, defaultValue: sharedDefaultTemplates.stockout_notification.closing },
  // High-value stockout template fields
  { key: 'templates.high_value_stockout.subject', label: 'Priority Order — Subject', type: 'text',     rows: 1, defaultValue: sharedDefaultTemplates.high_value_stockout.subject, hint: 'Used for orders over $200' },
  { key: 'templates.high_value_stockout.intro',   label: 'Priority Order — Opening', type: 'textarea', rows: 4, defaultValue: sharedDefaultTemplates.high_value_stockout.intro },
  { key: 'templates.high_value_stockout.body',    label: 'Priority Order — Body',    type: 'textarea', rows: 6, defaultValue: sharedDefaultTemplates.high_value_stockout.body,    hint: '{{affectedItemsTable}} inserts the item list' },
  { key: 'templates.high_value_stockout.closing', label: 'Priority Order — Closing', type: 'textarea', rows: 3, defaultValue: sharedDefaultTemplates.high_value_stockout.closing },
];

// Gorgias: full branding (logo, company name, signature) + functional
const gorgiasEditableFields  = [...brandingFields, ...functionalFields];
// Re:amaze: signature only — Re:amaze handles logo/branding at account level
const reamazeEditableFields: EditableField[] = [
  { key: 'signature', label: 'Message Signature', type: 'textarea', defaultValue: '', hint: 'Shown at the end of every message (e.g. "The Acme Support Team")' },
  ...functionalFields,
];
// Zendesk: functional only — wraps email in its own branded template
const standardEditableFields = functionalFields;

// ---- Three SkillTemplate variants ----

export const LowStockShopifyGorgiasTemplate: SkillTemplate = {
  id: 'low-stock-shopify-gorgias',
  skillTypeId: 'low-stock-impact',
  name: 'Shopify → Gorgias',
  version: '1.0.0',
  author: 'PA Core',
  price: 0,
  compiledPolicy: sharedPolicy,
  enrichmentSpec: sharedEnrichmentSpec,
  defaultTemplates: sharedDefaultTemplates,
  slots: [
    { key: 'shopify',      label: 'Your Shopify Store',            integrationKey: 'shopify', required: true },
    { key: 'notification', label: 'Your Gorgias Account',          integrationKey: 'gorgias', required: true },
    { key: 'escalation',   label: 'Escalation Channel (optional)', integrationKey: 'gorgias', required: false },
  ],
  editableFields: gorgiasEditableFields,
  templateVariables: sharedTemplateVariables,
};

export const LowStockShopifyZendeskTemplate: SkillTemplate = {
  id: 'low-stock-shopify-zendesk',
  skillTypeId: 'low-stock-impact',
  name: 'Shopify → Zendesk',
  version: '1.0.0',
  author: 'PA Core',
  price: 0,
  compiledPolicy: sharedPolicy,
  enrichmentSpec: sharedEnrichmentSpec,
  defaultTemplates: sharedDefaultTemplates,
  slots: [
    { key: 'shopify',      label: 'Your Shopify Store',            integrationKey: 'shopify', required: true },
    { key: 'notification', label: 'Your Zendesk Account',          integrationKey: 'zendesk', required: true },
    { key: 'escalation',   label: 'Escalation Channel (optional)', integrationKey: 'zendesk', required: false },
  ],
  editableFields: standardEditableFields,
  templateVariables: sharedTemplateVariables,
};

export const LowStockShopifyReamazeTemplate: SkillTemplate = {
  id: 'low-stock-shopify-reamaze',
  skillTypeId: 'low-stock-impact',
  name: 'Shopify → Re:amaze',
  version: '1.0.0',
  author: 'PA Core',
  price: 0,
  compiledPolicy: sharedPolicy,
  enrichmentSpec: sharedEnrichmentSpec,
  defaultTemplates: sharedDefaultTemplates,
  slots: [
    { key: 'shopify',      label: 'Your Shopify Store',            integrationKey: 'shopify', required: true },
    { key: 'notification', label: 'Your Re:amaze Account',         integrationKey: 'reamaze', required: true },
    { key: 'escalation',   label: 'Escalation Channel (optional)', integrationKey: 'reamaze', required: false },
  ],
  editableFields: reamazeEditableFields,
  templateVariables: sharedTemplateVariables,
};

export const LowStockImpactTemplates: SkillTemplate[] = [
  LowStockShopifyGorgiasTemplate,
  LowStockShopifyZendeskTemplate,
  LowStockShopifyReamazeTemplate,
];
