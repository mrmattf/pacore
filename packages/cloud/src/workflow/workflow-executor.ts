import {
  WorkflowDAG,
  WorkflowNode,
  WorkflowExecution,
  WorkflowExecutionLog,
  WorkflowStatus,
  MCPFetchNodeConfig,
  TransformNodeConfig,
  FilterNodeConfig,
  MergeNodeConfig,
  ActionNodeConfig,
  ConditionalNodeConfig,
} from '@pacore/core';
import { MCPRegistry, MCPClient } from '../mcp';
import { LLMProviderRegistry } from '@pacore/core';

/**
 * Basic Workflow Executor for demo
 * Executes DAG nodes in topological order - no scheduling, no parallel execution
 */
export class WorkflowExecutor {
  constructor(
    private mcpRegistry: MCPRegistry,
    private llmRegistry: LLMProviderRegistry,
  ) {}

  /**
   * Execute a workflow DAG
   */
  async execute(
    workflow: WorkflowDAG,
    userId: string,
  ): Promise<WorkflowExecution> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const executionLog: WorkflowExecutionLog[] = [];
    const nodeOutputs = new Map<string, any>();

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflow.id || '',
      userId,
      status: 'running',
      startedAt: new Date(),
      executionLog,
    };

    try {
      // Topological sort to determine execution order
      const executionOrder = this.topologicalSort(workflow.nodes);

      // Execute nodes in order
      for (const nodeId of executionOrder) {
        const node = workflow.nodes.find((n) => n.id === nodeId);
        if (!node) {
          throw new Error(`Node ${nodeId} not found in workflow`);
        }

        const nodeLog: WorkflowExecutionLog = {
          nodeId: node.id,
          status: 'running',
          startedAt: new Date(),
        };

        try {
          // Gather inputs from dependent nodes
          const inputs = this.gatherInputs(node, nodeOutputs);

          // Execute node based on type
          const output = await this.executeNode(node, inputs, userId);

          // Store output
          nodeOutputs.set(node.id, output);

          nodeLog.status = 'completed';
          nodeLog.completedAt = new Date();
          nodeLog.output = output;
        } catch (error: any) {
          nodeLog.status = 'failed';
          nodeLog.completedAt = new Date();
          nodeLog.error = error.message;

          // Stop execution on node failure
          execution.status = 'failed';
          execution.error = `Node ${node.id} failed: ${error.message}`;
          execution.completedAt = new Date();
          executionLog.push(nodeLog);
          return execution;
        }

        executionLog.push(nodeLog);
      }

      // Success - store final result
      execution.status = 'completed';
      execution.completedAt = new Date();
      execution.result = nodeOutputs.get(executionOrder[executionOrder.length - 1]);
    } catch (error: any) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.completedAt = new Date();
    }

    return execution;
  }

  /**
   * Topological sort using Kahn's algorithm
   */
  private topologicalSort(nodes: WorkflowNode[]): string[] {
    const nodeMap = new Map<string, WorkflowNode>();
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Initialize
    for (const node of nodes) {
      nodeMap.set(node.id, node);
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    }

    // Build adjacency list and calculate in-degrees
    for (const node of nodes) {
      const inputs = node.inputs || [];
      inDegree.set(node.id, inputs.length);

      for (const inputId of inputs) {
        const neighbors = adjList.get(inputId) || [];
        neighbors.push(node.id);
        adjList.set(inputId, neighbors);
      }
    }

    // Find nodes with no dependencies
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      sorted.push(nodeId);

      const neighbors = adjList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        const degree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, degree);

        if (degree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (sorted.length !== nodes.length) {
      throw new Error('Workflow contains a cycle');
    }

    return sorted;
  }

  /**
   * Gather inputs from dependent nodes
   */
  private gatherInputs(
    node: WorkflowNode,
    nodeOutputs: Map<string, any>,
  ): any[] {
    const inputs = node.inputs || [];
    return inputs.map((inputId) => {
      const output = nodeOutputs.get(inputId);
      if (output === undefined) {
        throw new Error(`Missing output from node ${inputId}`);
      }
      return output;
    });
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: WorkflowNode,
    inputs: any[],
    userId: string,
  ): Promise<any> {
    switch (node.type) {
      case 'mcp_fetch':
        return this.executeMCPFetch(node, userId);

      case 'transform':
        return this.executeTransform(node, inputs, userId);

      case 'filter':
        return this.executeFilter(node, inputs);

      case 'merge':
        return this.executeMerge(node, inputs);

      case 'action':
        return this.executeAction(node, inputs);

      case 'conditional':
        return this.executeConditional(node, inputs);

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  /**
   * Execute MCP fetch node
   */
  private async executeMCPFetch(
    node: WorkflowNode,
    userId: string,
  ): Promise<any> {
    const config = node.config as MCPFetchNodeConfig;

    const server = await this.mcpRegistry.getServer(config.serverId);
    if (!server) {
      throw new Error(`MCP server ${config.serverId} not found`);
    }

    if (server.userId !== userId) {
      throw new Error('Access denied to MCP server');
    }

    const client = new MCPClient(server);
    const result = await client.callTool({
      serverId: config.serverId,
      toolName: config.toolName,
      parameters: config.parameters,
    });

    if (!result.success) {
      throw new Error(result.error || 'MCP tool call failed');
    }

    return result.data;
  }

  /**
   * Execute transform node (LLM-based transformation)
   */
  private async executeTransform(
    node: WorkflowNode,
    inputs: any[],
    userId: string,
  ): Promise<any> {
    const config = node.config as TransformNodeConfig;

    if (config.type === 'llm') {
      // Use LLM to transform data
      const provider = this.llmRegistry.getProvider('anthropic');
      if (!provider) {
        throw new Error('No LLM provider available for transformation');
      }

      const inputData = JSON.stringify(inputs, null, 2);
      const prompt = config.prompt || 'Transform this data';

      const response = await provider.complete(
        [
          {
            role: 'user',
            content: `${prompt}\n\nInput data:\n${inputData}`,
          },
        ],
        {
          model: 'claude-3-5-sonnet-20241022',
          maxTokens: 4096,
        }
      );

      // Try to parse JSON response
      try {
        return JSON.parse(response.content);
      } catch {
        return response.content;
      }
    } else if (config.type === 'code') {
      // Code transforms not implemented yet
      throw new Error('Code transforms not yet supported');
    }

    throw new Error(`Unknown transform type: ${config.type}`);
  }

  /**
   * Execute filter node
   */
  private executeFilter(node: WorkflowNode, inputs: any[]): any {
    const config = node.config as FilterNodeConfig;
    const data = inputs[0];

    if (!Array.isArray(data)) {
      throw new Error('Filter node requires array input');
    }

    return data.filter((item) => {
      return config.conditions.every((condition) => {
        const value = item[condition.field];

        switch (condition.operator) {
          case 'equals':
            return value === condition.value;
          case 'contains':
            return String(value).includes(String(condition.value));
          case 'gt':
            return value > condition.value;
          case 'lt':
            return value < condition.value;
          default:
            return false;
        }
      });
    });
  }

  /**
   * Execute merge node
   */
  private executeMerge(node: WorkflowNode, inputs: any[]): any {
    const config = node.config as MergeNodeConfig;

    switch (config.strategy) {
      case 'concat':
        // Concatenate arrays
        return inputs.flat();

      case 'deduplicate':
        // Deduplicate by key
        if (!config.key) {
          throw new Error('Deduplicate strategy requires a key');
        }

        const seen = new Set();
        const result: any[] = [];

        for (const item of inputs.flat()) {
          const keyValue = item[config.key];
          if (!seen.has(keyValue)) {
            seen.add(keyValue);
            result.push(item);
          }
        }

        return result;

      case 'merge_objects':
        // Merge objects
        return Object.assign({}, ...inputs);

      default:
        throw new Error(`Unknown merge strategy: ${config.strategy}`);
    }
  }

  /**
   * Execute action node
   */
  private async executeAction(node: WorkflowNode, inputs: any[]): Promise<any> {
    const config = node.config as ActionNodeConfig;

    switch (config.action) {
      case 'save':
        // Just return the data for now (would save to DB in production)
        return inputs[0];

      case 'notify':
        // Log notification (would send real notification in production)
        console.log('Workflow notification:', inputs[0]);
        return { notified: true };

      case 'send_email':
      case 'webhook':
        // Not implemented for demo
        throw new Error(`Action ${config.action} not yet supported`);

      default:
        throw new Error(`Unknown action: ${config.action}`);
    }
  }

  /**
   * Execute conditional node
   */
  private executeConditional(node: WorkflowNode, inputs: any[]): any {
    const config = node.config as ConditionalNodeConfig;

    // Simple condition evaluation (would use more robust evaluation in production)
    const conditionResult = this.evaluateCondition(config.condition, inputs[0]);

    return {
      conditionMet: conditionResult,
      nextNode: conditionResult ? config.trueBranch : config.falseBranch,
      data: inputs[0],
    };
  }

  /**
   * Simple condition evaluator
   */
  private evaluateCondition(condition: string, data: any): boolean {
    // Very basic evaluation - just check truthiness for demo
    // In production, would use a proper expression evaluator
    try {
      // eslint-disable-next-line no-new-func
      const func = new Function('data', `return ${condition}`);
      return func(data);
    } catch {
      return false;
    }
  }
}
