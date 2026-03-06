import 'dotenv/config';
import { LLMProviderRegistry } from '@pacore/core';
import { AnthropicProvider, OpenAIProvider, OllamaProvider, CustomEndpointProvider } from '@pacore/adapters';
import { VectorMemoryStore, PgVectorStore, MemoryManager } from './memory';
import { Orchestrator, UserSettings } from './orchestration';
import { APIGateway } from './api';
import { Pool } from 'pg';
import { MCPRegistry, CredentialManager } from './mcp';
import { registerPlatformMCPServers } from './mcp/platform-servers';
import { WorkflowManager, WorkflowExecutor, WorkflowBuilder } from './workflow';
import { OrgManager } from './organizations/org-manager';
import { SkillRegistry } from './skills/skill-registry';
import { SkillDispatcher } from './skills/skill-dispatcher';
import { SkillTemplateRegistry } from './skills/skill-template-registry';
import { WebhookTriggerHandler } from './triggers/webhook-trigger';
import { BackorderDetectionSkill } from './skills/definitions/backorder-detection';
import { BillingManager } from './billing';
import { AdapterRegistry } from './integrations/adapter-registry';
import { ShopifyOrderAdapter } from './integrations/shopify/shopify-order-adapter';
import { GorgiasNotificationAdapter } from './integrations/gorgias/gorgias-notification-adapter';
import { ZendeskNotificationAdapter } from './integrations/zendesk/zendesk-notification-adapter';
import { ReamazeNotificationAdapter } from './integrations/reamaze/reamaze-notification-adapter';
import { SlackAlertAdapter } from './integrations/slack/slack-alert-adapter';
import { AfterShipTrackingAdapter } from './integrations/aftership/aftership-tracking-adapter';
import { createShopifyMcpRouter } from './integrations/shopify/shopify-mcp-router';
import { createGorgiasMcpRouter } from './integrations/gorgias/gorgias-mcp-router';
import { createZendeskMcpRouter } from './integrations/zendesk/zendesk-mcp-router';
import { createSkillsMcpRouter } from './mcp/skills-mcp-router';

/**
 * Main entry point for the cloud service
 */
async function main() {
  console.log('Starting PA Core Cloud Service...');

  // Initialize LLM Provider Registry
  const registry = new LLMProviderRegistry();

  // Register default providers
  registry.registerProvider(new AnthropicProvider());
  registry.registerProvider(new OpenAIProvider());
  registry.registerProvider(new OllamaProvider());
  registry.registerProvider(new CustomEndpointProvider());

  console.log('Registered LLM providers:', registry.getProviders().map(p => p.id));

  // Create shared database pool
  const dbPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/pacore',
  });

  // Determine which vector store to use
  const vectorStoreType = process.env.VECTOR_STORE || 'pgvector';
  let vectorStore: VectorMemoryStore | PgVectorStore;

  if (vectorStoreType === 'pinecone') {
    console.log('Using Pinecone for vector storage');
    vectorStore = new VectorMemoryStore({
      pineconeApiKey: process.env.PINECONE_API_KEY || '',
      pineconeIndexName: process.env.PINECONE_INDEX_NAME || 'pacore-conversations',
    });
  } else {
    console.log('Using pgvector for vector storage');
    vectorStore = new PgVectorStore({ pool: dbPool });
  }

  // Initialize Memory Manager
  const memoryManager = new MemoryManager({
    postgresUrl: process.env.DATABASE_URL || 'postgresql://localhost/pacore',
    vectorStore,
  });

  await memoryManager.initialize();
  console.log('Memory manager initialized');

  // Initialize MCP Registry
  const mcpRegistry = new MCPRegistry(dbPool);
  await mcpRegistry.initialize();
  await registerPlatformMCPServers(dbPool);
  console.log('MCP registry initialized');

  // Initialize Credential Manager (uses a separate encryption secret, not the JWT signing key)
  const encryptionSecret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  const credentialManager = new CredentialManager(dbPool, encryptionSecret);
  await credentialManager.initialize();
  console.log('Credential manager initialized');

  // Initialize Workflow Manager
  const workflowManager = new WorkflowManager(dbPool);
  await workflowManager.initialize();
  console.log('Workflow manager initialized');

  // Initialize Workflow Executor
  const workflowExecutor = new WorkflowExecutor(mcpRegistry, registry, credentialManager);
  console.log('Workflow executor initialized');

  // Initialize Workflow Builder
  const workflowBuilder = new WorkflowBuilder(registry, mcpRegistry, workflowManager);
  console.log('Workflow builder initialized');

  // User settings getter (simplified - would normally come from database)
  const getUserSettings = async (userId: string): Promise<UserSettings> => {
    // TODO: Load from database
    return {
      defaultProvider: 'anthropic',
      dataResidency: 'cloud',
    };
  };

  // Initialize Orchestrator with workflow integration
  const orchestrator = new Orchestrator(
    registry,
    memoryManager,
    getUserSettings,
    workflowBuilder,
    workflowManager,
    workflowExecutor,
  );

  // Initialize Org Manager
  const orgManager = new OrgManager(dbPool);
  await orgManager.initialize();
  console.log('Org manager initialized');

  // Initialize Billing Manager
  const billingManager = new BillingManager(dbPool);
  await billingManager.initialize();
  console.log('Billing manager initialized');

  // Initialize Skill Template Registry first (needed to register stubs in SkillRegistry)
  const skillTemplateRegistry = new SkillTemplateRegistry();
  console.log('Skill template registry initialized, skill types:', skillTemplateRegistry.getSkillTypes().map(t => t.id));

  // Initialize Skill Registry + register platform skills
  const skillRegistry = new SkillRegistry(dbPool, billingManager);
  skillRegistry.registerSkill(BackorderDetectionSkill);
  // Register a stub SkillDefinition for each template skill type so that:
  //   1. SkillRegistry.activateSkill() passes the catalog.has() check
  //   2. user_skills.skill_id FK constraint (→ skills.id) is satisfied
  for (const skillType of skillTemplateRegistry.getSkillTypes()) {
    skillRegistry.registerSkill({
      id: skillType.id,
      name: skillType.name,
      version: '1.0.0',
      description: skillType.description,
      triggerType: 'webhook',
      toolChain: skillType.id,
      requiredCapabilities: [],
      configSchema: {},
    });
  }
  await skillRegistry.initialize(); // syncs in-memory catalog to the skills DB table
  console.log('Skill registry initialized, registered skills:', skillRegistry.listSkills().map(s => s.id));

  // Initialize AdapterRegistry — central dispatch hub for all integrations
  const adapterRegistry = new AdapterRegistry();
  adapterRegistry.register(new ShopifyOrderAdapter());
  adapterRegistry.register(new GorgiasNotificationAdapter());
  adapterRegistry.register(new ZendeskNotificationAdapter());
  adapterRegistry.register(new ReamazeNotificationAdapter());
  adapterRegistry.register(new SlackAlertAdapter());
  adapterRegistry.register(new AfterShipTrackingAdapter());
  console.log('Adapter registry initialized, adapters:', adapterRegistry.getAllAdapters().map(a => a.integrationKey));

  // Initialize Skill Dispatcher
  const skillDispatcher = new SkillDispatcher(skillRegistry, mcpRegistry, credentialManager, skillTemplateRegistry, adapterRegistry);
  console.log('Skill dispatcher initialized');

  // Initialize Webhook Trigger Handler
  const webhookTriggerHandler = new WebhookTriggerHandler(skillRegistry, skillDispatcher, dbPool, billingManager);
  console.log('Webhook trigger handler initialized');

  // Build internal MCP sub-routers (mounted by APIGateway)
  const shopifyMcpRouter  = createShopifyMcpRouter(credentialManager, adapterRegistry);
  const gorgiasMcpRouter  = createGorgiasMcpRouter(credentialManager, adapterRegistry);
  const zendeskMcpRouter  = createZendeskMcpRouter(credentialManager, adapterRegistry);
  const skillsMcpRouter   = createSkillsMcpRouter(dbPool, credentialManager, adapterRegistry, skillRegistry, skillTemplateRegistry);

  // Load ES256 keypair (base64-encoded PEM in env vars)
  const jwtPrivateKey = process.env.JWT_PRIVATE_KEY_B64
    ? Buffer.from(process.env.JWT_PRIVATE_KEY_B64, 'base64').toString('utf8')
    : (process.env.JWT_PRIVATE_KEY ?? '');
  const jwtPublicKey = process.env.JWT_PUBLIC_KEY_B64
    ? Buffer.from(process.env.JWT_PUBLIC_KEY_B64, 'base64').toString('utf8')
    : (process.env.JWT_PUBLIC_KEY ?? '');

  if (!jwtPrivateKey || !jwtPublicKey) {
    console.error('JWT_PRIVATE_KEY_B64 and JWT_PUBLIC_KEY_B64 are required. Generate with: openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt');
    process.exit(1);
  }

  // Initialize API Gateway
  const gateway = new APIGateway(orchestrator, {
    port: parseInt(process.env.PORT || '3000'),
    jwtPrivateKey,
    jwtPublicKey,
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3001'],
    db: dbPool,
    mcpRegistry,
    credentialManager,
    workflowManager,
    workflowExecutor,
    workflowBuilder,
    orgManager,
    skillRegistry,
    skillDispatcher,
    skillTemplateRegistry,
    webhookTriggerHandler,
    billingManager,
    adapterRegistry,
    shopifyMcpRouter,
    gorgiasMcpRouter,
    zendeskMcpRouter,
    skillsMcpRouter,
  });

  await gateway.start();

  console.log('PA Core Cloud Service is running');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await gateway.stop();
    await memoryManager.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await gateway.stop();
    await memoryManager.close();
    process.exit(0);
  });
}

// Run the service
main().catch((error) => {
  console.error('Failed to start service:', error);
  process.exit(1);
});

export * from './memory';
export * from './orchestration';
export * from './api';
export * from './mcp';
export * from './workflow';
