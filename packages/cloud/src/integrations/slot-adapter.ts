/**
 * SlotAdapter — the contract every integration must implement.
 *
 * Adapters are named by functional role (integrationKey), not by skill.
 * The same adapter serves any skill that needs its capabilities.
 *
 * Adding a new integration = implement this interface + register with AdapterRegistry.
 * Zero changes to chains, MCP routers, or UI.
 */

export interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number';
  placeholder?: string;
  hint?: string;
  required?: boolean;
}

export interface SlotAdapter {
  /** Identifies this integration (matches IntegrationConnection.integrationKey). */
  readonly integrationKey: string;

  /** Bare capability names this adapter supports, e.g. ['create_ticket', 'add_message']. */
  readonly capabilities: readonly string[];

  /** Credential fields shown in the ConnectionPicker form for this integration. */
  readonly credentialFields: CredentialField[];

  /** Short setup guide shown as expandable hint in the credential form. */
  readonly setupGuide: string;

  /**
   * Validates credentials by making a real API call.
   * Throws with a user-readable message if the credentials are invalid.
   * Called when user clicks "Test Connection & Save".
   */
  testCredentials(creds: Record<string, unknown>): Promise<void>;

  /**
   * Dispatches a capability call with the given params and credentials.
   * Throws if the capability is not in this.capabilities or if the call fails.
   */
  invoke(
    capability: string,
    params: Record<string, unknown>,
    creds: Record<string, unknown>
  ): Promise<unknown>;
}

/**
 * WebhookSourceAdapter — optional extension for adapters that act as webhook sources
 * (i.e., systems that send webhooks TO PA Core, and support programmatic registration).
 *
 * Shopify implements this; AfterShip does not (dashboard-only registration).
 * Future systems implement this interface to get auto-registration for free.
 */
export interface WebhookSourceAdapter {
  /**
   * Maps skillTypeId → the webhook topic string to register with this platform.
   * e.g. { 'backorder-notification': 'orders/create', 'low-stock-impact': 'inventory_levels/update' }
   */
  readonly webhookTopics: Record<string, string>;

  /**
   * Registers a webhook with the external platform.
   * Returns the external webhook ID (for later deregistration) and optionally a signing secret.
   * For Shopify, no secret is returned — HMAC uses the app's clientSecret.
   */
  registerWebhook(
    topic: string,
    address: string,
    creds: Record<string, unknown>
  ): Promise<{ externalWebhookId: string; secret?: string }>;

  /**
   * Removes a previously registered webhook from the external platform.
   * Called when a skill trigger is deactivated/deleted.
   */
  deregisterWebhook(
    externalWebhookId: string,
    creds: Record<string, unknown>
  ): Promise<void>;
}

/** Type guard — returns true if the adapter also implements WebhookSourceAdapter. */
export function isWebhookSourceAdapter(a: SlotAdapter): a is SlotAdapter & WebhookSourceAdapter {
  return 'registerWebhook' in a && 'deregisterWebhook' in a && 'webhookTopics' in a;
}
