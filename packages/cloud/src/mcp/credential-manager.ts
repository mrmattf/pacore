import { Pool } from 'pg';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export interface MCPCredentials {
  apiKey?: string;
  username?: string;
  password?: string;
  email?: string;
  subdomain?: string;
  customHeaders?: Record<string, string>;
  // OAuth token fields (used by platform integrations like Shopify)
  accessToken?: string;
  tokenExpiresAt?: number;  // unix ms timestamp
  clientId?: string;
  clientSecret?: string;
  storeDomain?: string;
}

export type CredentialScope = { type: 'org'; orgId: string };

/**
 * Manages encrypted credentials for MCP servers.
 * All credentials are org-scoped.
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

    await this.db.query(
      `INSERT INTO mcp_credentials (org_id, server_id, encrypted_data, iv, auth_tag, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT mcp_credentials_org_server_uniq
       DO UPDATE SET
         encrypted_data = EXCLUDED.encrypted_data,
         iv             = EXCLUDED.iv,
         auth_tag       = EXCLUDED.auth_tag,
         expires_at     = EXCLUDED.expires_at,
         updated_at     = NOW()`,
      [scope.orgId, serverId, encrypted, iv, authTag, expiresAt ?? null]
    );
  }

  async getCredentials(
    scope: CredentialScope,
    serverId: string
  ): Promise<MCPCredentials | null> {
    if (!this.encryptionKey) throw new Error('CredentialManager not initialized');

    const result = await this.db.query(
      `SELECT encrypted_data, iv, auth_tag
       FROM mcp_credentials
       WHERE org_id = $1 AND server_id = $2`,
      [scope.orgId, serverId]
    );

    if (result.rows.length === 0) return null;

    const { encrypted_data, iv, auth_tag } = result.rows[0];
    const decrypted = await this.decrypt(encrypted_data, iv, auth_tag);
    return JSON.parse(decrypted);
  }

  async deleteCredentials(scope: CredentialScope, serverId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM mcp_credentials WHERE org_id = $1 AND server_id = $2`,
      [scope.orgId, serverId]
    );
  }

  async hasCredentials(scope: CredentialScope, serverId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM mcp_credentials WHERE org_id = $1 AND server_id = $2`,
      [scope.orgId, serverId]
    );
    return result.rows.length > 0;
  }

  // ---- Private helpers ----

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
