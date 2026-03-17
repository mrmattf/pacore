/**
 * Shopify-specific credential shape stored in CredentialManager.
 * Used internally by ShopifyOrderAdapter — not a platform type.
 */
export interface ShopifyConnectionCredentials {
  storeDomain: string;   // "my-store.myshopify.com"
  accessToken: string;   // OAuth access token from Shopify Authorization Code flow
}
