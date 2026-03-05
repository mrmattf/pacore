import type { NotificationToolAdapter, CreateTicketParams } from '@pacore/core';
import type { SlotAdapter, CredentialField } from '../slot-adapter';
import { ZendeskApiClient } from './zendesk-api-client';

/**
 * Implements both NotificationToolAdapter and SlotAdapter.
 * Zendesk automatically emails the customer when a ticket is created — PA Core never sends email directly.
 */
export class ZendeskNotificationAdapter implements NotificationToolAdapter, SlotAdapter {
  readonly integrationKey = 'zendesk';
  readonly capabilities = ['create_ticket'] as const;

  readonly credentialFields: CredentialField[] = [
    { key: 'subdomain', label: 'Subdomain',  type: 'text',     placeholder: 'mystore (from mystore.zendesk.com)' },
    { key: 'email',     label: 'Email',      type: 'text',     hint: 'Your Zendesk agent email' },
    { key: 'apiToken',  label: 'API Token',  type: 'password', hint: 'Zendesk Admin → Apps & Integrations → APIs → Zendesk API → Add Token' },
  ];

  readonly setupGuide = 'Zendesk Admin Center → Apps & Integrations → APIs → Zendesk API → API token → Add';

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
      default:
        throw new Error(`ZendeskNotificationAdapter: unsupported capability '${capability}'`);
    }
  }

  async createTicket(
    params: CreateTicketParams,
    creds: Record<string, unknown>
  ): Promise<{ ticketId: string }> {
    const client = this.buildClient(creds);
    const zdPriority = params.priority === 'high' ? 'high' : params.priority ?? 'normal';

    const result = await client.createTicket({
      customerEmail: params.customerEmail,
      customerName:  params.customerName,
      subject:       params.subject,
      message:       params.message,
      tags:          params.tags ?? ['backorder', 'automated'],
      priority:      zdPriority as 'low' | 'normal' | 'high',
    });
    return { ticketId: result.ticketId };
  }

  private buildClient(creds: Record<string, unknown>): ZendeskApiClient {
    const subdomain = creds.subdomain as string;
    const email     = creds.email     as string;
    const apiToken  = creds.apiToken  as string;

    if (!subdomain || !email || !apiToken) {
      throw new Error('ZendeskNotificationAdapter: missing subdomain, email, or apiToken');
    }

    return new ZendeskApiClient(subdomain, email, apiToken);
  }
}
