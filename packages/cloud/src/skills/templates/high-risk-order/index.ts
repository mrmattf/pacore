import type {
  SkillType,
  SkillTemplate,
  EditableField,
  CompiledPolicy,
  DataEnrichmentSpec,
  NamedTemplates,
} from '@pacore/core';

// ---- SkillType ----

export const HighRiskOrderSkillType: SkillType = {
  id: 'high-risk-order-response',
  name: 'High-Risk Order Response',
  description: 'When Shopify flags an order for fraud risk, automatically alert your team and optionally notify the customer — so high-risk orders are never missed.',
  category: 'E-commerce',
};

// ---- Shared pre-compiled policy ----
// Three paths:
//   1. cancel recommendation → notify customer (via notification slot) + alert team (via alert slot)
//   2. investigate recommendation → alert team only
//   3. accept (default) → skip

const sharedPolicy: CompiledPolicy = {
  version: 2,
  rules: [
    {
      name: 'Cancel recommendation — highest fraud risk',
      conditions: [[{ type: 'risk_recommendation', value: 'cancel' }]],
      actions: [
        {
          type: 'invoke',
          targetSlot: 'notification',
          capability: 'create_ticket',
          params: { priority: 'high' },
          templateKey: 'cancel_customer_notice',
        },
        {
          type: 'invoke',
          targetSlot: 'alert',
          capability: 'send_message',
          params: {},
          templateKey: 'cancel_team_alert',
        },
      ],
    },
    {
      name: 'Investigate recommendation — medium fraud risk',
      conditions: [[{ type: 'risk_recommendation', value: 'investigate' }]],
      actions: [
        {
          type: 'invoke',
          targetSlot: 'alert',
          capability: 'send_message',
          params: {},
          templateKey: 'investigate_team_alert',
        },
      ],
    },
  ],
  defaultActions: [{ type: 'skip' }],
};

// ---- Shared enrichment spec ----
// No enrichment — all data comes from the order + Shopify risk API (fetched in chain).

const sharedEnrichmentSpec: DataEnrichmentSpec = {
  steps: [],
};

// ---- Shared default message templates ----

const sharedDefaultTemplates: NamedTemplates = {
  cancel_customer_notice: {
    label: 'Fraud Review — Customer Notice',
    subject: 'Action required on your order #{{orderNumber}}',
    intro: 'Hi {{customerName}},<br><br>We\'re reviewing your recent order #{{orderNumber}} and need to verify a few details before we can proceed.',
    body: '<p>This is a routine security check we perform on some orders. Please reply to this message so we can confirm your order and get it on its way to you.</p><p>If you did not place this order, please let us know immediately.</p>',
    closing: 'Thank you for your understanding. We\'ll get back to you within a few hours.',
  },
  cancel_team_alert: {
    label: 'Fraud Cancel — Internal Team Alert',
    subject: '🚨 High-risk order flagged for cancellation — #{{orderNumber}}',
    intro: '',
    body: 'Order *#{{orderNumber}}* has been flagged by Shopify with a <strong>CANCEL</strong> recommendation.\n\nCustomer: {{customerName}} ({{customerEmail}})\nOrder total: ${{orderTotal}}\nRisk score: {{riskScore}}\nRisk details: {{riskMessages}}\n\nA ticket has been created to notify the customer. Please review and cancel if confirmed fraudulent.',
    closing: '',
  },
  investigate_team_alert: {
    label: 'Fraud Investigate — Internal Team Alert',
    subject: '⚠️ Order flagged for review — #{{orderNumber}}',
    intro: '',
    body: 'Order *#{{orderNumber}}* has been flagged by Shopify for *investigation*.\n\nCustomer: {{customerName}} ({{customerEmail}})\nOrder total: ${{orderTotal}}\nRisk score: {{riskScore}}\nRisk details: {{riskMessages}}\n\nPlease review this order before fulfilling.',
    closing: '',
  },
};

// ---- Shared editable fields ----

const sharedEditableFields: EditableField[] = [
  {
    key: 'templates.cancel_customer_notice.subject',
    label: 'Customer Verification Request Subject',
    type: 'text',
    defaultValue: 'Action required on your order #{{orderNumber}}',
    hint: 'Your customer sees this as the email subject from your support tool',
  },
];

// ---- Two SkillTemplate variants ----
// Both include a notification slot (customer-facing) and an alert slot (internal Slack).

export const HighRiskShopifyGorgiasSlackTemplate: SkillTemplate = {
  id: 'high-risk-shopify-gorgias-slack',
  skillTypeId: 'high-risk-order-response',
  name: 'Shopify → Gorgias + Slack',
  version: '1.0.0',
  author: 'PA Core',
  price: 0,
  compiledPolicy: sharedPolicy,
  enrichmentSpec: sharedEnrichmentSpec,
  defaultTemplates: sharedDefaultTemplates,
  slots: [
    { key: 'shopify',      label: 'Your Shopify Store',   integrationKey: 'shopify', required: true },
    { key: 'notification', label: 'Your Gorgias Account', integrationKey: 'gorgias', required: true },
    { key: 'alert',        label: 'Your Slack Channel',   integrationKey: 'slack',   required: true },
  ],
  editableFields: sharedEditableFields,
};

export const HighRiskShopifyZendeskSlackTemplate: SkillTemplate = {
  id: 'high-risk-shopify-zendesk-slack',
  skillTypeId: 'high-risk-order-response',
  name: 'Shopify → Zendesk + Slack',
  version: '1.0.0',
  author: 'PA Core',
  price: 0,
  compiledPolicy: sharedPolicy,
  enrichmentSpec: sharedEnrichmentSpec,
  defaultTemplates: sharedDefaultTemplates,
  slots: [
    { key: 'shopify',      label: 'Your Shopify Store',    integrationKey: 'shopify',  required: true },
    { key: 'notification', label: 'Your Zendesk Account',  integrationKey: 'zendesk',  required: true },
    { key: 'alert',        label: 'Your Slack Channel',    integrationKey: 'slack',    required: true },
  ],
  editableFields: sharedEditableFields,
};

export const HighRiskOrderTemplates: SkillTemplate[] = [
  HighRiskShopifyGorgiasSlackTemplate,
  HighRiskShopifyZendeskSlackTemplate,
];
