import type {
  SkillType,
  SkillTemplate,
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

// ---- Shared default message templates ----

const sharedDefaultTemplates: NamedTemplates = {
  exception_customer_notice: {
    label: 'Delivery Exception — Customer Notification',
    subject: 'Update on the delivery of your order #{{orderNumber}}',
    intro: 'Hi {{customerName}},<br><br>We\'re reaching out because {{carrierName}} has reported an issue with the delivery of your order #{{orderNumber}}.',
    body: '<p><strong>Issue:</strong> {{exceptionMessage}}</p><p>Tracking number: {{trackingNumber}}</p><p>We\'re actively working to resolve this and will keep you updated. If you have any questions or would like us to take action, please reply to this message.</p>',
    closing: 'We apologize for any inconvenience and appreciate your patience.',
  },
  high_value_exception_notice: {
    label: 'High-Value Order — Priority Delivery Exception',
    subject: 'Important: Delivery issue with your order #{{orderNumber}}',
    intro: 'Hi {{customerName}},<br><br>I\'m personally following up because {{carrierName}} has flagged a delivery issue with your order #{{orderNumber}}.',
    body: '<p><strong>Issue:</strong> {{exceptionMessage}}</p><p>Tracking number: {{trackingNumber}}</p><p>I\'ve escalated this with our shipping team and will have an update for you within a few hours. Please reply if you\'d like to discuss your options — including a replacement or full refund.</p>',
    closing: 'I\'m sorry for this experience. You\'re a valued customer and we\'ll make this right.',
  },
};

// ---- Shared editable fields ----

const sharedEditableFields: EditableField[] = [
  {
    key: 'templates.exception_customer_notice.subject',
    label: 'Standard Exception Notification Subject',
    type: 'text',
    defaultValue: 'Update on the delivery of your order #{{orderNumber}}',
    hint: 'Your customer sees this as the email subject from your support tool',
  },
  {
    key: 'templates.high_value_exception_notice.subject',
    label: 'High-Value Order Exception Subject',
    type: 'text',
    defaultValue: 'Important: Delivery issue with your order #{{orderNumber}}',
    hint: 'Used for orders over $150',
  },
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
};

export const DeliveryExceptionTemplates: SkillTemplate[] = [
  DeliveryExceptionShopifyGorgiasTemplate,
  DeliveryExceptionShopifyZendeskTemplate,
];
