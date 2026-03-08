import type { NotificationToolAdapter, CreateTicketParams } from '@pacore/core';
import type { SlotAdapter, CredentialField } from '../slot-adapter';
import { GorgiasApiClient } from './gorgias-api-client';

/**
 * Implements both NotificationToolAdapter and SlotAdapter.
 * Gorgias automatically emails the customer when a ticket is created — PA Core never sends email directly.
 */
export class GorgiasNotificationAdapter implements NotificationToolAdapter, SlotAdapter {
  readonly integrationKey = 'gorgias';
  readonly capabilities = ['create_ticket', 'add_message'] as const;

  readonly credentialFields: CredentialField[] = [
    { key: 'subdomain', label: 'Subdomain',  type: 'text',     placeholder: 'mystore (from mystore.gorgias.com)' },
    { key: 'email',     label: 'Email',      type: 'text',     hint: 'The email you use to log in to Gorgias' },
    { key: 'apiKey',    label: 'API Key',    type: 'password', hint: 'Gorgias Settings → REST API → Create API Key' },
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
      agentEmail:    creds.email as string,
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
