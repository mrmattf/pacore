import type { SlotAdapter, CredentialField } from '../slot-adapter';

/**
 * SlotAdapter for Slack Incoming Webhooks.
 *
 * Credential: a single Incoming Webhook URL (generated per channel in Slack).
 * Capability: 'send_message' — POSTs a message to the channel.
 *
 * HTML in message/subject is automatically stripped to plain text before posting,
 * since Slack uses mrkdwn (not HTML) for formatting.
 */
export class SlackAlertAdapter implements SlotAdapter {
  readonly integrationKey = 'slack';
  readonly capabilities = ['send_message'] as const;

  readonly credentialFields: CredentialField[] = [
    {
      key: 'webhookUrl',
      label: 'Incoming Webhook URL',
      type: 'text',
      placeholder: 'https://hooks.slack.com/services/...',
      hint: 'Slack → api.slack.com/apps → Create App → Incoming Webhooks → Activate → Add to Workspace → Copy URL',
    },
  ];

  readonly setupGuide =
    'Slack → api.slack.com/apps → Create New App → Incoming Webhooks → Activate → ' +
    'Add New Webhook to Workspace → select channel → Copy Webhook URL';

  async testCredentials(creds: Record<string, unknown>): Promise<void> {
    const webhookUrl = creds.webhookUrl as string;
    if (!webhookUrl?.startsWith('https://hooks.slack.com/')) {
      throw new Error(
        'Invalid Slack webhook URL — must start with https://hooks.slack.com/'
      );
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '✓ PA Core connected successfully.' }),
    });

    if (!response.ok) {
      throw new Error(
        `Slack webhook test failed (${response.status}) — check that the webhook URL is valid and active`
      );
    }
  }

  async invoke(
    capability: string,
    params: Record<string, unknown>,
    creds: Record<string, unknown>
  ): Promise<unknown> {
    if (capability !== 'send_message') {
      throw new Error(`SlackAlertAdapter: unsupported capability '${capability}'`);
    }
    return this.sendMessage(params, creds);
  }

  private async sendMessage(
    params: Record<string, unknown>,
    creds: Record<string, unknown>
  ): Promise<{ ok: boolean }> {
    const webhookUrl = creds.webhookUrl as string;
    if (!webhookUrl) {
      throw new Error('SlackAlertAdapter: missing webhookUrl in credentials');
    }

    // subject → bold heading; message → plain text body (HTML stripped)
    const subject = params.subject as string | undefined;
    const message = params.message as string | undefined;

    const parts: string[] = [];
    if (subject) parts.push(`*${stripHtml(subject)}*`);
    if (message) parts.push(stripHtml(message));
    const text = parts.join('\n');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Slack send_message failed (${response.status}): ${body}`);
    }

    return { ok: true };
  }
}

/**
 * Strips HTML tags and decodes common HTML entities, converting <br> to newlines.
 * Used to convert HTML email templates to Slack-friendly plain text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
