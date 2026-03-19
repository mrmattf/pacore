import { Router, Request, Response } from 'express';
import type { MemoryManager } from '../memory/memory-manager';

interface AuthenticatedRequest extends Request {
  user?: { id: string; [key: string]: any };
}

export function createConversationRoutes(memory: MemoryManager): Router {
  const router = Router();

  // Memory search
  router.post('/v1/memory/search', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { query, options } = req.body;
      const userId = req.user!.id;
      const results = await memory.searchContext(userId, query, options);
      res.json(results);
    } catch (error: any) {
      console.error('Memory search error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get conversation history
  router.get('/v1/conversations', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const conversations = await memory.getUserConversations(userId, limit, offset);
      res.json(conversations);
    } catch (error: any) {
      console.error('Get conversations error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete conversation
  router.delete('/v1/conversations/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await memory.deleteConversation(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete conversation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get conversation by ID
  router.get('/v1/conversations/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const conversation = await memory.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      res.json(conversation);
    } catch (error: any) {
      console.error('Get conversation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update conversation tags
  router.put('/v1/conversations/:id/tags', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { tags } = req.body;
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be an array' });
      }
      await memory.updateConversationTags(id, tags);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Update tags error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add tags to conversation
  router.post('/v1/conversations/:id/tags', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { tags } = req.body;
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be an array' });
      }
      await memory.addConversationTags(id, tags);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Add tags error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Remove tags from conversation
  router.delete('/v1/conversations/:id/tags', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { tags } = req.body;
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be an array' });
      }
      await memory.removeConversationTags(id, tags);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Remove tags error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get conversations by tag
  router.get('/v1/conversations/by-tag/:tag', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { tag } = req.params;
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const conversations = await memory.getConversationsByTag(userId, tag, limit, offset);
      res.json(conversations);
    } catch (error: any) {
      console.error('Get conversations by tag error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's tags with counts
  router.get('/v1/tags', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const tags = await memory.getUserTags(userId);
      res.json(tags);
    } catch (error: any) {
      console.error('Get user tags error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's categories
  router.get('/v1/categories', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const categories = await memory.getUserCategories(userId);
      res.json(categories);
    } catch (error: any) {
      console.error('Get categories error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add a new category
  router.post('/v1/categories', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { category, description } = req.body;
      if (!category || typeof category !== 'string') {
        return res.status(400).json({ error: 'Category name is required' });
      }
      await memory.addUserCategory(userId, category, description);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Add category error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a category
  router.delete('/v1/categories/:category', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { category } = req.params;
      await memory.removeUserCategory(userId, category);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete category error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Accept a category suggestion for a conversation
  router.post('/v1/conversations/:id/accept-category', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { category } = req.body;

      if (!category || typeof category !== 'string') {
        return res.status(400).json({ error: 'Category is required' });
      }

      await memory.addUserCategory(userId, category);

      const conversation = await memory.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const updatedMetadata = {
        ...conversation.metadata,
        category: category.toLowerCase(),
        suggestedCategory: undefined,
      };

      await memory.storeConversation(userId, {
        ...conversation,
        metadata: updatedMetadata,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Accept category error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
