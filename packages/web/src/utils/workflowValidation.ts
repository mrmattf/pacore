import { WorkflowDAG, WorkflowNode } from '@pacore/core';

export interface ValidationError {
  type: 'cycle' | 'missing_input' | 'orphan' | 'config';
  nodeId?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validates a workflow DAG for structural issues
 */
export function validateWorkflow(workflow: WorkflowDAG): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check for cycles using DFS
  const hasCycle = detectCycle(workflow.nodes);
  if (hasCycle) {
    errors.push({
      type: 'cycle',
      message: 'Workflow contains a cycle. Nodes cannot depend on themselves (directly or indirectly).',
    });
  }

  // Check for missing input references
  workflow.nodes.forEach((node) => {
    if (node.inputs) {
      node.inputs.forEach((inputId) => {
        const inputExists = workflow.nodes.some((n) => n.id === inputId);
        if (!inputExists) {
          errors.push({
            type: 'missing_input',
            nodeId: node.id,
            message: `Node "${node.description || node.id}" references non-existent input node "${inputId}".`,
          });
        }
      });
    }
  });

  // Check for orphaned nodes (no inputs and no dependents) - only warning
  workflow.nodes.forEach((node) => {
    const hasInputs = node.inputs && node.inputs.length > 0;
    const hasDependents = workflow.nodes.some(
      (n) => n.inputs && n.inputs.includes(node.id)
    );

    if (!hasInputs && !hasDependents && workflow.nodes.length > 1) {
      warnings.push({
        type: 'orphan',
        nodeId: node.id,
        message: `Node "${node.description || node.id}" has no connections. It won't affect the workflow result.`,
      });
    }
  });

  // Check for basic configuration issues
  workflow.nodes.forEach((node) => {
    if (node.type === 'mcp_fetch') {
      const config = node.config as any;
      if (!config.serverId || !config.toolName) {
        errors.push({
          type: 'config',
          nodeId: node.id,
          message: `MCP Fetch node "${node.description || node.id}" is missing server or tool configuration.`,
        });
      }
    } else if (node.type === 'transform') {
      const config = node.config as any;
      if (config.type === 'llm' && !config.prompt) {
        warnings.push({
          type: 'config',
          nodeId: node.id,
          message: `Transform node "${node.description || node.id}" has an empty prompt.`,
        });
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detects if there's a cycle in the workflow DAG using DFS
 */
function detectCycle(nodes: WorkflowNode[]): boolean {
  const nodeMap = new Map<string, WorkflowNode>();
  nodes.forEach((node) => nodeMap.set(node.id, node));

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (node && node.inputs) {
      for (const inputId of node.inputs) {
        if (!visited.has(inputId)) {
          if (dfs(inputId)) {
            return true; // Cycle detected
          }
        } else if (recursionStack.has(inputId)) {
          return true; // Cycle detected
        }
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  // Check all nodes as there might be disconnected components
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if adding a new connection would create a cycle
 */
export function wouldCreateCycle(
  nodes: WorkflowNode[],
  targetNodeId: string,
  newInputId: string
): boolean {
  // Create a temporary node with the new connection
  const tempNodes = nodes.map((node) => {
    if (node.id === targetNodeId) {
      return {
        ...node,
        inputs: [...(node.inputs || []), newInputId],
      };
    }
    return node;
  });

  return detectCycle(tempNodes);
}
