import { Request, Response, Router, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Pool } from 'pg';
import { nanoid } from 'nanoid';

export interface AuthConfig {
  jwtPrivateKey: string;  // PEM EC private key — signs access tokens
  jwtPublicKey: string;   // PEM EC public key — verifies access tokens
  db: Pool;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    type?: string;
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken(): string {
  return randomBytes(48).toString('hex'); // 96 hex chars, 384 bits
}

function issueAccessToken(payload: object, privateKey: string): string {
  return jwt.sign(payload, privateKey, { algorithm: 'ES256', expiresIn: '1h' });
}

async function storeRefreshToken(
  db: Pool,
  userId: string,
  token: string,
): Promise<void> {
  const tokenHash = hashToken(token);
  const now = new Date();
  const idleExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);    // 30 days sliding
  const absoluteExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year absolute
  await db.query(
    `INSERT INTO refresh_tokens (token_hash, user_id, expires_at, idle_expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tokenHash, userId, absoluteExpiry, idleExpiry],
  );
}

/**
 * Authentication routes: register, login, refresh, logout, me
 */
export function createAuthRoutes(config: AuthConfig): Router {
  const router = Router();

  const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const decoded = jwt.verify(
        authHeader.slice(7),
        config.jwtPublicKey,
        { algorithms: ['ES256'] },
      ) as any;
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };

  // ---------------------------------------------------------------------------
  // POST /register — disabled, invite-only
  // ---------------------------------------------------------------------------
  router.post('/register', (_req: Request, res: Response) => {
    res.status(403).json({ error: 'Registration is invite-only. Contact an administrator.' });
  });

  // ---------------------------------------------------------------------------
  // POST /login
  // ---------------------------------------------------------------------------
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const result = await config.db.query(
        'SELECT id, email, password_hash, name, must_change_password, is_operator FROM users WHERE email = $1',
        [email],
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const accessToken = issueAccessToken(
        { id: user.id, email: user.email, type: 'user', isOperator: user.is_operator === true },
        config.jwtPrivateKey,
      );
      const refreshToken = generateRefreshToken();
      await storeRefreshToken(config.db, user.id, refreshToken);

      const orgResult = await config.db.query(
        `SELECT om.org_id AS id, o.name, om.role
         FROM org_members om JOIN organizations o ON o.id = om.org_id
         WHERE om.user_id = $1 ORDER BY o.created_at LIMIT 1`,
        [user.id],
      );

      res.json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name, isOperator: user.is_operator === true },
        token: accessToken,
        refreshToken,
        mustChangePassword: user.must_change_password === true,
        orgs: orgResult.rows,
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /refresh — rotate refresh token, issue new access token
  // ---------------------------------------------------------------------------
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ error: 'refreshToken required' });
      }

      const tokenHash = hashToken(refreshToken);
      const result = await config.db.query(
        `SELECT rt.user_id, rt.expires_at, rt.idle_expires_at, u.email, u.is_operator
         FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
         WHERE rt.token_hash = $1`,
        [tokenHash],
      );

      if (!result.rows[0]) {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
      }

      const row = result.rows[0];
      const now = new Date();

      if (new Date(row.expires_at) < now || new Date(row.idle_expires_at) < now) {
        await config.db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
        return res.status(401).json({ error: 'Refresh token expired, please log in again' });
      }

      // Rotate: delete old token, issue new one (sliding window resets)
      await config.db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
      const newRefreshToken = generateRefreshToken();
      const newHash = hashToken(newRefreshToken);
      const newIdle = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await config.db.query(
        `INSERT INTO refresh_tokens (token_hash, user_id, expires_at, idle_expires_at)
         VALUES ($1, $2, $3, $4)`,
        [newHash, row.user_id, row.expires_at, newIdle], // keep original absolute expiry
      );

      const accessToken = issueAccessToken(
        { id: row.user_id, email: row.email, type: 'user', isOperator: row.is_operator === true },
        config.jwtPrivateKey,
      );

      res.json({ token: accessToken, refreshToken: newRefreshToken });
    } catch (error: any) {
      console.error('Refresh error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /logout — revoke refresh token
  // ---------------------------------------------------------------------------
  router.post('/logout', async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await config.db.query(
          'DELETE FROM refresh_tokens WHERE token_hash = $1',
          [hashToken(refreshToken)],
        );
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /change-password — authenticated, change own password
  // ---------------------------------------------------------------------------
  router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword and newPassword are required' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
      }

      const result = await config.db.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId],
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });

      const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!isValid) return res.status(401).json({ error: 'Current password is incorrect' });

      const newHash = await bcrypt.hash(newPassword, 10);
      await config.db.query(
        'UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2',
        [newHash, userId],
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /me — return current user info
  // ---------------------------------------------------------------------------
  router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const result = await config.db.query(
        'SELECT id, email, name, is_operator, created_at FROM users WHERE id = $1',
        [userId],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

      const row = result.rows[0];
      res.json({ user: { ...row, isOperator: row.is_operator === true } });
    } catch (error: any) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
