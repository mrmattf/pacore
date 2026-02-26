import fs from 'fs';
import path from 'path';

export interface TemplateConfig {
  brandName?: string;     // shown in email header/footer — default "Customer Support Team"
  logoUrl?: string;       // https:// URL for a logo image above the order heading
  primaryColor?: string;  // heading color — default "#1a202c"
  accentColor?: string;   // backordered status color — default "#e53e3e"
  footerText?: string;    // e.g. "Questions? Email support@yota.com"
  signOff?: string;       // e.g. "The Yota Team"
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
