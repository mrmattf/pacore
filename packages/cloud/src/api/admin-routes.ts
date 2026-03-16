import { Request, Response, Router } from 'express';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Pool } from 'pg';
import { nanoid } from 'nanoid';

export function createAdminRoutes(db: Pool): Router {
  const router = Router();

  // Require X-Admin-Secret header matching ADMIN_SECRET env var
  router.use((req: Request, res: Response, next) => {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) {
      return res.status(503).json({ error: 'Admin API not configured (set ADMIN_SECRET)' });
    }
    if (req.headers['x-admin-secret'] !== adminSecret) {
      return res.status(401).json({ error: 'Invalid admin secret' });
    }
    next();
  });

  // ---------------------------------------------------------------------------
  // POST /v1/admin/invite — create a user with a temporary password
  // Body: { email, name? }
  // Returns: { email, tempPassword } — shown once, user must change on first login
  // ---------------------------------------------------------------------------
  router.post('/invite', async (req: Request, res: Response) => {
    try {
      const { email, name } = req.body;
      if (!email) return res.status(400).json({ error: 'email is required' });

      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      const tempPassword = randomBytes(12).toString('base64url').slice(0, 16);
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      if (existing.rows.length > 0) {
        const { force } = req.body;
        if (!force) {
          return res.status(409).json({ error: 'User already exists. Pass "force": true to reset their temp password.' });
        }
        // Reset password and force change on next login
        await db.query(
          'UPDATE users SET password_hash = $1, must_change_password = true, updated_at = NOW() WHERE email = $2',
          [passwordHash, email],
        );
        return res.json({
          success: true,
          email,
          tempPassword,
          message: 'Password reset. Share tempPassword securely — they must change it on next login.',
        });
      }

      const userId = nanoid();
      await db.query(
        `INSERT INTO users (id, email, password_hash, name, must_change_password, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
        [userId, email, passwordHash, name || null],
      );

      res.status(201).json({
        success: true,
        email,
        tempPassword,
        message: 'User created. Share tempPassword securely — they must change it on first login.',
      });
    } catch (error: any) {
      console.error('Invite error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /v1/admin/invite-operator — create a user with is_operator = true
  // Body: { email, name? }
  // Returns: { email, tempPassword } — shown once, operator must change on first login
  // ---------------------------------------------------------------------------
  router.post('/invite-operator', async (req: Request, res: Response) => {
    try {
      const { email, name } = req.body;
      if (!email) return res.status(400).json({ error: 'email is required' });

      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      const tempPassword = randomBytes(12).toString('base64url').slice(0, 16);
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      if (existing.rows.length > 0) {
        const { force } = req.body;
        if (!force) {
          return res.status(409).json({ error: 'User already exists. Pass "force": true to grant operator access.' });
        }
        await db.query(
          'UPDATE users SET is_operator = true, updated_at = NOW() WHERE email = $1',
          [email],
        );
        return res.json({
          success: true,
          email,
          message: 'Operator access granted to existing user. No password change required.',
        });
      }

      const userId = nanoid();
      await db.query(
        `INSERT INTO users (id, email, password_hash, name, is_operator, must_change_password, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, true, NOW(), NOW())`,
        [userId, email, passwordHash, name || null],
      );

      res.status(201).json({
        success: true,
        email,
        tempPassword,
        message: 'Operator created. Share tempPassword securely — they must change it on first login.',
      });
    } catch (error: any) {
      console.error('Invite operator error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /v1/admin/users — list all users
  // ---------------------------------------------------------------------------
  router.get('/users', async (_req: Request, res: Response) => {
    try {
      const result = await db.query(
        'SELECT id, email, name, is_admin, must_change_password, created_at FROM users ORDER BY created_at DESC',
      );
      res.json({ users: result.rows });
    } catch (error: any) {
      console.error('List users error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /v1/admin/users/:id — remove a user
  // ---------------------------------------------------------------------------
  router.delete('/users/:id', async (req: Request, res: Response) => {
    try {
      await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
