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

const CONFIG_PATH = path.resolve(process.cwd(), 'template-config.json');

let current: TemplateConfig = {};

// Load persisted config on startup (best-effort — missing file is fine)
try {
  if (fs.existsSync(CONFIG_PATH)) {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    current = JSON.parse(raw) as TemplateConfig;
  }
} catch {
  // Ignore parse errors — start with defaults
}

export function getTemplateConfig(): TemplateConfig {
  return current;
}

export function setTemplateConfig(config: TemplateConfig): void {
  current = config;
  // Persist asynchronously — don't block the response
  fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8', () => {});
}
