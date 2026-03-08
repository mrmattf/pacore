import type { NotificationToolAdapter, CreateTicketParams } from '@pacore/core';
import type { SlotAdapter, CredentialField } from '../slot-adapter';
import { ReamazeApiClient } from './reamaze-api-client';

/**
 * Implements both NotificationToolAdapter and SlotAdapter.
 * Re:amaze automatically emails the customer when a conversation is created — PA Core never sends email directly.
 */
export class ReamazeNotificationAdapter implements NotificationToolAdapter, SlotAdapter {
  readonly integrationKey = 'reamaze';
  readonly capabilities = ['create_ticket'] as const;

  readonly credentialFields: CredentialField[] = [
    { key: 'brand',    label: 'Brand Subdomain', type: 'text',     placeholder: 'mystore (from mystore.reamaze.com)' },
    { key: 'email',    label: 'Email',            type: 'text',     hint: 'Your Re:amaze login email' },
    { key: 'apiToken', label: 'API Token',        type: 'password', hint: 'Re:amaze Settings → API Access Token' },
  ];

  readonly setupGuide = 'Re:amaze Settings → API Access → copy your API Token';

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
        throw new Error(`ReamazeNotificationAdapter: unsupported capability '${capability}'`);
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
      subject:       params.subject,
      message:       params.message,
      tags:          params.tags ?? ['backorder', 'automated'],
    });
    return { ticketId: result.ticketId };
  }

  private buildClient(creds: Record<string, unknown>): ReamazeApiClient {
    const brand    = creds.brand    as string;
    const email    = creds.email    as string;
    const apiToken = creds.apiToken as string;

    if (!brand || !email || !apiToken) {
      throw new Error('ReamazeNotificationAdapter: missing brand, email, or apiToken');
    }

    return new ReamazeApiClient(brand, email, apiToken);
  }
}