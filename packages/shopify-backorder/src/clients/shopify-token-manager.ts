import { Config } from '../config';
import { logger } from '../logger';

interface TokenResponse {
  access_token: string;
  expires_in: number; // seconds
  token_type: string;
}

/**
 * Manages Shopify OAuth access tokens using the client credentials grant flow.
 * Automatically refreshes the token before it expires.
 *
 * Shopify's shpua_ tokens from the OAuth flow expire (typically 24h).
 * This manager keeps a valid token at all times.
 */
export class ShopifyTokenManager {
  private accessToken: string;
  private expiresAt: number; // unix ms
  private refreshTimer: NodeJS.Timeout | null = null;
  private readonly tokenUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  // Refresh 5 minutes before expiry to avoid race conditions
  private static readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;

  constructor(config: Config) {
    this.clientId = config.shopifyClientId;
    this.clientSecret = config.shopifyClientSecret;
    this.tokenUrl = `https://${config.shopifyStoreDomain}/admin/oauth/access_token`;

    // Use bootstrap token if provided, will be replaced on first refresh
    this.accessToken = config.shopifyAccessToken ?? '';
    this.expiresAt = config.shopifyAccessToken
      ? Date.now() + 60 * 60 * 1000 // assume 1h remaining for bootstrap token
      : 0; // expired, force immediate refresh
  }

  /**
   * Initialize the token manager - fetches a fresh token on startup.
   */
  async initialize(): Promise<void> {
    await this.refresh();
  }

  /**
   * Get the current valid access token.
   * Refreshes synchronously if expired (shouldn't happen in normal operation).
   */
  async getToken(): Promise<string> {
    if (Date.now() >= this.expiresAt) {
      logger.info('shopify.token.expired', { reason: 'expired before scheduled refresh' });
      await this.refresh();
    }
    return this.accessToken;
  }

  private async refresh(): Promise<void> {
    try {
      logger.info('shopify.token.refreshing');

      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${body}`);
      }

      const data = await response.json() as TokenResponse;

      this.accessToken = data.access_token;
      this.expiresAt = Date.now() + data.expires_in * 1000;

      logger.info('shopify.token.refreshed', {
        expiresIn: data.expires_in,
        expiresAt: new Date(this.expiresAt).toISOString(),
      });

      this.scheduleRefresh(data.expires_in * 1000);
    } catch (error) {
      logger.error('shopify.token.refresh_failed', error as Error);
      throw error;
    }
  }

  private scheduleRefresh(expiresInMs: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const refreshInMs = Math.max(0, expiresInMs - ShopifyTokenManager.REFRESH_BUFFER_MS);

    logger.info('shopify.token.refresh_scheduled', {
      refreshInMinutes: Math.round(refreshInMs / 60000),
    });

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refresh();
      } catch (error) {
        // Retry after 1 minute if refresh fails
        logger.error('shopify.token.refresh_retry', error as Error);
        this.scheduleRefresh(60 * 1000);
      }
    }, refreshInMs);

    // Don't let the timer keep the process alive
    this.refreshTimer.unref();
  }

  destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
