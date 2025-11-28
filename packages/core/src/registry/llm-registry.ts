import { LLMProvider, LLMConfig, ValidationResult } from '../types';

/**
 * Registry for managing LLM providers and user configurations
 */
export class LLMProviderRegistry {
  private providers = new Map<string, LLMProvider>();
  private userConfigs = new Map<string, Map<string, LLMConfig>>();
  private defaultProviders = new Map<string, string>(); // userId -> providerId

  /**
   * Register a new LLM provider
   */
  registerProvider(provider: LLMProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider with id ${provider.id} already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
  }

  /**
   * Get all registered providers
   */
  getProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get a specific provider by ID
   */
  getProvider(providerId: string): LLMProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Configure an LLM provider for a specific user
   */
  async configureLLMForUser(
    userId: string,
    providerId: string,
    config: LLMConfig
  ): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    // Validate configuration
    const validation = provider.validateConfig(config);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid configuration');
    }

    // Store user configuration
    if (!this.userConfigs.has(userId)) {
      this.userConfigs.set(userId, new Map());
    }

    this.userConfigs.get(userId)!.set(providerId, config);
  }

  /**
   * Remove a provider configuration for a user
   */
  removeUserProviderConfig(userId: string, providerId: string): void {
    const userConfigs = this.userConfigs.get(userId);
    if (userConfigs) {
      userConfigs.delete(providerId);

      // Remove default if it was this provider
      if (this.defaultProviders.get(userId) === providerId) {
        this.defaultProviders.delete(userId);
      }
    }
  }

  /**
   * Get all configured providers for a user
   */
  getUserProviders(userId: string): string[] {
    const userConfigs = this.userConfigs.get(userId);
    if (!userConfigs) return [];
    return Array.from(userConfigs.keys());
  }

  /**
   * Set default provider for a user
   */
  setDefaultProvider(userId: string, providerId: string): void {
    const userConfigs = this.userConfigs.get(userId);
    if (!userConfigs?.has(providerId)) {
      throw new Error(`Provider ${providerId} not configured for user ${userId}`);
    }
    this.defaultProviders.set(userId, providerId);
  }

  /**
   * Get an initialized LLM provider for a user
   */
  async getLLMForUser(
    userId: string,
    providerId?: string
  ): Promise<LLMProvider> {
    const userProviders = this.userConfigs.get(userId);

    // Determine which provider to use
    let targetProviderId = providerId;
    if (!targetProviderId) {
      // Try user's default
      targetProviderId = this.defaultProviders.get(userId);

      // Fall back to first configured provider
      if (!targetProviderId && userProviders && userProviders.size > 0) {
        targetProviderId = Array.from(userProviders.keys())[0];
      }
    }

    if (!targetProviderId) {
      throw new Error('No LLM provider configured for user');
    }

    const provider = this.providers.get(targetProviderId);
    if (!provider) {
      throw new Error(`Provider ${targetProviderId} not found`);
    }

    const config = userProviders?.get(targetProviderId);
    if (config) {
      await provider.initialize(config);
    }

    return provider;
  }

  /**
   * Get configuration for a specific provider and user
   */
  getUserProviderConfig(userId: string, providerId: string): LLMConfig | undefined {
    return this.userConfigs.get(userId)?.get(providerId);
  }

  /**
   * Check if a user has any configured providers
   */
  hasConfiguredProviders(userId: string): boolean {
    const userConfigs = this.userConfigs.get(userId);
    return userConfigs !== undefined && userConfigs.size > 0;
  }
}
