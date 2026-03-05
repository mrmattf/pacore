import fs from 'fs';
import path from 'path';

export interface StyleConfig {
  brandName?: string;     // shown in email header/footer — default "Customer Support Team"
  logoUrl?: string;       // https:// URL for a logo image above the order heading
  primaryColor?: string;  // heading color — default "#1a202c"
  accentColor?: string;   // backordered status color — default "#e53e3e"
  signOff?: string;       // e.g. "The Yota Team"
  footerText?: string;    // e.g. "Questions? Email support@yota.com"
}

export interface BackorderOption {
  label: string;        // bold prefix, e.g. "Ship now"
  description: string;  // explanation text
}

export interface PartialBackorderMessages {
  subject?: string;        // email subject — supports {{orderNumber}}, {{customerName}}
  intro?: string;          // opening paragraph after "Hi {{customerName}}"
  optionsTitle?: string;   // heading above the options box
  options?: BackorderOption[];  // replaces hardcoded A/B; undefined = use defaults; [] = hide box
  closing?: string;        // closing line before sign-off
}

export interface AllBackorderedMessages {
  subject?: string;        // email subject — supports {{orderNumber}}, {{customerName}}
  intro?: string;          // opening paragraph
  waitMessage?: string;    // "we'll ship when back in stock" copy
  cancelMessage?: string;  // "reply to cancel" copy
  closing?: string;        // closing line before sign-off
}

export interface HtmlConfig {
  partialBackorder?: string;  // full HTML override for partial-backorder email
  allBackordered?: string;    // full HTML override for all-backordered email
}

export interface TemplateConfig {
  style?: StyleConfig;
  messages?: {
    partialBackorder?: PartialBackorderMessages;
    allBackordered?: AllBackorderedMessages;
  };
  html?: HtmlConfig;  // raw HTML overrides; takes priority over generated template
}

// ─── Tenant-keyed store ────────────────────────────────────────────────────────
//
// tenantKey format:
//   'default'       → single-tenant / backward-compat (template-config.json)
//   'org-{orgId}'   → org-scoped  (template-config-org-{orgId}.json)
//   'user-{userId}' → user-scoped (template-config-user-{userId}.json)
//
// Keys are sanitized before use in file names to prevent path traversal.

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function configFilePath(tenantKey: string): string {
  const safe = sanitizeKey(tenantKey);
  const filename = safe === 'default' ? 'template-config.json' : `template-config-${safe}.json`;
  return path.resolve(process.cwd(), filename);
}

const cache = new Map<string, TemplateConfig>();

function loadFromDisk(tenantKey: string): TemplateConfig {
  const filePath = configFilePath(tenantKey);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw) as TemplateConfig;
    }
  } catch {
    // Ignore parse errors — start with defaults
  }
  return {};
}

export function getTemplateConfig(tenantKey = 'default'): TemplateConfig {
  if (!cache.has(tenantKey)) {
    cache.set(tenantKey, loadFromDisk(tenantKey));
  }
  return cache.get(tenantKey)!;
}

export function setTemplateConfig(tenantKey: string = 'default', config: TemplateConfig): void {
  cache.set(tenantKey, config);
  // Persist asynchronously — don't block the response
  const filePath = configFilePath(tenantKey);
  fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8', () => {});
}
