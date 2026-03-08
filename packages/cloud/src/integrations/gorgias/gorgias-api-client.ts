export interface GorgiasTicketParams {
  customerEmail: string;
  customerName: string;
  subject: string;
  message: string;       // HTML body — Gorgias emails this to the customer from the ticket
  tags?: string[];
  priority?: 'low' | 'normal' | 'high';
}

export interface GorgiasTicketResult {
  ticketId: string;
  ticketUrl: string;
}

/**
 * Gorgias REST API client.
 * Uses HTTP Basic Auth: email:apiKey
 * Docs: https://developers.gorgias.com/reference/ticket
 */
export class GorgiasApiClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(
    subdomain: string,
    private email: string,
    private apiKey: string
  ) {
    this.baseUrl = `https://${subdomain}.gorgias.com/api`;
    this.authHeader = `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`;
  }

  async createTicket(params: GorgiasTicketParams): Promise<GorgiasTicketResult> {
    const body = {
      channel: 'email',
      via: 'api',
      subject: params.subject,
      tags: (params.tags ?? ['backorder', 'automated']).map(name => ({ name })),
      customer: {
        email: params.customerEmail,
        name: params.customerName,
      },
      messages: [
        {
          channel: 'email',
          via: 'api',
          from_agent: true,
          source: {
            type: 'email',
            to: [{ address: params.customerEmail, name: params.customerName }],
          },
          body_html: params.message,
          subject: params.subject,
        },
      ],
    };

    const response = await fetch(`${this.baseUrl}/tickets`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gorgias createTicket failed (${response.status}): ${text}`);
    }

    const data = await response.json() as { id: number };
    return {
      ticketId: String(data.id),
      ticketUrl: `https://${this.authHeader.split('@')[0]}.gorgias.com/app/ticket/${data.id}`,
    };
  }

  /** Test credentials by fetching account info. Throws if auth fails. */
  async testConnection(): Promise<{ accountName: string }> {
    const response = await fetch(`${this.baseUrl}/account`, {
      headers: { 'Authorization': this.authHeader },
    });

    if (!response.ok) {
      throw new Error(`Gorgias auth failed (${response.status}): check subdomain, email, and API key`);
    }

    const data = await response.json() as { name: string };
    return { accountName: data.name };
  }
}
