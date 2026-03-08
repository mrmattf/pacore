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

export const DeliveryExceptionSkillType: SkillType = {
  id: 'delivery-exception-alert',
  name: 'Delivery Exception Alert',
  description: 'When a carrier reports a delivery exception (damaged, lost, wrong address), automatically notify the affected customer with next steps — before they raise a complaint.',
  category: 'E-commerce',
};

// ---- Shared pre-compiled policy ----
// High-value orders get priority treatment; all exceptions get notified.

const sharedPolicy: CompiledPolicy = {
  version: 2,
  rules: [
    {
      name: 'High-value order — priority exception response',
      conditions: [[{ type: 'order_total_gt', value: 150 }]],
      actions: [{
        type: 'invoke',
        targetSlot: 'notification',
        capability: 'create_ticket',
        params: { priority: 'high' },
        templateKey: 'high_value_exception_notice',
      }],
    },
  ],
  defaultActions: [{
    type: 'invoke',
    targetSlot: 'notification',
    capability: 'create_ticket',
    params: { priority: 'normal' },
    templateKey: 'exception_customer_notice',
  }],
};

// ---- Shared enrichment spec ----

const sharedEnrichmentSpec: DataEnrichmentSpec = {
  steps: [],
};

// ---- Shared default message templates (plain text — renderers add HTML/formatting) ----

const sharedDefaultTemplates: NamedTemplates = {
  exception_customer_notice: {
    label: 'Delivery Exception — Customer Notification',
    subject: 'Update on the delivery of your order #{{orderNumber}}',
    intro: 'Hi {{customerName}},\n\nWe\'re reaching out because {{carrierName}} has reported an issue with the delivery of your order #{{orderNumber}}.',
    body: 'Issue: {{exceptionMessage}}\n\nTracking number: {{trackingNumber}}\n\nWe\'re actively working to resolve this and will keep you updated. If you have any questions or would like us to take action, please reply to this message.',
    closing: 'We apologize for any inconvenience and appreciate your patience.',
  },
  high_value_exception_notice: {
    label: 'High-Value Order — Priority Delivery Exception',
    subject: 'Important: Delivery issue with your order #{{orderNumber}}',
    intro: 'Hi {{customerName}},\n\nI\'m personally following up because {{carrierName}} has flagged a delivery issue with your order #{{orderNumber}}.',
    body: 'Issue: {{exceptionMessage}}\n\nTracking number: {{trackingNumber}}\n\nI\'ve escalated this with our shipping team and will have an update for you within a few hours. Please reply if you\'d like to discuss your options — including a replacement or full refund.',
    closing: 'I\'m sorry for this experience. You\'re a valued customer and we\'ll make this right.',
  },
};

// ---- Template variables ----

const sharedTemplateVariables: TemplateVariable[] = [
  { key: 'customerName',      label: 'Customer Name',        example: 'Jane Smith' },
  { key: 'orderNumber',       label: 'Order Number',         example: '1234' },
  { key: 'orderId',           label: 'Order ID',             example: '5678901' },
  { key: 'customerEmail',     label: 'Customer Email',       example: 'jane@example.com' },
  { key: 'orderTotal',        label: 'Order Total',          example: '149.99' },
  { key: 'carrierName',       label: 'Carrier Name',         example: 'FedEx' },
  { key: 'trackingNumber',    label: 'Tracking Number',      example: '1Z999AA10123456784' },
  { key: 'exceptionMessage',  label: 'Exception Description', example: 'Delivery attempted — no access' },
  { key: 'estimatedDelivery', label: 'Estimated Delivery',   example: '2026-03-12' },
];

// ---- Shared editable fields ----

const sharedEditableFields: EditableField[] = [
  // Standard exception template fields
  { key: 'templates.exception_customer_notice.subject', label: 'Standard Exception — Subject', type: 'text',     rows: 1, defaultValue: sharedDefaultTemplates.exception_customer_notice.subject, hint: 'Your customer sees this as the email subject' },
  { key: 'templates.exception_customer_notice.intro',   label: 'Standard Exception — Opening', type: 'textarea', rows: 4, defaultValue: sharedDefaultTemplates.exception_customer_notice.intro },
  { key: 'templates.exception_customer_notice.body',    label: 'Standard Exception — Body',    type: 'textarea', rows: 6, defaultValue: sharedDefaultTemplates.exception_customer_notice.body },
  { key: 'templates.exception_customer_notice.closing', label: 'Standard Exception — Closing', type: 'textarea', rows: 3, defaultValue: sharedDefaultTemplates.exception_customer_notice.closing },
  // High-value exception template fields
  { key: 'templates.high_value_exception_notice.subject', label: 'High-Value Exception — Subject', type: 'text',     rows: 1, defaultValue: sharedDefaultTemplates.high_value_exception_notice.subject, hint: 'Used for orders over $150' },
  { key: 'templates.high_value_exception_notice.intro',   label: 'High-Value Exception — Opening', type: 'textarea', rows: 4, defaultValue: sharedDefaultTemplates.high_value_exception_notice.intro },
  { key: 'templates.high_value_exception_notice.body',    label: 'High-Value Exception — Body',    type: 'textarea', rows: 6, defaultValue: sharedDefaultTemplates.high_value_exception_notice.body },
  { key: 'templates.high_value_exception_notice.closing', label: 'High-Value Exception — Closing', type: 'textarea', rows: 3, defaultValue: sharedDefaultTemplates.high_value_exception_notice.closing },
];

// ---- Two SkillTemplate variants ----

export const DeliveryExceptionShopifyGorgiasTemplate: SkillTemplate = {
  id: 'delivery-exception-shopify-gorgias',
  skillTypeId: 'delivery-exception-alert',
  name: 'AfterShip + Shopify → Gorgias',
  version: '1.0.0',
  author: 'PA Core',
  price: 0,
  compiledPolicy: sharedPolicy,
  enrichmentSpec: sharedEnrichmentSpec,
  defaultTemplates: sharedDefaultTemplates,
  slots: [
    { key: 'aftership',    label: 'Your AfterShip Account', integrationKey: 'aftership', required: true },
    { key: 'shopify',      label: 'Your Shopify Store',     integrationKey: 'shopify',   required: true },
    { key: 'notification', label: 'Your Gorgias Account',   integrationKey: 'gorgias',   required: true },
  ],
  editableFields: sharedEditableFields,
  templateVariables: sharedTemplateVariables,
};

export const DeliveryExceptionShopifyZendeskTemplate: SkillTemplate = {
  id: 'delivery-exception-shopify-zendesk',
  skillTypeId: 'delivery-exception-alert',
  name: 'AfterShip + Shopify → Zendesk',
  version: '1.0.0',
  author: 'PA Core',
  price: 0,
  compiledPolicy: sharedPolicy,
  enrichmentSpec: sharedEnrichmentSpec,
  defaultTemplates: sharedDefaultTemplates,
  slots: [
    { key: 'aftership',    label: 'Your AfterShip Account', integrationKey: 'aftership', required: true },
    { key: 'shopify',      label: 'Your Shopify Store',     integrationKey: 'shopify',   required: true },
    { key: 'notification', label: 'Your Zendesk Account',   integrationKey: 'zendesk',   required: true },
  ],
  editableFields: sharedEditableFields,
  templateVariables: sharedTemplateVariables,
};

export const DeliveryExceptionTemplates: SkillTemplate[] = [
  DeliveryExceptionShopifyGorgiasTemplate,
  DeliveryExceptionShopifyZendeskTemplate,
];
