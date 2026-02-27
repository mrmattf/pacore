import { MCPTool, MCPToolResult } from '../types';
import { GorgiasClient } from '../../clients/gorgias';

// Tool definitions
export const gorgiasTools: MCPTool[] = [
  {
    name: 'gorgias_create_ticket',
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
    name: 'gorgias_add_message',
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

// Dry-run executor - logs payloads instead of calling Gorgias
export class DryRunGorgiasToolExecutor {
  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const timestamp = new Date().toISOString();

    console.log('\n' + '='.repeat(80));
    console.log(`[DRY RUN] Gorgias tool call: ${toolName}`);
    console.log('='.repeat(80));

    switch (toolName) {
      case 'gorgias_create_ticket':
        console.log('\n📧 STEP 1: Create Ticket Request');
        console.log('-'.repeat(40));
        console.log('Endpoint: POST /api/tickets');
        console.log('Payload:');
        console.log(JSON.stringify({
          customer: {
            email: args.customer_email,
            name: args.customer_name,
          },
          subject: args.subject,
          messages: [{
            channel: 'email',
            via: 'email',
            from_agent: true,
            subject: args.subject,
            body_html: args.message,
          }],
          tags: args.tags ? (args.tags as string[]).map(name => ({ name })) : undefined,
        }, null, 2));

        console.log('\n📤 STEP 2: Send Email to Customer');
        console.log('-'.repeat(40));
        console.log(`To: ${args.customer_email}`);
        console.log(`Subject: ${args.subject}`);
        console.log('Body (HTML):');
        console.log(args.message);
        console.log('\n' + '='.repeat(80) + '\n');

        return {
          success: true,
          data: {
            ticket_id: 999999,
            subject: args.subject,
            status: 'open',
            created_at: timestamp,
            _dry_run: true,
          },
        };

      case 'gorgias_add_message':
        console.log('\n💬 STEP 1: Add Message to Ticket');
        console.log('-'.repeat(40));
        console.log(`Endpoint: POST /api/tickets/${args.ticket_id}/messages`);
        console.log('Payload:');
        console.log(JSON.stringify({
          channel: 'email',
          via: 'email',
          from_agent: true,
          body_html: args.message,
        }, null, 2));
        console.log('\n' + '='.repeat(80) + '\n');

        return {
          success: true,
          data: {
            message_id: 888888,
            ticket_id: args.ticket_id,
            created_at: timestamp,
            _dry_run: true,
          },
        };

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  }
}

// Tool implementations
export class GorgiasToolExecutor {
  constructor(private client: GorgiasClient) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      switch (toolName) {
        case 'gorgias_create_ticket':
          return await this.createTicket(args);

        case 'gorgias_add_message':
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
