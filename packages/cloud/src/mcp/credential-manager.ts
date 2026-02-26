import { Pool } from 'pg';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export interface MCPCredentials {
  apiKey?: string;
  username?: string;
  password?: string;
  customHeaders?: Record<string, string>;
  // OAuth token fields (used by platform integrations like Shopify)
  accessToken?: string;
  tokenExpiresAt?: number;  // unix ms timestamp
  clientId?: string;
  clientSecret?: string;
  storeDomain?: string;
}

export type CredentialScope =
  | { type: 'user'; userId: string }
  | { type: 'org';  orgId: string };

/**
 * Manages encrypted credentials for MCP servers.
 * Supports both personal (user-scoped) and org-scoped credentials.
 * Uses AES-256-GCM for encryption.
 */
export class CredentialManager {
  private encryptionKey: Buffer | null = null;

  constructor(
    private db: Pool,
    private secretKey: string
  ) {}

  async initialize(): Promise<void> {
    this.encryptionKey = (await scryptAsync(this.secretKey, 'salt', 32)) as Buffer;
    // Table is created by schema.sql — no DDL here
  }

  async storeCredentials(
    scope: CredentialScope,
    serverId: string,
    credentials: MCPCredentials,
    expiresAt?: Date
  ): Promise<void> {
    if (!this.encryptionKey) throw new Error('CredentialManager not initialized');

    const { encrypted, iv, authTag } = await this.encrypt(JSON.stringify(credentials));
    const { userCol, orgCol, userVal, orgVal } = this.scopeToColumns(scope);

    await this.db.query(
      `INSERT INTO mcp_credentials (${userCol}, ${orgCol}, server_id, encrypted_data, iv, auth_tag, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (${userCol}, server_id) WHERE ${userCol} IS NOT NULL
       DO UPDATE SET
         encrypted_data = EXCLUDED.encrypted_data,
         iv             = EXCLUDED.iv,
         auth_tag       = EXCLUDED.auth_tag,
         expires_at     = EXCLUDED.expires_at,
         updated_at     = NOW()`,
      [userVal, orgVal, serverId, encrypted, iv, authTag, expiresAt ?? null]
    );
  }

  async getCredentials(
    scope: CredentialScope,
    serverId: string
  ): Promise<MCPCredentials | null> {
    if (!this.encryptionKey) throw new Error('CredentialManager not initialized');

    const { col, val } = this.scopeToFilter(scope);
    const result = await this.db.query(
      `SELECT encrypted_data, iv, auth_tag
       FROM mcp_credentials
       WHERE ${col} = $1 AND server_id = $2`,
      [val, serverId]
    );

    if (result.rows.length === 0) return null;

    const { encrypted_data, iv, auth_tag } = result.rows[0];
    const decrypted = await this.decrypt(encrypted_data, iv, auth_tag);
    return JSON.parse(decrypted);
  }

  async deleteCredentials(scope: CredentialScope, serverId: string): Promise<void> {
    const { col, val } = this.scopeToFilter(scope);
    await this.db.query(
      `DELETE FROM mcp_credentials WHERE ${col} = $1 AND server_id = $2`,
      [val, serverId]
    );
  }

  async hasCredentials(scope: CredentialScope, serverId: string): Promise<boolean> {
    const { col, val } = this.scopeToFilter(scope);
    const result = await this.db.query(
      `SELECT 1 FROM mcp_credentials WHERE ${col} = $1 AND server_id = $2`,
      [val, serverId]
    );
    return result.rows.length > 0;
  }

  // ---- Legacy helpers (user-scoped only, kept for backwards compat) ----

  async storeUserCredentials(userId: string, serverId: string, credentials: MCPCredentials): Promise<void> {
    return this.storeCredentials({ type: 'user', userId }, serverId, credentials);
  }

  async getUserCredentials(userId: string, serverId: string): Promise<MCPCredentials | null> {
    return this.getCredentials({ type: 'user', userId }, serverId);
  }

  async deleteUserCredentials(userId: string, serverId: string): Promise<void> {
    return this.deleteCredentials({ type: 'user', userId }, serverId);
  }

  async hasUserCredentials(userId: string, serverId: string): Promise<boolean> {
    return this.hasCredentials({ type: 'user', userId }, serverId);
  }

  // ---- Private helpers ----

  private scopeToColumns(scope: CredentialScope) {
    if (scope.type === 'user') {
      return { userCol: 'user_id', orgCol: 'org_id', userVal: scope.userId, orgVal: null };
    }
    return { userCol: 'user_id', orgCol: 'org_id', userVal: null, orgVal: scope.orgId };
  }

  private scopeToFilter(scope: CredentialScope) {
    if (scope.type === 'user') return { col: 'user_id', val: scope.userId };
    return { col: 'org_id', val: scope.orgId };
  }

  private async encrypt(data: string): Promise<{ encrypted: string; iv: string; authTag: string }> {
    if (!this.encryptionKey) throw new Error('Encryption key not initialized');

    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
    };
  }

  private async decrypt(encryptedData: string, ivHex: string, authTagHex: string): Promise<string> {
    if (!this.encryptionKey) throw new Error('Encryption key not initialized');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
