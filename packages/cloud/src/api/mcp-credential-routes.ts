import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { Pool } from 'pg';

interface AuthenticatedRequest extends Request {
  user?: { id: string; [key: string]: any };
}

/**
 * Per-user MCP client credential management.
 * Users generate client_id + client_secret pairs for external clients (Claude Desktop, etc.).
 * The secret is shown ONCE on creation and stored as a SHA-256 hash.
 *
 * Mount AFTER authenticateRequest middleware — all routes require a logged-in user.
 */
export function createMcpCredentialRoutes(db: Pool): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // GET /v1/me/mcp-clients — list credentials (no secrets returned)
  // ---------------------------------------------------------------------------
  router.get('/v1/me/mcp-clients', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const result = await db.query(
        `SELECT id, client_id, name, last_used_at, created_at
         FROM mcp_clients WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /v1/me/mcp-clients — generate new client_id + client_secret (returned once)
  // ---------------------------------------------------------------------------
  router.post('/v1/me/mcp-clients', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name = 'Claude Desktop' } = req.body;

      const clientId = 'mcp_' + randomBytes(8).toString('hex');
      const clientSecret = 'mcp_secret_' + randomBytes(24).toString('hex');
      const secretHash = createHash('sha256').update(clientSecret).digest('hex');

      const result = await db.query(
        `INSERT INTO mcp_clients (user_id, name, client_id, secret_hash)
         VALUES ($1, $2, $3, $4) RETURNING id, client_id, name, created_at`,
        [userId, name, clientId, secretHash],
      );

      // clientSecret returned ONCE — never stored in plaintext
      res.status(201).json({
        ...result.rows[0],
        clientId,
        clientSecret,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /v1/me/mcp-clients/:id/rotate — generate new secret, revoke old tokens
  // ---------------------------------------------------------------------------
  router.post('/v1/me/mcp-clients/:id/rotate', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const check = await db.query(
        'SELECT client_id FROM mcp_clients WHERE id = $1 AND user_id = $2',
        [id, userId],
      );
      if (!check.rows[0]) return res.status(404).json({ error: 'Client not found' });

      const clientSecret = 'mcp_secret_' + randomBytes(24).toString('hex');
      const secretHash = createHash('sha256').update(clientSecret).digest('hex');

      await db.query(
        'UPDATE mcp_clients SET secret_hash = $1, last_used_at = NULL WHERE id = $2',
        [secretHash, id],
      );

      // Revoke all existing access tokens — old client secret is now invalid
      await db.query(
        'DELETE FROM oauth_access_tokens WHERE client_id = $1',
        [check.rows[0].client_id],
      );

      res.json({ clientId: check.rows[0].client_id, clientSecret });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /v1/me/mcp-clients/:id — revoke and delete a client
  // ---------------------------------------------------------------------------
  router.delete('/v1/me/mcp-clients/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      await db.query(
        'DELETE FROM mcp_clients WHERE id = $1 AND user_id = $2',
        [req.params.id, userId],
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
