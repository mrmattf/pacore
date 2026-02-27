import { MCPTool, MCPToolResult } from '../types';
import { getTemplateConfig, setTemplateConfig, TemplateConfig } from '../../templates/template-store';
import {
  renderAllBackorderedEmailHtml,
  renderPartialBackorderEmailHtml,
  applyCustomHtml,
  renderBackorderedRows,
  renderAvailableRows,
  BackorderedItem,
} from '../../templates/backorder-email';
import { ShopifyOrder, ShopifyLineItem } from '../../clients/shopify';

// Tool definitions

export const configTools = [
  {
    name: 'config_get_template',
    description: 'Get the current email template configuration (style, messages, and HTML overrides).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'config_update_style',
    description:
      'Update email style settings. All fields are optional — only provided fields are changed. ' +
      'Pass an empty string to clear a field back to its default.',
    inputSchema: {
      type: 'object',
      properties: {
        brandName:    { type: 'string', description: 'Company name shown in the email footer' },
        logoUrl:      { type: 'string', description: 'HTTPS URL for a logo image shown above the order heading (or "" to remove)' },
        primaryColor: { type: 'string', description: 'Heading color as a hex code, e.g. #1a365d' },
        accentColor:  { type: 'string', description: 'Backordered status color as a hex code, e.g. #e53e3e' },
        signOff:      { type: 'string', description: 'Sign-off name, e.g. "The Yota Team"' },
        footerText:   { type: 'string', description: 'Footer line, e.g. "Questions? Email support@yota.com"' },
      },
      required: [],
    },
  },
  {
    name: 'config_update_messages',
    description:
      'Update the email copy for a given scenario. All message fields are optional — only provided fields are changed. ' +
      'Supports {{orderNumber}} and {{customerName}} template variables.',
    inputSchema: {
      type: 'object',
      properties: {
        scenario:      { type: 'string', description: 'Which email to update: "partialBackorder" or "allBackordered"' },
        subject:       { type: 'string', description: 'Email subject line. Supports {{orderNumber}}, {{customerName}}' },
        intro:         { type: 'string', description: 'Opening paragraph shown after the greeting' },
        closing:       { type: 'string', description: 'Closing line shown before the sign-off' },
        optionsTitle:  { type: 'string', description: '(partialBackorder only) Heading above the options box' },
        waitMessage:   { type: 'string', description: '(allBackordered only) "We will ship when back in stock" copy' },
        cancelMessage: { type: 'string', description: '(allBackordered only) "Reply to cancel" copy' },
      },
      required: ['scenario'],
    },
  },
  {
    name: 'config_set_html',
    description:
      'Set a full custom HTML email for a scenario, overriding all generated templates and styling. ' +
      'Inline CSS is recommended for best email client compatibility. ' +
      'Available template variables: {{orderNumber}}, {{customerName}}, {{backorderedItemsRows}}, {{availableItemsRows}}. ' +
      'Pass an empty string to revert to the auto-generated template.',
    inputSchema: {
      type: 'object',
      properties: {
        scenario: { type: 'string', description: 'Which email to override: "partialBackorder" or "allBackordered"' },
        html:     { type: 'string', description: 'Full HTML email with inline CSS. Use "" to remove the override.' },
      },
      required: ['scenario', 'html'],
    },
  },
  {
    name: 'config_preview_email',
    description:
      'Generate a sample email HTML with realistic mock order data so you can see exactly what ' +
      'customers will receive. Returns the rendered HTML string.',
    inputSchema: {
      type: 'object',
      properties: {
        scenario: { type: 'string', description: 'Which email to preview: "partialBackorder" or "allBackordered"' },
      },
      required: ['scenario'],
    },
  },
] as unknown as MCPTool[];

// ─── Executor ─────────────────────────────────────────────────────────────────

export class ConfigToolExecutor {
  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      switch (toolName) {
        case 'config_get_template':
          return this.getTemplate();
        case 'config_update_style':
          return this.updateStyle(args);
        case 'config_update_messages':
          return this.updateMessages(args);
        case 'config_set_html':
          return this.setHtml(args);
        case 'config_preview_email':
          return this.previewEmail(args);
        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private getTemplate(): MCPToolResult {
    return { success: true, data: getTemplateConfig() };
  }

  private updateStyle(args: Record<string, unknown>): MCPToolResult {
    const current = getTemplateConfig();
    const style = { ...(current.style ?? {}) };

    const stringKeys = ['brandName', 'logoUrl', 'primaryColor', 'accentColor', 'signOff', 'footerText'] as const;
    for (const key of stringKeys) {
      if (key in args) {
        const val = args[key];
        if (val === null || val === undefined || val === '') {
          delete style[key];
        } else if (typeof val === 'string') {
          style[key] = val;
        }
      }
    }

    const updated: TemplateConfig = {
      ...current,
      style: Object.keys(style).length > 0 ? style : undefined,
    };
    setTemplateConfig(updated);
    return { success: true, data: updated };
  }

  private updateMessages(args: Record<string, unknown>): MCPToolResult {
    const scenario = args['scenario'] as string;
    if (scenario !== 'partialBackorder' && scenario !== 'allBackordered') {
      return { success: false, error: 'scenario must be "partialBackorder" or "allBackordered"' };
    }

    const current = getTemplateConfig();
    const messages = {
      partialBackorder: { ...(current.messages?.partialBackorder ?? {}) },
      allBackordered:   { ...(current.messages?.allBackordered ?? {}) },
    };

    const target = messages[scenario] as Record<string, unknown>;
    const allKeys = ['subject', 'intro', 'closing', 'optionsTitle', 'waitMessage', 'cancelMessage'] as const;

    for (const key of allKeys) {
      if (key in args) {
        const val = args[key];
        if (val === null || val === undefined || val === '') {
          delete target[key];
        } else if (typeof val === 'string') {
          target[key] = val;
        }
      }
    }

    const updated: TemplateConfig = {
      ...current,
      messages: {
        partialBackorder: Object.keys(messages.partialBackorder).length > 0 ? messages.partialBackorder : undefined,
        allBackordered:   Object.keys(messages.allBackordered).length > 0 ? messages.allBackordered : undefined,
      },
    };
    setTemplateConfig(updated);
    return { success: true, data: updated };
  }

  private setHtml(args: Record<string, unknown>): MCPToolResult {
    const scenario = args['scenario'] as string;
    const html = args['html'] as string;

    if (scenario !== 'partialBackorder' && scenario !== 'allBackordered') {
      return { success: false, error: 'scenario must be "partialBackorder" or "allBackordered"' };
    }

    const current = getTemplateConfig();
    const htmlConfig = { ...(current.html ?? {}) };

    if (html === '' || html === null || html === undefined) {
      delete htmlConfig[scenario];
    } else {
      htmlConfig[scenario] = html;
    }

    const updated: TemplateConfig = {
      ...current,
      html: Object.keys(htmlConfig).length > 0 ? htmlConfig : undefined,
    };
    setTemplateConfig(updated);
    return { success: true, data: { scenario, cleared: !html, message: html ? 'Custom HTML set.' : 'Custom HTML cleared — using generated template.' } };
  }

  private previewEmail(args: Record<string, unknown>): MCPToolResult {
    const scenario = args['scenario'] as string;
    if (scenario !== 'partialBackorder' && scenario !== 'allBackordered') {
      return { success: false, error: 'scenario must be "partialBackorder" or "allBackordered"' };
    }

    const config = getTemplateConfig();

    // Mock order data
    const mockOrder: ShopifyOrder = {
      id: 9001,
      order_number: 1042,
      email: 'jane@example.com',
      customer: { id: 1, email: 'jane@example.com', first_name: 'Jane', last_name: 'Smith' },
      line_items: [],
      total_price: '199.98',
      created_at: new Date().toISOString(),
    };

    const mockBackordered: BackorderedItem[] = [
      {
        lineItem: { id: 1, variant_id: 101, product_id: 201, title: 'Snowboard Pro X1', quantity: 2, price: '79.99', sku: 'SB-PRO-X1' },
        available: 0,
        backordered: 2,
      },
    ];

    const mockAvailable: ShopifyLineItem[] = scenario === 'partialBackorder'
      ? [{ id: 2, variant_id: 102, product_id: 202, title: 'Snowboard Binding Set', quantity: 1, price: '39.99', sku: 'SB-BIND-01' }]
      : [];

    let emailHtml: string;
    if (scenario === 'allBackordered') {
      const customHtml = config.html?.allBackordered;
      if (customHtml) {
        const vars = {
          orderNumber: String(mockOrder.order_number),
          customerName: mockOrder.customer.first_name || 'Valued Customer',
          backorderedItemsRows: renderBackorderedRows(mockBackordered),
          availableItemsRows: renderAvailableRows([]),
        };
        emailHtml = applyCustomHtml(customHtml, vars);
      } else {
        emailHtml = renderAllBackorderedEmailHtml(mockOrder, mockBackordered, config);
      }
    } else {
      const customHtml = config.html?.partialBackorder;
      if (customHtml) {
        const vars = {
          orderNumber: String(mockOrder.order_number),
          customerName: mockOrder.customer.first_name || 'Valued Customer',
          backorderedItemsRows: renderBackorderedRows(mockBackordered),
          availableItemsRows: renderAvailableRows(mockAvailable),
        };
        emailHtml = applyCustomHtml(customHtml, vars);
      } else {
        emailHtml = renderPartialBackorderEmailHtml(mockOrder, mockBackordered, mockAvailable, config);
      }
    }

    return {
      success: true,
      data: {
        scenario,
        html: emailHtml,
        note: 'This is a preview with sample order data (Order #1042, customer Jane Smith).',
      },
    };
  }
}
