export interface GorgiasTicketParams {
  customerEmail: string;
  customerName: string;
  agentEmail: string;    // sender — must match a Gorgias email integration address
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
  private subdomain: string;

  constructor(
    subdomain: string,
    email: string,
    apiKey: string
  ) {
    this.subdomain = subdomain;
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
          sender: { email: params.agentEmail },
          source: {
            from: { address: params.agentEmail },
            to: [{ address: params.customerEmail, name: params.customerName }],
          },
          body_html: params.message,
          body_text: params.message.replace(/<[^>]*>/g, ''),
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
      ticketUrl: `https://${this.subdomain}.gorgias.com/app/ticket/${data.id}`,
    };
  }

  /**
   * List recent tickets with tag and channel info.
   * Used by agents for Skills Assessment (Path E) — read-only.
   *
   * @param daysBack - If provided, only returns tickets created within the last N days.
   *                   Use 90 for a standard Skills Assessment window.
   */
  async listRecentTickets(limit = 50, status?: string, daysBack?: number): Promise<Array<{
    id: number;
    subject: string;
    status: string;
    channel: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  }>> {
    // Fetch extra when filtering by date so client-side filtering still yields ~limit results
    const fetchLimit = Math.min(daysBack ? limit * 3 : limit, 100);
    const params = new URLSearchParams({ limit: String(fetchLimit), order_by: 'created_datetime:desc' });
    if (status) params.set('status', status);

    const response = await fetch(`${this.baseUrl}/tickets?${params}`, {
      headers: { 'Authorization': this.authHeader },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gorgias listRecentTickets failed (${response.status}): ${text}`);
    }

    const data = await response.json() as {
      data: Array<{
        id: number;
        subject: string;
        status: string;
        channel: string;
        tags: Array<{ name: string }>;
        created_datetime: string;
        updated_datetime: string;
      }>;
    };

    const sinceMs = daysBack ? Date.now() - daysBack * 24 * 60 * 60 * 1000 : 0;

    return (data.data ?? [])
      .filter(t => !daysBack || new Date(t.created_datetime).getTime() >= sinceMs)
      .slice(0, limit)
      .map(t => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        channel: t.channel,
        tags: (t.tags ?? []).map(tag => tag.name),
        createdAt: t.created_datetime,
        updatedAt: t.updated_datetime,
      }));
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
