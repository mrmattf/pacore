export interface ReamazeTicketParams {
  customerEmail: string;
  customerName: string;
  subject: string;
  message: string;       // HTML body — Re:amaze emails this to the customer from the conversation
  tags?: string[];
}

export interface ReamazeTicketResult {
  ticketId: string;
  ticketUrl: string;
}

/**
 * Re:amaze REST API client.
 * Uses HTTP Basic Auth: email:apiToken
 * Docs: https://www.reamaze.com/api/post_conversations
 */
export class ReamazeApiClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(
    brand: string,
    email: string,
    apiToken: string
  ) {
    this.baseUrl = `https://${brand}.reamaze.com/api/v1`;
    this.authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
  }

  async createTicket(params: ReamazeTicketParams): Promise<ReamazeTicketResult> {
    const body = {
      conversation: {
        subject: params.subject,
        message: {
          body: params.message,
        },
        user: {
          email: params.customerEmail,
          name:  params.customerName,
        },
        tag_list: (params.tags ?? ['backorder', 'automated']).join(', '),
      },
    };

    const response = await fetch(`${this.baseUrl}/conversations`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Re:amaze createTicket failed (${response.status}): ${text}`);
    }

    const data = await response.json() as { slug: string };
    const brand = this.baseUrl.match(/https:\/\/(.+)\.reamaze\.com/)?.[1] ?? '';
    return {
      ticketId: data.slug,
      ticketUrl: `https://${brand}.reamaze.com/conversations/${data.slug}`,
    };
  }

  /** Test credentials by fetching account info. Throws if auth fails. */
  async testConnection(): Promise<{ accountName: string }> {
    const response = await fetch(`${this.baseUrl}/me`, {
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Re:amaze auth failed (${response.status}): check brand subdomain, email, and API token`);
    }

    const data = await response.json() as { login?: string; name?: string };
    return { accountName: data.name ?? data.login ?? 'Re:amaze' };
  }
}