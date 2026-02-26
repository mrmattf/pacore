import { CredentialManager, CredentialScope } from '../../mcp/credential-manager';

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry
const TOKEN_SERVER_ID = 'platform:shopify'; // well-known server ID for Shopify creds

/**
 * Manages Shopify OAuth token lifecycle per user/org scope.
 * Fetches and refreshes client_credentials grant tokens.
 * Persists refreshed tokens back to CredentialManager so they survive restarts.
 */
export class ShopifyTokenManager {
  constructor(
    private scope: CredentialScope,
    private storeDomain: string,
    private clientId: string,
    private clientSecret: string,
    private credentialManager: CredentialManager
  ) {}

  /**
   * Get a valid access token, refreshing if needed.
   */
  async getToken(): Promise<string> {
    const stored = await this.credentialManager.getCredentials(this.scope, TOKEN_SERVER_ID);

    if (stored?.accessToken && stored.tokenExpiresAt) {
      const bufferMs = REFRESH_BUFFER_MS;
      if (Date.now() < stored.tokenExpiresAt - bufferMs) {
        return stored.accessToken;
      }
    }

    // Token missing or about to expire — refresh
    return this.refresh();
  }

  private async refresh(): Promise<string> {
    const url = `https://${this.storeDomain}/admin/oauth/access_token`;
    const response = await fetch(url, {
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
      throw new Error(`Shopify token refresh failed (${response.status}): ${body}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };

    const expiresAt = Date.now() + data.expires_in * 1000;
    const expiresAtDate = new Date(expiresAt);

    // Persist the new token so it survives process restarts
    await this.credentialManager.storeCredentials(
      this.scope,
      TOKEN_SERVER_ID,
      {
        accessToken: data.access_token,
        tokenExpiresAt: expiresAt,
        storeDomain: this.storeDomain,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      },
      expiresAtDate
    );

    return data.access_token;
  }
}
