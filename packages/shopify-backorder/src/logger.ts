type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  event: string;
  timestamp: string;
  [key: string]: unknown;
}

function formatLog(level: LogLevel, event: string, data?: Record<string, unknown>): string {
  const entry: LogEntry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };
  return JSON.stringify(entry);
}

export const logger = {
  info(event: string, data?: Record<string, unknown>) {
    console.log(formatLog('info', event, data));
  },

  warn(event: string, data?: Record<string, unknown>) {
    console.warn(formatLog('warn', event, data));
  },

  error(event: string, error: Error, data?: Record<string, unknown>) {
    console.error(formatLog('error', event, {
      ...data,
      error: error.message,
      stack: error.stack,
    }));
  },
};

// Slack alerting
let slackWebhookUrl: string | undefined;

export function initAlerts(webhookUrl?: string) {
  slackWebhookUrl = webhookUrl;
}

export async function alertSlack(message: string, level: 'info' | 'error' = 'info') {
  if (!slackWebhookUrl) return;

  const emoji = level === 'error' ? ':rotating_light:' : ':information_source:';

  try {
    await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emoji} *Backorder Service*: ${message}`,
      }),
    });
  } catch (err) {
    logger.error('slack.alert.failed', err as Error);
  }
}
