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

/**
 * Describes a capability that is safe to expose to AI agents (read-only, no customer-facing side effects).
 * Adapters that define agentTools have those capabilities surfaced via the MCPGateway for agentic flows.
 */
export interface AgentToolDefinition {
  /** Must match a capability in SlotAdapter.capabilities. */
  capability: string;
  /** Description shown to the LLM in the MCP tool list. */
  description: string;
  /** JSON Schema for the capability's parameters. */
  inputSchema: Record<string, unknown>;
}

export interface SlotAdapter {
  /** Identifies this integration (matches IntegrationConnection.integrationKey). */
  readonly integrationKey: string;

  /** Bare capability names this adapter supports, e.g. ['create_ticket', 'add_message']. */
  readonly capabilities: readonly string[];

  /**
   * Subset of capabilities that are read-only and safe to expose to AI agents via the MCPGateway.
   * Write capabilities (create_ticket, send_message, register_webhook) should NOT be listed here.
   * If undefined, no capabilities are exposed to agents.
   */
  readonly agentTools?: readonly AgentToolDefinition[];

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

  /**
   * Returns the HMAC secret used to verify incoming webhook payloads.
   * Each provider resolves this however is appropriate — app-level env var,
   * per-connection secret, etc. Gateway calls this method; it never hard-codes
   * provider-specific env var names.
   *
   * @param creds Optional per-connection credentials. Adapters may use these
   *   to return a connection-specific secret (e.g. custom app client secret)
   *   instead of a platform-level env var. Callers should always pass creds
   *   when available so adapters can apply per-connection resolution.
   */
  getWebhookHmacSecret(creds?: Record<string, unknown>): string;
}

/** Type guard — returns true if the adapter also implements WebhookSourceAdapter. */
export function isWebhookSourceAdapter(a: SlotAdapter): a is SlotAdapter & WebhookSourceAdapter {
  return 'registerWebhook' in a && 'deregisterWebhook' in a && 'webhookTopics' in a && 'getWebhookHmacSecret' in a;
}
