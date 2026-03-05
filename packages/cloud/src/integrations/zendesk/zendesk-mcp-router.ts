import { Router, Request, Response } from 'express';
import { CredentialManager } from '../../mcp/credential-manager';
import { AdapterRegistry } from '../adapter-registry';
import { ZENDESK_TOOLS } from './zendesk-tools';

/**
 * Express router for the internal Zendesk MCP endpoint.
 * Mounted at /internal/mcp/zendesk by the gateway.
 * Delegates all capability dispatch to AdapterRegistry — no tool-specific switch statement.
 */
export function createZendeskMcpRouter(
  credentialManager: CredentialManager,
  adapterRegistry: AdapterRegistry
): Router {
  const router = Router();

  router.post('/tools/list', (_req: Request, res: Response) => {
    res.json({ tools: ZENDESK_TOOLS });
  });

  router.post('/tools/call', async (req: Request, res: Response) => {
    const { name, arguments: args } = req.body as { name: string; arguments: Record<string, unknown> };
    const connectionId = req.headers['x-connection-id'] as string;
    const userId       = req.headers['x-user-id']       as string;

    if (!connectionId || !userId) {
      return res.status(400).json({ error: 'Missing X-Connection-Id or X-User-Id header' });
    }

    try {
      const creds = await credentialManager.getCredentials(
        { type: 'user', userId },
        connectionId
      );
      if (!creds) {
        return res.status(401).json({ error: 'No credentials found for connection' });
      }

      const capability = name.replace('zendesk__', '');
      const result = await adapterRegistry.invokeCapability(
        'zendesk',
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
