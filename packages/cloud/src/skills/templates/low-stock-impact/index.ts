import type {
  SkillType,
  SkillTemplate,
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

// ---- Shared default message templates ----

const sharedDefaultTemplates: NamedTemplates = {
  stockout_notification: {
    label: 'Out of Stock Customer Notification',
    subject: 'Important update on your order #{{orderNumber}}',
    intro: 'Hi {{customerName}},<br><br>We\'re sorry to let you know that an item in your order #{{orderNumber}} is temporarily out of stock.',
    body: '{{affectedItemsTable}}<br><p>Please reply with your preference:<br><strong>A</strong> — Hold my order until the item is back in stock<br><strong>B</strong> — Suggest a comparable substitute item<br><strong>C</strong> — Cancel the affected item for a full refund</p>',
    closing: 'We apologize for the inconvenience and will process your choice as quickly as possible. Thank you for your patience.',
  },
  high_value_stockout: {
    label: 'High-Value Order Stockout — Priority Response',
    subject: 'Priority update on your order #{{orderNumber}}',
    intro: 'Hi {{customerName}},<br><br>I\'m personally reaching out about your order #{{orderNumber}}. An item you\'ve ordered is temporarily out of stock and I want to make this right.',
    body: '{{affectedItemsTable}}<br><p>Please reply and we\'ll take care of you right away:<br><strong>A</strong> — Hold my order until everything is back in stock<br><strong>B</strong> — Suggest a comparable substitute item<br><strong>C</strong> — Cancel the affected item for an immediate full refund</p>',
    closing: 'I\'m sorry for this inconvenience. Your satisfaction is our priority and we\'ll respond to your reply within 2 hours.',
  },
};

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
  {
    key: 'templates.stockout_notification.subject',
    label: 'Standard Notification Subject',
    type: 'text',
    defaultValue: 'Important update on your order #{{orderNumber}}',
    hint: 'Your customer sees this as the email subject from your support tool',
  },
  {
    key: 'templates.high_value_stockout.subject',
    label: 'Priority Order Subject',
    type: 'text',
    defaultValue: 'Priority update on your order #{{orderNumber}}',
    hint: 'Used for orders over $200 — your customer sees this as the email subject',
  },
];

// Gorgias, Re:amaze: branding + functional — send body_html as-is
const gorgiasEditableFields  = [...brandingFields, ...functionalFields];
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
    { key: 'shopify',      label: 'Your Shopify Store',   integrationKey: 'shopify',  required: true },
    { key: 'notification', label: 'Your Gorgias Account', integrationKey: 'gorgias',  required: true },
  ],
  editableFields: gorgiasEditableFields,
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
    { key: 'shopify',      label: 'Your Shopify Store',    integrationKey: 'shopify',  required: true },
    { key: 'notification', label: 'Your Zendesk Account',  integrationKey: 'zendesk',  required: true },
  ],
  editableFields: standardEditableFields,
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
    { key: 'shopify',      label: 'Your Shopify Store',    integrationKey: 'shopify',  required: true },
    { key: 'notification', label: 'Your Re:amaze Account', integrationKey: 'reamaze',  required: true },
  ],
  editableFields: gorgiasEditableFields,
};

export const LowStockImpactTemplates: SkillTemplate[] = [
  LowStockShopifyGorgiasTemplate,
  LowStockShopifyZendeskTemplate,
  LowStockShopifyReamazeTemplate,
];
