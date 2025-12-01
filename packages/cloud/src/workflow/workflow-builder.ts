import {
  WorkflowDAG,
  WorkflowNode,
  WorkflowIntent,
  WorkflowSuggestion,
  MCPServer,
} from '@pacore/core';
import { LLMProviderRegistry } from '@pacore/core';
import { MCPRegistry } from '../mcp';
import { WorkflowManager } from './workflow-manager';
import { nanoid } from 'nanoid';

/**
 * AI-Driven Workflow Builder
 * Analyzes user intent and generates workflows automatically
 */
export class WorkflowBuilder {
  constructor(
    private llmRegistry: LLMProviderRegistry,
    private mcpRegistry: MCPRegistry,
    private workflowManager: WorkflowManager,
  ) {}

  /**
   * Detect if user message contains workflow intent
   */
  async detectIntent(
    userId: string,
    userMessage: string,
    conversationHistory?: string,
  ): Promise<WorkflowIntent> {
    const provider = this.llmRegistry.getProvider('anthropic');
    if (!provider) {
      return {
        detected: false,
        confidence: 0,
        description: 'AI provider not configured',
      };
    }

    const prompt = `Analyze if the user wants to create an automated workflow or task.

Workflow indicators:
- Requests to automate repetitive tasks
- Multi-step processes involving data from different sources
- Scheduled or recurring tasks
- Tasks involving fetching, transforming, filtering, or combining data
- Requests like "get data from X and Y, then do Z"

User message: "${userMessage}"

${conversationHistory ? `Recent conversation context:\n${conversationHistory}` : ''}

Respond with JSON:
{
  "detected": true/false,
  "confidence": 0.0-1.0,
  "description": "brief description of the intended workflow",
  "workflowName": "suggested workflow name",
  "category": "suggested category (work/family/hobby/etc)"
}`;

    try {
      const response = await provider.complete(
        [
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          model: 'claude-3-5-sonnet-20241022',
          maxTokens: 1024,
        }
      );

      const result = JSON.parse(response.content);
      return {
        detected: result.detected || false,
        confidence: result.confidence || 0,
        description: result.description || '',
        suggestedNodes: undefined,
      };
    } catch (error: any) {
      console.error('Intent detection error:', error);

      // Provide helpful error for provider initialization issues
      if (error.message && error.message.includes('Provider not initialized')) {
        return {
          detected: false,
          confidence: 0,
          description: 'AI provider not configured - please add API key',
        };
      }

      return {
        detected: false,
        confidence: 0,
        description: 'Error detecting intent',
      };
    }
  }

  /**
   * Suggest existing workflows similar to user's request
   */
  async suggestWorkflows(
    userId: string,
    userMessage: string,
    category?: string,
  ): Promise<WorkflowSuggestion[]> {
    // Get user's workflows
    const workflows = await this.workflowManager.listUserWorkflows(
      userId,
      category
    );

    if (workflows.length === 0) {
      return [];
    }

    const provider = this.llmRegistry.getProvider('anthropic');
    if (!provider) {
      return [];
    }

    const workflowsList = workflows
      .map((w) => `- ${w.name}: ${w.description || 'No description'}`)
      .join('\n');

    const prompt = `Given this user request: "${userMessage}"

Available workflows:
${workflowsList}

Which workflows are most similar? Return top 3 matches as JSON array:
[
  {
    "workflowId": "id",
    "workflowName": "name",
    "similarity": 0.0-1.0,
    "reason": "why it matches"
  }
]

If no good matches, return empty array.`;

    try {
      const response = await provider.complete(
        [
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          model: 'claude-3-5-sonnet-20241022',
          maxTokens: 1024,
        }
      );

      const suggestions = JSON.parse(response.content);
      return suggestions.map((s: any) => ({
        workflowId: s.workflowId,
        workflowName: s.workflowName,
        similarity: s.similarity,
        category,
      }));
    } catch (error) {
      console.error('Workflow suggestion error:', error);
      return [];
    }
  }

  /**
   * Build a workflow from user's natural language request
   */
  async buildWorkflow(
    userId: string,
    userMessage: string,
    category?: string,
  ): Promise<WorkflowDAG> {
    // Get user's MCP servers
    const mcpServers = await this.mcpRegistry.listUserServers(userId, category);

    if (mcpServers.length === 0) {
      throw new Error(
        'No MCP servers available. Please register MCP servers first.'
      );
    }

    // Build tool catalog from MCP servers
    const toolCatalog = await this.buildToolCatalog(mcpServers);

    const provider = this.llmRegistry.getProvider('anthropic');
    if (!provider) {
      throw new Error('No LLM provider available');
    }

    const prompt = `You are a workflow builder AI. Create a workflow DAG from the user's request.

User request: "${userMessage}"

Available MCP Tools:
${toolCatalog}

Create a workflow with these node types:
- mcp_fetch: Fetch data from MCP server tool
- transform: Transform data using LLM or code
- filter: Filter array data based on conditions
- merge: Combine multiple data sources
- action: Perform action (save, notify, webhook, email)
- conditional: Branch based on condition

Each node must have:
- id: unique identifier (use descriptive names like "fetch_legal_cases", "filter_recent")
- type: node type from above
- description: what this node does
- config: node-specific configuration
- inputs: array of node IDs this depends on (empty for first nodes)

Return ONLY valid JSON workflow structure:
{
  "name": "descriptive workflow name",
  "description": "what this workflow does",
  "category": "${category || 'general'}",
  "nodes": [
    {
      "id": "node_1",
      "type": "mcp_fetch",
      "description": "Fetch data from source",
      "config": {
        "serverId": "server_id_from_catalog",
        "serverName": "server name",
        "toolName": "tool_name",
        "parameters": {}
      },
      "inputs": []
    }
  ]
}

Design principles:
1. Start with mcp_fetch nodes to get data
2. Use transform nodes to process/analyze data
3. Use filter nodes to narrow results
4. Use merge nodes to combine data from multiple sources
5. End with action nodes to deliver results
6. Keep it simple - 3-7 nodes is ideal
7. Ensure all node IDs in "inputs" reference existing nodes
8. Use descriptive node IDs that explain what they do`;

    try {
      const response = await provider.complete(
        [
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          model: 'claude-3-5-sonnet-20241022',
          maxTokens: 4096,
        }
      );

      // Parse and validate workflow
      const workflowData = JSON.parse(response.content);

      const workflow: WorkflowDAG = {
        userId,
        name: workflowData.name,
        description: workflowData.description,
        category: workflowData.category || category,
        nodes: workflowData.nodes,
      };

      // Validate workflow structure
      const validation = this.workflowManager.validateWorkflow(workflow);
      if (!validation.valid) {
        throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
      }

      return workflow;
    } catch (error: any) {
      console.error('Workflow build error:', error);
      throw new Error(`Failed to build workflow: ${error.message}`);
    }
  }

  /**
   * Build a catalog of available tools from MCP servers
   */
  private async buildToolCatalog(servers: MCPServer[]): Promise<string> {
    const catalogParts: string[] = [];

    for (const server of servers) {
      if (!server.capabilities?.tools) {
        continue;
      }

      catalogParts.push(`\n${server.name} (ID: ${server.id}):`);

      for (const tool of server.capabilities.tools) {
        const params = tool.inputSchema
          ? JSON.stringify(tool.inputSchema, null, 2)
          : 'No parameters';

        catalogParts.push(
          `  - ${tool.name}: ${tool.description}\n    Parameters: ${params}`
        );
      }
    }

    if (catalogParts.length === 0) {
      return 'No tools available';
    }

    return catalogParts.join('\n');
  }

  /**
   * Refine an existing workflow based on user feedback
   */
  async refineWorkflow(
    workflowId: string,
    userFeedback: string,
    userId: string,
  ): Promise<WorkflowDAG> {
    const existingWorkflow = await this.workflowManager.getWorkflow(workflowId);
    if (!existingWorkflow) {
      throw new Error('Workflow not found');
    }

    if (existingWorkflow.userId !== userId) {
      throw new Error('Access denied');
    }

    const provider = this.llmRegistry.getProvider('anthropic');
    if (!provider) {
      throw new Error('No LLM provider available. Please configure an API key for Anthropic or OpenAI.');
    }

    const prompt = `Refine this workflow based on user feedback.

Current workflow:
${JSON.stringify(existingWorkflow, null, 2)}

User feedback: "${userFeedback}"

Return the refined workflow as valid JSON with the same structure.
Keep the workflow ID and userId unchanged.
Only modify what the user requested.`;

    try {
      const response = await provider.complete(
        [
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          model: 'claude-3-5-sonnet-20241022',
          maxTokens: 4096,
        }
      );

      const refinedData = JSON.parse(response.content);

      const refinedWorkflow: WorkflowDAG = {
        ...existingWorkflow,
        name: refinedData.name,
        description: refinedData.description,
        category: refinedData.category,
        nodes: refinedData.nodes,
      };

      // Validate refined workflow
      const validation = this.workflowManager.validateWorkflow(refinedWorkflow);
      if (!validation.valid) {
        throw new Error(`Invalid refined workflow: ${validation.errors.join(', ')}`);
      }

      return refinedWorkflow;
    } catch (error: any) {
      console.error('Workflow refinement error:', error);

      // Provide helpful error message for provider initialization issues
      if (error.message.includes('Provider not initialized')) {
        throw new Error('AI provider not configured. Please configure an API key for Anthropic or OpenAI to use workflow refinement.');
      }

      throw new Error(`Failed to refine workflow: ${error.message}`);
    }
  }

  /**
   * Generate a workflow and execute it immediately
   */
  async generateAndExecute(
    userId: string,
    userMessage: string,
    category?: string,
  ): Promise<{
    workflow: WorkflowDAG;
    shouldSave: boolean;
    executionId?: string;
  }> {
    // Check for similar existing workflows
    const suggestions = await this.suggestWorkflows(userId, userMessage, category);

    if (suggestions.length > 0 && suggestions[0].similarity > 0.8) {
      // High similarity - suggest using existing workflow
      return {
        workflow: (await this.workflowManager.getWorkflow(suggestions[0].workflowId))!,
        shouldSave: false,
      };
    }

    // Build new workflow
    const workflow = await this.buildWorkflow(userId, userMessage, category);

    return {
      workflow,
      shouldSave: true,
    };
  }
}
