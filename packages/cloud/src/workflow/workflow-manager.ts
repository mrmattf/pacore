import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import {
  WorkflowDAG,
  WorkflowExecution,
  WorkflowValidationResult,
} from '@pacore/core';

/**
 * Workflow Manager for CRUD operations
 * No scheduling for demo - just basic workflow and execution management
 */
export class WorkflowManager {
  constructor(private db: Pool) {}

  async initialize(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(255),
        nodes JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
      CREATE INDEX IF NOT EXISTS idx_workflows_category ON workflows(category);

      CREATE TABLE IF NOT EXISTS workflow_executions (
        id VARCHAR(255) PRIMARY KEY,
        workflow_id VARCHAR(255) NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        execution_log JSONB NOT NULL,
        result JSONB,
        error TEXT,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_user_id ON workflow_executions(user_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
    `);
  }

  /**
   * Create a new workflow
   */
  async createWorkflow(workflow: WorkflowDAG): Promise<WorkflowDAG> {
    const id = workflow.id || nanoid();
    const now = new Date();

    const validation = this.validateWorkflow(workflow);
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }

    const savedWorkflow: WorkflowDAG = {
      ...workflow,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.query(
      `INSERT INTO workflows (id, user_id, name, description, category, nodes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        savedWorkflow.id,
        savedWorkflow.userId,
        savedWorkflow.name,
        savedWorkflow.description,
        savedWorkflow.category,
        JSON.stringify(savedWorkflow.nodes),
        savedWorkflow.createdAt,
        savedWorkflow.updatedAt,
      ]
    );

    return savedWorkflow;
  }

  /**
   * Get a workflow by ID
   */
  async getWorkflow(workflowId: string): Promise<WorkflowDAG | null> {
    const result = await this.db.query(
      'SELECT * FROM workflows WHERE id = $1',
      [workflowId]
    );

    if (result.rows.length === 0) return null;

    return this.rowToWorkflow(result.rows[0]);
  }

  /**
   * List user's workflows
   */
  async listUserWorkflows(
    userId: string,
    category?: string
  ): Promise<WorkflowDAG[]> {
    let query = 'SELECT * FROM workflows WHERE user_id = $1';
    const params: any[] = [userId];

    if (category) {
      query += ' AND category = $2';
      params.push(category);
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.db.query(query, params);
    return result.rows.map(this.rowToWorkflow);
  }

  /**
   * Update a workflow
   */
  async updateWorkflow(
    workflowId: string,
    updates: Partial<WorkflowDAG>
  ): Promise<WorkflowDAG> {
    const existing = await this.getWorkflow(workflowId);
    if (!existing) {
      throw new Error('Workflow not found');
    }

    const updated: WorkflowDAG = {
      ...existing,
      ...updates,
      id: workflowId,
      updatedAt: new Date(),
    };

    const validation = this.validateWorkflow(updated);
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }

    await this.db.query(
      `UPDATE workflows
       SET name = $1, description = $2, category = $3, nodes = $4, updated_at = $5
       WHERE id = $6`,
      [
        updated.name,
        updated.description,
        updated.category,
        JSON.stringify(updated.nodes),
        updated.updatedAt,
        workflowId,
      ]
    );

    return updated;
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    await this.db.query('DELETE FROM workflows WHERE id = $1', [workflowId]);
  }

  /**
   * Save workflow execution
   */
  async saveExecution(execution: WorkflowExecution): Promise<void> {
    await this.db.query(
      `INSERT INTO workflow_executions (id, workflow_id, user_id, status, started_at, completed_at, execution_log, result, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         status = $4,
         completed_at = $6,
         execution_log = $7,
         result = $8,
         error = $9`,
      [
        execution.id,
        execution.workflowId,
        execution.userId,
        execution.status,
        execution.startedAt,
        execution.completedAt,
        JSON.stringify(execution.executionLog),
        JSON.stringify(execution.result),
        execution.error,
      ]
    );
  }

  /**
   * Get execution by ID
   */
  async getExecution(executionId: string): Promise<WorkflowExecution | null> {
    const result = await this.db.query(
      'SELECT * FROM workflow_executions WHERE id = $1',
      [executionId]
    );

    if (result.rows.length === 0) return null;

    return this.rowToExecution(result.rows[0]);
  }

  /**
   * List executions for a workflow
   */
  async listWorkflowExecutions(
    workflowId: string,
    limit = 20
  ): Promise<WorkflowExecution[]> {
    const result = await this.db.query(
      'SELECT * FROM workflow_executions WHERE workflow_id = $1 ORDER BY started_at DESC LIMIT $2',
      [workflowId, limit]
    );

    return result.rows.map(this.rowToExecution);
  }

  /**
   * List user's recent executions
   */
  async listUserExecutions(
    userId: string,
    limit = 20
  ): Promise<WorkflowExecution[]> {
    const result = await this.db.query(
      'SELECT * FROM workflow_executions WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2',
      [userId, limit]
    );

    return result.rows.map(this.rowToExecution);
  }

  /**
   * Validate workflow structure
   */
  validateWorkflow(workflow: WorkflowDAG): WorkflowValidationResult {
    const errors: string[] = [];

    if (!workflow.name) {
      errors.push('Workflow must have a name');
    }

    if (!workflow.userId) {
      errors.push('Workflow must have a userId');
    }

    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
    }

    if (workflow.nodes) {
      const nodeIds = new Set<string>();

      for (const node of workflow.nodes) {
        // Check for duplicate IDs
        if (nodeIds.has(node.id)) {
          errors.push(`Duplicate node ID: ${node.id}`);
        }
        nodeIds.add(node.id);

        // Validate node inputs reference existing nodes
        if (node.inputs) {
          for (const inputId of node.inputs) {
            if (!nodeIds.has(inputId)) {
              errors.push(`Node ${node.id} references non-existent input: ${inputId}`);
            }
          }
        }

        // Validate node config
        if (!node.config) {
          errors.push(`Node ${node.id} missing config`);
        }
      }

      // Check for cycles (basic check - executor does more thorough check)
      try {
        this.detectCycles(workflow.nodes);
      } catch (error: any) {
        errors.push(error.message);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Basic cycle detection
   */
  private detectCycles(nodes: any[]): void {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const node = nodes.find((n) => n.id === nodeId);
      if (node?.inputs) {
        for (const inputId of node.inputs) {
          if (!visited.has(inputId)) {
            if (dfs(inputId)) return true;
          } else if (recStack.has(inputId)) {
            return true;
          }
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) {
          throw new Error('Workflow contains a cycle');
        }
      }
    }
  }

  private rowToWorkflow(row: any): WorkflowDAG {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      category: row.category,
      nodes: row.nodes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToExecution(row: any): WorkflowExecution {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      userId: row.user_id,
      status: row.status,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      executionLog: row.execution_log,
      result: row.result,
      error: row.error,
    };
  }
}
