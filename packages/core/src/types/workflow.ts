/**
 * Workflow DAG Types
 * Basic types for demo - not production-ready
 */

export type WorkflowNodeType =
  | 'mcp_fetch'
  | 'transform'
  | 'filter'
  | 'merge'
  | 'action'
  | 'conditional';

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  config: Record<string, any>;
  inputs?: string[]; // IDs of nodes this depends on
  description?: string;
}

export interface WorkflowDAG {
  id?: string;
  userId?: string;
  name: string;
  description?: string;
  category?: string;
  nodes: WorkflowNode[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  userId: string;
  status: WorkflowStatus;
  startedAt: Date;
  completedAt?: Date;
  executionLog: WorkflowExecutionLog[];
  result?: any;
  error?: string;
}

export interface WorkflowExecutionLog {
  nodeId: string;
  status: WorkflowStatus;
  startedAt: Date;
  completedAt?: Date;
  output?: any;
  error?: string;
}

export interface WorkflowIntent {
  detected: boolean;
  confidence: number;
  description: string;
  suggestedNodes?: WorkflowNode[];
}

export interface WorkflowSuggestion {
  workflowId: string;
  workflowName: string;
  similarity: number;
  category?: string;
  description?: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
}

// Node-specific configs

export interface MCPFetchNodeConfig {
  serverId: string;
  serverName: string;
  toolName: string;
  parameters: Record<string, any>;
}

export interface TransformNodeConfig {
  type: 'llm' | 'code';
  prompt?: string; // For LLM transforms
  provider?: string; // LLM provider (anthropic, openai, ollama, etc.)
  model?: string; // Model name to use
  code?: string; // For code transforms (later)
}

export interface FilterNodeConfig {
  conditions: Array<{
    field: string;
    operator: 'equals' | 'contains' | 'gt' | 'lt';
    value: any;
  }>;
}

export interface MergeNodeConfig {
  strategy: 'concat' | 'deduplicate' | 'merge_objects';
  key?: string; // For deduplication
}

export interface ActionNodeConfig {
  action: 'send_email' | 'webhook' | 'save' | 'notify';
  config: Record<string, any>;
}

export interface ConditionalNodeConfig {
  condition: string;
  trueBranch: string; // Node ID
  falseBranch: string; // Node ID
}
