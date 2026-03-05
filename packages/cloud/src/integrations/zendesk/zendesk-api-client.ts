export interface ZendeskTicketParams {
  customerEmail: string;
  customerName: string;
  subject: string;
  message: string;       // HTML body — Zendesk emails this to the customer from the ticket
  tags?: string[];
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface ZendeskTicketResult {
  ticketId: string;
  ticketUrl: string;
}

/**
 * Zendesk REST API client.
 * Uses HTTP Basic Auth: {email}/token:{apiToken}
 * Docs: https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/
 */
export class ZendeskApiClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(
    subdomain: string,
    email: string,
    apiToken: string
  ) {
    this.baseUrl = `https://${subdomain}.zendesk.com/api/v2`;
    this.authHeader = `Basic ${Buffer.from(`${email}/token:${apiToken}`).toString('base64')}`;
  }

  async createTicket(params: ZendeskTicketParams): Promise<ZendeskTicketResult> {
    const body = {
      ticket: {
        subject: params.subject,
        comment: {
          html_body: params.message,
          public: true,
        },
        requester: {
          email: params.customerEmail,
          name:  params.customerName,
        },
        tags: params.tags ?? ['backorder', 'automated'],
        priority: params.priority ?? 'normal',
      },
    };

    const response = await fetch(`${this.baseUrl}/tickets.json`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Zendesk createTicket failed (${response.status}): ${text}`);
    }

    const data = await response.json() as { ticket: { id: number } };
    const subdomain = this.baseUrl.match(/https:\/\/(.+)\.zendesk\.com/)?.[1] ?? '';
    return {
      ticketId: String(data.ticket.id),
      ticketUrl: `https://${subdomain}.zendesk.com/agent/tickets/${data.ticket.id}`,
    };
  }

  /** Test credentials by fetching current user info. Throws if auth fails. */
  async testConnection(): Promise<{ agentName: string }> {
    const response = await fetch(`${this.baseUrl}/users/me.json`, {
      headers: { 'Authorization': this.authHeader },
    });

    if (!response.ok) {
      throw new Error(`Zendesk auth failed (${response.status}): check subdomain, email, and API token`);
    }

    const data = await response.json() as { user: { name: string } };
    return { agentName: data.user.name };
  }
}
