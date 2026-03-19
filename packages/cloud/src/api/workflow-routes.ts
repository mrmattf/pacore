import { Router, Request, Response } from 'express';
import type { WorkflowManager } from '../workflow/workflow-manager';
import type { WorkflowExecutor } from '../workflow/workflow-executor';
import type { WorkflowBuilder } from '../workflow/workflow-builder';

interface AuthenticatedRequest extends Request {
  user?: { id: string; [key: string]: any };
}

export function createWorkflowRoutes(
  workflowManager: WorkflowManager,
  workflowExecutor: WorkflowExecutor,
  workflowBuilder: WorkflowBuilder,
): Router {
  const router = Router();

  // Create a new workflow
  router.post('/v1/workflows', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name, description, category, nodes } = req.body;
      if (!name || !nodes) {
        return res.status(400).json({ error: 'Missing required fields: name, nodes' });
      }
      const workflow = await workflowManager.createWorkflow({ userId, name, description, category, nodes });
      res.json(workflow);
    } catch (error: any) {
      console.error('Create workflow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // List user's workflows
  router.get('/v1/workflows', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const category = req.query.category as string | undefined;
      const workflows = await workflowManager.listUserWorkflows(userId, category);
      res.json(workflows);
    } catch (error: any) {
      console.error('List workflows error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Detect workflow intent — must be before /:id to avoid route conflict
  router.post('/v1/workflows/detect-intent', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { message, conversationHistory } = req.body;
      if (!message) return res.status(400).json({ error: 'message is required' });
      const intent = await workflowBuilder.detectIntent(userId, message, conversationHistory);
      res.json(intent);
    } catch (error: any) {
      console.error('Detect intent error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Suggest similar workflows
  router.post('/v1/workflows/suggest', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { message, category } = req.body;
      if (!message) return res.status(400).json({ error: 'message is required' });
      const suggestions = await workflowBuilder.suggestWorkflows(userId, message, category);
      res.json(suggestions);
    } catch (error: any) {
      console.error('Suggest workflows error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Build workflow from natural language
  router.post('/v1/workflows/build', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { message, category, execute } = req.body;
      if (!message) return res.status(400).json({ error: 'message is required' });

      const workflow = await workflowBuilder.buildWorkflow(userId, message, category);

      if (execute) {
        const execution = await workflowExecutor.execute(workflow, userId);
        await workflowManager.saveExecution(execution);
        res.json({ workflow, execution });
      } else {
        res.json({ workflow });
      }
    } catch (error: any) {
      console.error('Build workflow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Build, execute, and optionally save workflow
  router.post('/v1/workflows/generate', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { message, category, save } = req.body;
      if (!message) return res.status(400).json({ error: 'message is required' });

      const { workflow, shouldSave } = await workflowBuilder.generateAndExecute(userId, message, category);
      const execution = await workflowExecutor.execute(workflow, userId);
      await workflowManager.saveExecution(execution);

      let savedWorkflow;
      if (save || shouldSave) {
        savedWorkflow = await workflowManager.createWorkflow(workflow);
      }

      res.json({ workflow: savedWorkflow || workflow, execution, saved: !!savedWorkflow });
    } catch (error: any) {
      console.error('Generate workflow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get workflow by ID
  router.get('/v1/workflows/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const workflow = await workflowManager.getWorkflow(id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      if (workflow.userId !== req.user!.id) return res.status(403).json({ error: 'Access denied' });
      res.json(workflow);
    } catch (error: any) {
      console.error('Get workflow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update workflow
  router.put('/v1/workflows/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const workflow = await workflowManager.getWorkflow(id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      if (workflow.userId !== req.user!.id) return res.status(403).json({ error: 'Access denied' });
      const updated = await workflowManager.updateWorkflow(id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error('Update workflow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete workflow
  router.delete('/v1/workflows/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const workflow = await workflowManager.getWorkflow(id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      if (workflow.userId !== req.user!.id) return res.status(403).json({ error: 'Access denied' });
      await workflowManager.deleteWorkflow(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete workflow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Execute a workflow
  router.post('/v1/workflows/:id/execute', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const workflow = await workflowManager.getWorkflow(id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      if (workflow.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      const execution = await workflowExecutor.execute(workflow, userId);
      await workflowManager.saveExecution(execution);
      res.json(execution);
    } catch (error: any) {
      console.error('Execute workflow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Refine existing workflow based on feedback
  router.post('/v1/workflows/:id/refine', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const { feedback } = req.body;
      if (!feedback) return res.status(400).json({ error: 'feedback is required' });

      const refinedWorkflow = await workflowBuilder.refineWorkflow(id, feedback, userId);
      const updated = await workflowManager.updateWorkflow(id, refinedWorkflow);
      res.json(updated);
    } catch (error: any) {
      console.error('Refine workflow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // List workflow executions
  router.get('/v1/workflows/:id/executions', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const workflow = await workflowManager.getWorkflow(id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      if (workflow.userId !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

      const limit = parseInt(req.query.limit as string) || 20;
      const executions = await workflowManager.listWorkflowExecutions(id, limit);
      res.json(executions);
    } catch (error: any) {
      console.error('List workflow executions error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get workflow execution
  router.get('/v1/executions/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const execution = await workflowManager.getExecution(id);
      if (!execution) return res.status(404).json({ error: 'Execution not found' });
      if (execution.userId !== req.user!.id) return res.status(403).json({ error: 'Access denied' });
      res.json(execution);
    } catch (error: any) {
      console.error('Get execution error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // List user's executions
  router.get('/v1/executions', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 20;
      const executions = await workflowManager.listUserExecutions(userId, limit);
      res.json(executions);
    } catch (error: any) {
      console.error('List executions error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
