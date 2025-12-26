import { Pool } from 'pg';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export interface MCPCredentials {
  apiKey?: string;
  username?: string;
  password?: string;
  customHeaders?: Record<string, string>;
}

/**
 * Manages encrypted credentials for MCP servers
 * Uses AES-256-GCM for encryption
 */
export class CredentialManager {
  private encryptionKey: Buffer | null = null;

  constructor(
    private db: Pool,
    private secretKey: string
  ) {}

  /**
   * Initialize the credential manager
   * Derives encryption key from secret
   */
  async initialize(): Promise<void> {
    // Derive encryption key from secret using scrypt
    this.encryptionKey = (await scryptAsync(this.secretKey, 'salt', 32)) as Buffer;

    // Create credentials table if it doesn't exist
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS mcp_credentials (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        server_id VARCHAR(255) NOT NULL,
        encrypted_data TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, server_id)
      );

      CREATE INDEX IF NOT EXISTS idx_mcp_creds_user_server
        ON mcp_credentials(user_id, server_id);
    `);
  }

  /**
   * Store encrypted credentials for a server
   */
  async storeCredentials(
    userId: string,
    serverId: string,
    credentials: MCPCredentials
  ): Promise<void> {
    if (!this.encryptionKey) {
      throw new Error('CredentialManager not initialized');
    }

    const { encrypted, iv, authTag } = await this.encrypt(JSON.stringify(credentials));

    await this.db.query(
      `INSERT INTO mcp_credentials (user_id, server_id, encrypted_data, iv, auth_tag)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, server_id)
       DO UPDATE SET
         encrypted_data = EXCLUDED.encrypted_data,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         updated_at = NOW()`,
      [userId, serverId, encrypted, iv, authTag]
    );
  }

  /**
   * Retrieve and decrypt credentials for a server
   */
  async getCredentials(userId: string, serverId: string): Promise<MCPCredentials | null> {
    if (!this.encryptionKey) {
      throw new Error('CredentialManager not initialized');
    }

    const result = await this.db.query(
      `SELECT encrypted_data, iv, auth_tag
       FROM mcp_credentials
       WHERE user_id = $1 AND server_id = $2`,
      [userId, serverId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const { encrypted_data, iv, auth_tag } = result.rows[0];

    const decrypted = await this.decrypt(encrypted_data, iv, auth_tag);
    return JSON.parse(decrypted);
  }

  /**
   * Delete credentials for a server
   */
  async deleteCredentials(userId: string, serverId: string): Promise<void> {
    await this.db.query(
      'DELETE FROM mcp_credentials WHERE user_id = $1 AND server_id = $2',
      [userId, serverId]
    );
  }

  /**
   * Check if credentials exist for a server
   */
  async hasCredentials(userId: string, serverId: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM mcp_credentials WHERE user_id = $1 AND server_id = $2',
      [userId, serverId]
    );
    return result.rows.length > 0;
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private async encrypt(data: string): Promise<{
    encrypted: string;
    iv: string;
    authTag: string;
  }> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    // Generate random IV (initialization vector)
    const iv = randomBytes(16);

    // Create cipher
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    // Encrypt data
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private async decrypt(
    encryptedData: string,
    ivHex: string,
    authTagHex: string
  ): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    // Convert hex strings back to buffers
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    // Create decipher
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    // Decrypt data
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
