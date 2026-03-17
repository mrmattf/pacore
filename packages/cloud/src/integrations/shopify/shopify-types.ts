/**
 * Shopify-specific credential shape stored in CredentialManager.
 * Used internally by ShopifyOrderAdapter — not a platform type.
 *
 * clientId / clientSecret are only present for custom-app connections where
 * each store has its own Shopify app registration. When absent, the platform
 * falls back to SHOPIFY_APP_CLIENT_ID / SHOPIFY_APP_CLIENT_SECRET env vars
 * (used by the public unlisted app that serves all stores uniformly).
 */
export interface ShopifyConnectionCredentials {
  storeDomain: string;    // "my-store.myshopify.com"
  accessToken: string;    // OAuth access token from Shopify Authorization Code flow
  clientId?: string;      // Custom app client ID (overrides env var when present)
  clientSecret?: string;  // Custom app client secret (overrides env var when present)
}
