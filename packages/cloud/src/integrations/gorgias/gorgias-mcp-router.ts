import { Router, Request, Response } from 'express';
import { CredentialManager } from '../../mcp/credential-manager';
import { AdapterRegistry } from '../adapter-registry';
import { GORGIAS_TOOLS } from './gorgias-tools';

/**
 * Express router for the internal Gorgias MCP endpoint.
 * Mounted at /internal/mcp/gorgias by the gateway.
 * Delegates all capability dispatch to AdapterRegistry — no tool-specific switch statement.
 */
export function createGorgiasMcpRouter(
  credentialManager: CredentialManager,
  adapterRegistry: AdapterRegistry
): Router {
  const router = Router();

  router.post('/tools/list', (_req: Request, res: Response) => {
    res.json({ tools: GORGIAS_TOOLS });
  });

  router.post('/tools/call', async (req: Request, res: Response) => {
    const { name, arguments: args } = req.body as { name: string; arguments: Record<string, unknown> };
    const connectionId = req.headers['x-connection-id'] as string;
    const orgId        = req.headers['x-org-id']        as string;

    if (!connectionId || !orgId) {
      return res.status(400).json({ error: 'Missing X-Connection-Id or X-Org-Id header' });
    }

    try {
      const creds = await credentialManager.getCredentials(
        { type: 'org', orgId },
        connectionId
      );
      if (!creds) {
        return res.status(401).json({ error: 'No credentials found for connection' });
      }

      const capability = name.replace('gorgias__', '');
      const result = await adapterRegistry.invokeCapability(
        'gorgias',
        capability,
        args,
        creds as Record<string, unknown>
      );

      res.json({ content: [{ type: 'text', text: JSON.stringify(result) }] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes('does not support capability') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });

  return router;
}
