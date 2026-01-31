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
    this.baseUrl = `https://${config.gorgiasDomain}/api`;
    this.fromEmail = config.gorgiasApiEmail;

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
            via: 'email',
            from_agent: true,
            sender: {
              email: this.fromEmail,
            },
            receiver: {
              email: params.customerEmail,
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
        via: 'email',
        from_agent: true,
        sender: {
          email: this.fromEmail,
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
