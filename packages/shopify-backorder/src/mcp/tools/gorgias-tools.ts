import { MCPTool, MCPToolResult } from '../types';
import { GorgiasClient } from '../../clients/gorgias';

// Tool definitions
export const gorgiasTools: MCPTool[] = [
  {
    name: 'gorgias.create_ticket',
    description: 'Create a new support ticket in Gorgias and send an email to the customer',
    inputSchema: {
      type: 'object',
      properties: {
        customer_email: {
          type: 'string',
          description: 'Customer email address',
        },
        customer_name: {
          type: 'string',
          description: 'Customer full name',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        message: {
          type: 'string',
          description: 'Email body (HTML supported)',
        },
        tags: {
          type: 'array',
          description: 'Tags to apply to the ticket',
          items: { type: 'string' },
        },
      },
      required: ['customer_email', 'customer_name', 'subject', 'message'],
    },
  },
  {
    name: 'gorgias.add_message',
    description: 'Add a message to an existing Gorgias ticket',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: {
          type: 'number',
          description: 'The Gorgias ticket ID',
        },
        message: {
          type: 'string',
          description: 'Message body (HTML supported)',
        },
      },
      required: ['ticket_id', 'message'],
    },
  },
];

// Tool implementations
export class GorgiasToolExecutor {
  constructor(private client: GorgiasClient) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      switch (toolName) {
        case 'gorgias.create_ticket':
          return await this.createTicket(args);

        case 'gorgias.add_message':
          return await this.addMessage(args);

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private async createTicket(args: Record<string, unknown>): Promise<MCPToolResult> {
    const ticket = await this.client.createTicket({
      customerEmail: args.customer_email as string,
      customerName: args.customer_name as string,
      subject: args.subject as string,
      message: args.message as string,
      tags: args.tags as string[] | undefined,
    });

    return {
      success: true,
      data: {
        ticket_id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        created_at: ticket.created_datetime,
      },
    };
  }

  private async addMessage(args: Record<string, unknown>): Promise<MCPToolResult> {
    const message = await this.client.addMessage(
      args.ticket_id as number,
      args.message as string
    );

    return {
      success: true,
      data: {
        message_id: message.id,
        ticket_id: message.ticket_id,
        created_at: message.created_datetime,
      },
    };
  }
}
