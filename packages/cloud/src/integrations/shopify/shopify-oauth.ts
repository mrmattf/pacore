import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { Pool } from 'pg';
import { CredentialManager } from '../../mcp/credential-manager';
import { ShopifyApiClient } from './shopify-api-client';

const SHOPIFY_SCOPES = 'read_orders,read_all_orders,read_inventory,read_products,read_customers';

/**
 * Builds the Shopify OAuth authorization URL.
 * @param shop      The merchant's myshopify.com domain (e.g. "my-store.myshopify.com")
 * @param state     Signed state JWT to pass through and verify in the callback
 * @param clientId  Optional per-connection app client ID; falls back to SHOPIFY_APP_CLIENT_ID
 */
export function buildShopifyAuthUrl(shop: string, state: string, clientId?: string): string {
  const resolvedClientId = clientId ?? process.env.SHOPIFY_APP_CLIENT_ID;
  if (!resolvedClientId) throw new Error('SHOPIFY_APP_CLIENT_ID env var is not set');

  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: resolvedClientId,
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params}`;
}

/**
 * Exchanges an authorization code for a Shopify access token.
 * Called in the callback route after verifying the state JWT.
 * @param clientId     Optional per-connection app client ID; falls back to env var
 * @param clientSecret Optional per-connection app client secret; falls back to env var
 */
export async function exchangeCodeForToken(
  shop: string,
  code: string,
  clientId?: string,
  clientSecret?: string
): Promise<string> {
  const resolvedClientId = clientId ?? process.env.SHOPIFY_APP_CLIENT_ID;
  const resolvedClientSecret = clientSecret ?? process.env.SHOPIFY_APP_CLIENT_SECRET;
  if (!resolvedClientId || !resolvedClientSecret) {
    console.error('[shopify-oauth] exchangeCodeForToken: missing client credentials', {
      shop,
      hasCustomClientId: !!clientId,
      hasEnvClientId: !!process.env.SHOPIFY_APP_CLIENT_ID,
    });
    throw new Error('SHOPIFY_APP_CLIENT_ID and SHOPIFY_APP_CLIENT_SECRET env vars are required');
  }

  const appMode = clientId ? 'custom' : 'platform';
  console.log('[shopify-oauth] exchangeCodeForToken: calling Shopify token endpoint', { shop, appMode, clientId: resolvedClientId });

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: resolvedClientId, client_secret: resolvedClientSecret, code }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('[shopify-oauth] exchangeCodeForToken: Shopify rejected token exchange', {
      shop, appMode, status: response.status, body,
    });
    throw new Error(`Shopify token exchange failed (${response.status}): ${body}`);
  }

  const data = await response.json() as { access_token: string };
  console.log('[shopify-oauth] exchangeCodeForToken: token received', { shop, appMode });
  return data.access_token;
}

/**
 * Upserts an integration_connections row and stores the OAuth credentials.
 * Handles reconnect (store already connected) by overwriting the credential entry.
 * @param clientId     Optional custom app client ID — stored with credentials for HMAC verification
 * @param clientSecret Optional custom app client secret — stored with credentials for HMAC verification
 * @returns The connection ID (UUID)
 */
export async function storeShopifyConnection(
  orgId: string,
  shop: string,
  accessToken: string,
  db: Pool,
  credentialManager: CredentialManager,
  clientId?: string,
  clientSecret?: string
): Promise<string> {
  const scope = { type: 'org' as const, orgId };

  // Upsert: if a shopify connection for this org+domain exists, reuse its ID
  const existing = await db.query(
    `SELECT id FROM integration_connections
     WHERE org_id = $1 AND integration_key = 'shopify' AND display_name = $2`,
    [orgId, `${shop} (Shopify)`]
  );

  let connectionId: string;
  if (existing.rows.length > 0) {
    connectionId = existing.rows[0].id;
    console.log('[shopify-oauth] storeShopifyConnection: reconnecting existing connection', { shop, orgId, connectionId });
    await db.query(
      `UPDATE integration_connections SET status = 'active', last_tested_at = NOW() WHERE id = $1`,
      [connectionId]
    );
  } else {
    connectionId = randomUUID();
    console.log('[shopify-oauth] storeShopifyConnection: creating new connection', { shop, orgId, connectionId });
    await db.query(
      `INSERT INTO integration_connections (id, org_id, integration_key, display_name, status, last_tested_at)
       VALUES ($1, $2, 'shopify', $3, 'active', NOW())`,
      [connectionId, orgId, `${shop} (Shopify)`]
    );
  }

  const creds: Record<string, string> = { storeDomain: shop, accessToken };
  if (clientId) creds.clientId = clientId;
  if (clientSecret) creds.clientSecret = clientSecret;

  await credentialManager.storeCredentials(scope, connectionId, creds);
  console.log('[shopify-oauth] storeShopifyConnection: credentials stored', { shop, orgId, connectionId, hasCustomCreds: !!clientId });

  return connectionId;
}

/**
 * Verifies the HMAC signature Shopify appends to the OAuth callback query string.
 * Algorithm: sort all params except `hmac`, join as key=value&..., HMAC-SHA256 with the app's client secret.
 * Returns true if valid.
 */
export function verifyShopifyCallbackHmac(
  query: Record<string, string>,
  clientSecret: string
): boolean {
  const { hmac, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('&');
  const digest = createHmac('sha256', clientSecret).update(message).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  } catch {
    return false;
  }
}

/**
 * Registers the `app/uninstalled` system webhook for a shop immediately after OAuth.
 * This is a lifecycle webhook (not a skill webhook) — registered once per shop,
 * no corresponding skill_trigger row.
 */
export async function registerAppUninstalledWebhook(
  shop: string,
  accessToken: string,
  webhookUrl: string
): Promise<void> {
  // ShopifyApiClient.registerWebhook() handles duplicate cleanup automatically
  // (deleteWebhooksForTopicAndHost) before registering the new subscription.
  const client = new ShopifyApiClient(shop, accessToken);
  await client.registerWebhook('app/uninstalled', webhookUrl);
}

function getRedirectUri(): string {
  const base = process.env.API_BASE_URL?.replace(/\/$/, '') ?? '';
  if (!base) throw new Error('API_BASE_URL env var is not set');
  return `${base}/v1/integrations/shopify/callback`;
}
