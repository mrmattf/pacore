import { SkillDefinition } from '@pacore/core';

export const BackorderDetectionSkill: SkillDefinition = {
  id: 'backorder-detection',
  name: 'Backorder Detection',
  version: '1.0.0',
  description:
    'Detect inventory shortfalls when orders are placed and automatically notify customers via Gorgias. ' +
    'Enter your Shopify and Gorgias credentials — no MCP server setup required.',
  triggerType: 'webhook',
  toolChain: 'backorder-detection',
  requiredCapabilities: ['shopify', 'notification'],
  configSchema: {
    type: 'object',
    properties: {
      // ── Shopify ──────────────────────────────────────────────
      shopifyDomain: {
        type: 'string',
        title: 'Store domain',
        description: 'e.g. my-store.myshopify.com',
        'x-group': 'shopify',
        'x-group-label': 'Connect Shopify',
      },
      shopifyClientId: {
        type: 'string',
        title: 'Client ID',
        description: 'From Shopify Partners → App → API credentials',
        'x-group': 'shopify',
      },
      shopifyClientSecret: {
        type: 'string',
        title: 'Client secret',
        format: 'password',
        'x-group': 'shopify',
      },

      // ── Gorgias ──────────────────────────────────────────────
      gorgiasApiKey: {
        type: 'string',
        title: 'API key',
        description: 'From Gorgias Settings → REST API',
        format: 'password',
        'x-group': 'gorgias',
        'x-group-label': 'Connect Gorgias',
      },
      gorgiasEmail: {
        type: 'string',
        title: 'Account email',
        description: 'The email you use to log in to Gorgias',
        'x-group': 'gorgias',
      },
      gorgiasFromEmail: {
        type: 'string',
        title: 'From email (optional)',
        description: 'Sender address shown on tickets — must match a Gorgias email integration',
        'x-group': 'gorgias',
      },

      // ── Configure ────────────────────────────────────────────
      inventoryThreshold: {
        type: 'number',
        title: 'Inventory threshold',
        description: 'Items with available stock at or below this number are considered backordered',
        default: 0,
        'x-group': 'configure',
        'x-group-label': 'Configure',
      },
      subjectTemplate: {
        type: 'string',
        title: 'Email subject template',
        description: 'Use {orderNumber} as a placeholder for the order number',
        default: 'Order #{orderNumber} — Backorder Update',
        'x-group': 'configure',
      },
      notificationToolName: {
        type: 'string',
        title: 'Notification tool',
        description: 'The Gorgias MCP tool that creates a ticket',
        default: 'gorgias.create_ticket',
        'x-group': 'configure',
      },
    },
    required: ['shopifyDomain', 'shopifyClientId', 'shopifyClientSecret', 'gorgiasApiKey', 'gorgiasEmail'],
  },
};
