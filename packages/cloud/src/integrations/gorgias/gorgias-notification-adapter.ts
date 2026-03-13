import type { NotificationToolAdapter, CreateTicketParams } from '@pacore/core';
import type { SlotAdapter, CredentialField, AgentToolDefinition } from '../slot-adapter';
import { GorgiasApiClient } from './gorgias-api-client';

/**
 * Implements both NotificationToolAdapter and SlotAdapter.
 * Gorgias automatically emails the customer when a ticket is created — PA Core never sends email directly.
 */
export class GorgiasNotificationAdapter implements NotificationToolAdapter, SlotAdapter {
  readonly integrationKey = 'gorgias';
  readonly capabilities = ['create_ticket', 'add_message', 'list_recent_tickets'] as const;

  /**
   * Read-only capabilities exposed to AI agents via the MCPGateway.
   * Write capabilities (create_ticket, add_message) are excluded — managed by skill chains only.
   * list_recent_tickets enables Path E (Skills Assessment): analyze ticket categories and volume.
   */
  readonly agentTools: readonly AgentToolDefinition[] = [
    {
      capability: 'list_recent_tickets',
      description:
        'List recent Gorgias support tickets with their tags, channel, and status. ' +
        'Use this to analyze support ticket volume, common categories, and trends for a Skills Assessment.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of tickets to return (default: 50, max: 100)',
          },
          status: {
            type: 'string',
            enum: ['open', 'closed', 'resolved'],
            description: 'Filter by ticket status (optional)',
          },
        },
        required: [],
      },
    },
  ];

  readonly credentialFields: CredentialField[] = [
    { key: 'subdomain',    label: 'Subdomain',       type: 'text',     placeholder: 'mystore (from mystore.gorgias.com)' },
    { key: 'email',        label: 'Login Email',      type: 'text',     hint: 'The email you use to log in to Gorgias' },
    { key: 'apiKey',       label: 'API Key',          type: 'password', hint: 'Gorgias Settings → REST API → Create API Key' },
    { key: 'supportEmail', label: 'Support Email',    type: 'text',     hint: 'Optional. The outbound email address of your Gorgias email integration (e.g. support@yourstore.com). Leave blank if it matches your login email.' },
  ];

  readonly setupGuide = 'Gorgias Settings → REST API → Generate API Key';

  async testCredentials(creds: Record<string, unknown>): Promise<void> {
    await this.buildClient(creds).testConnection();
  }

  async invoke(
    capability: string,
    params: Record<string, unknown>,
    creds: Record<string, unknown>
  ): Promise<unknown> {
    switch (capability) {
      case 'create_ticket':
        return this.createTicket(params as unknown as CreateTicketParams, creds);
      case 'list_recent_tickets':
        return this.buildClient(creds).listRecentTickets(
          (params.limit as number | undefined) ?? 50,
          params.status as string | undefined
        );
      default:
        throw new Error(`GorgiasNotificationAdapter: unsupported capability '${capability}'`);
    }
  }

  async createTicket(
    params: CreateTicketParams,
    creds: Record<string, unknown>
  ): Promise<{ ticketId: string }> {
    const client = this.buildClient(creds);
    const result = await client.createTicket({
      customerEmail: params.customerEmail,
      customerName:  params.customerName,
      agentEmail:    (creds.supportEmail || creds.email) as string,
      subject:       params.subject,
      message:       params.message,
      tags:          params.tags ?? ['backorder', 'automated'],
      priority:      params.priority,
    });
    return { ticketId: result.ticketId };
  }

  private buildClient(creds: Record<string, unknown>): GorgiasApiClient {
    const subdomain = creds.subdomain as string;
    const email     = creds.email     as string;
    const apiKey    = creds.apiKey    as string;

    if (!subdomain || !email || !apiKey) {
      throw new Error('GorgiasNotificationAdapter: missing subdomain, email, or apiKey');
    }

    return new GorgiasApiClient(subdomain, email, apiKey);
  }
}
