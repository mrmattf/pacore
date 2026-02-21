import { Config } from '../config';

export interface GorgiasTicket {
  id: number;
  subject: string;
  status: string;
  created_datetime: string;
}

export interface GorgiasMessage {
  id: number;
  ticket_id: number;
  channel: string;
  via: string;
  created_datetime: string;
}

export class GorgiasClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private fromEmail: string;

  constructor(config: Config) {
    // Validate required Gorgias config (should only be called when gorgiasEnabled=true)
    if (!config.gorgiasDomain || !config.gorgiasApiKey || !config.gorgiasApiEmail) {
      throw new Error('Gorgias credentials required when GORGIAS_ENABLED=true');
    }

    this.baseUrl = `https://${config.gorgiasDomain}/api`;

    // GORGIAS_FROM_EMAIL must match a configured email integration in Gorgias
    // (e.g. support@yourstore.com) - cannot be an arbitrary email address
    this.fromEmail = config.gorgiasFromEmail ?? config.gorgiasApiEmail;

    // Gorgias uses Basic Auth with email:api_key
    const auth = Buffer.from(`${config.gorgiasApiEmail}:${config.gorgiasApiKey}`).toString('base64');
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    };
  }

  async createTicket(params: {
    customerEmail: string;
    customerName: string;
    subject: string;
    message: string;
    tags?: string[];
  }): Promise<GorgiasTicket> {
    const response = await fetch(`${this.baseUrl}/tickets`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        customer: {
          email: params.customerEmail,
          name: params.customerName,
        },
        subject: params.subject,
        messages: [
          {
            channel: 'email',
            via: 'api',
            from_agent: true,
            sender: {
              email: this.fromEmail,
            },
            source: {
              from: { address: this.fromEmail },
              to: [{ address: params.customerEmail }],
            },
            subject: params.subject,
            body_html: params.message,
            body_text: params.message.replace(/<[^>]*>/g, ''),
          },
        ],
        tags: params.tags ? params.tags.map(name => ({ name })) : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gorgias API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<GorgiasTicket>;
  }

  async addMessage(ticketId: number, message: string): Promise<GorgiasMessage> {
    const response = await fetch(`${this.baseUrl}/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        channel: 'email',
        via: 'api',
        from_agent: true,
        sender: {
          email: this.fromEmail,
        },
        source: {
          from: { address: this.fromEmail },
        },
        body_html: message,
        body_text: message.replace(/<[^>]*>/g, ''),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gorgias API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<GorgiasMessage>;
  }
}
