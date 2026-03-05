// Named account-level connection to an external integration.
// Credentials are stored in CredentialManager keyed by this record's id (UUID).
// Multiple connections of the same integrationKey are supported (e.g., two Shopify stores).

export interface IntegrationConnection {
  id: string;            // UUID — used as the key in CredentialManager
  userId: string;        // owner (org-level connections use org_id in the DB but map here for simplicity)
  integrationKey: string; // "shopify" | "zendesk" | "gorgias" | "freshdesk"
  displayName: string;   // user-chosen: "Acme Store", "Main Zendesk"
  status: 'active' | 'expired' | 'error';
  lastTestedAt: Date | null;
  createdAt: Date;
}

// Credentials shape stored in CredentialManager per integrationKey.
// Only the fields relevant to that integration are populated.

export interface ShopifyConnectionCredentials {
  storeDomain: string;    // "my-store.myshopify.com"
  clientId: string;
  clientSecret: string;
}

export interface GorgiasConnectionCredentials {
  subdomain: string;      // "mystore" → https://mystore.gorgias.com
  email: string;
  apiKey: string;
}

export interface ZendeskConnectionCredentials {
  subdomain: string;      // "mystore" → https://mystore.zendesk.com
  email: string;
  apiToken: string;
}

export interface FreshdeskConnectionCredentials {
  subdomain: string;      // "mystore" → https://mystore.freshdesk.com
  apiKey: string;
}

export type AnyConnectionCredentials =
  | ShopifyConnectionCredentials
  | GorgiasConnectionCredentials
  | ZendeskConnectionCredentials
  | FreshdeskConnectionCredentials;
