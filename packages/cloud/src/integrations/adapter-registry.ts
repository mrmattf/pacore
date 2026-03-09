import type { SlotAdapter, CredentialField } from './slot-adapter';
import { withRetry, isTransientError } from '../utils/retry';

/**
 * AdapterRegistry — central dispatch hub for all integration adapters.
 *
 * Replaces every switch statement that previously dispatched by slot name.
 * MCP routers and tool chains call invokeCapability() instead of
 * branching on integration type.
 *
 * Usage:
 *   const registry = new AdapterRegistry();
 *   registry.register(new ShopifyOrderAdapter());
 *   registry.register(new GorgiasNotificationAdapter());
 *
 *   await registry.invokeCapability('gorgias', 'create_ticket', params, creds);
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, SlotAdapter>();

  /**
   * Registers an adapter. Throws if an adapter for the same integrationKey
   * is already registered (fail-fast prevents silent overwrites).
   */
  register(adapter: SlotAdapter): void {
    if (this.adapters.has(adapter.integrationKey)) {
      throw new Error(
        `AdapterRegistry: adapter for '${adapter.integrationKey}' is already registered`
      );
    }
    this.adapters.set(adapter.integrationKey, adapter);
  }

  /** Returns the adapter for the given integrationKey, or undefined if not registered. */
  getAdapter(integrationKey: string): SlotAdapter | undefined {
    return this.adapters.get(integrationKey);
  }

  /** Returns all registered adapters (for tools/list aggregation). */
  getAllAdapters(): SlotAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Returns the credential fields and setup guide for a given integrationKey.
   * Returns null if the integrationKey is not registered.
   * Used by GET /v1/integrations/:key/fields.
   */
  getCredentialFields(
    integrationKey: string
  ): { credentialFields: CredentialField[]; setupGuide: string } | null {
    const adapter = this.adapters.get(integrationKey);
    if (!adapter) return null;
    return { credentialFields: adapter.credentialFields, setupGuide: adapter.setupGuide };
  }

  /**
   * Dispatches a capability call to the appropriate adapter.
   * Throws if:
   * - No adapter is registered for integrationKey
   * - The capability is not in adapter.capabilities[]
   */
  async invokeCapability(
    integrationKey: string,
    capability: string,
    params: Record<string, unknown>,
    creds: Record<string, unknown>
  ): Promise<unknown> {
    const adapter = this.adapters.get(integrationKey);
    if (!adapter) {
      throw new Error(`AdapterRegistry: no adapter registered for '${integrationKey}'`);
    }
    if (!adapter.capabilities.includes(capability)) {
      throw new Error(
        `AdapterRegistry: adapter '${integrationKey}' does not support capability '${capability}'. ` +
        `Available: ${adapter.capabilities.join(', ')}`
      );
    }
    return withRetry(
      () => adapter.invoke(capability, params, creds),
      { maxAttempts: 3, initialDelayMs: 1000, multiplier: 2, shouldRetry: isTransientError }
    );
  }
}
