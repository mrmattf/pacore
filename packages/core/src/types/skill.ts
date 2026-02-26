export type SkillStatus = 'pending' | 'active' | 'paused';
export type TriggerType = 'webhook' | 'scheduled' | 'manual';
export type TriggerStatus = 'active' | 'disabled';
export type ExecutionStatus = 'running' | 'completed' | 'failed';

// ---- Skill catalog (platform-defined) ----

export interface SkillDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  configSchema: Record<string, unknown>;   // JSON Schema
  requiredCapabilities: string[];
  triggerType: TriggerType;
  toolChain: string;
  createdAt?: Date;
}

// ---- User/org activation of a skill ----

export interface UserSkill {
  id: string;
  userId: string | null;    // set for personal skills
  orgId: string | null;     // set for org-level skills
  skillId: string;
  configuration: Record<string, unknown>;
  status: SkillStatus;
  activatedAt: Date | null;
  createdAt: Date;
}

// ---- Webhook trigger ----

export type WebhookVerification =
  | { type: 'none' }
  | { type: 'hmac_sha256'; header: string; secret: string }
  | { type: 'hmac_sha256_v0'; header: string; secret: string }  // Slack ts+body format
  | { type: 'google_oidc'; audience: string };

export interface SkillTrigger {
  id: string;
  userSkillId: string;
  triggerType: TriggerType;
  endpointToken: string;
  verificationConfig: WebhookVerification;
  status: TriggerStatus;
  createdAt: Date;
}

// ---- Execution record ----

export interface SkillExecution {
  id: string;
  userSkillId: string;
  triggerId: string | null;
  status: ExecutionStatus;
  payload: unknown;
  result: unknown;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
}
