import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { BillingScope, SkillTrigger, WebhookVerification } from '@pacore/core';
import { SkillRegistry } from '../skills/skill-registry';
import { SkillDispatcher } from '../skills/skill-dispatcher';
import { BillingManager } from '../billing';
import { isSandboxPlan } from '../billing/plan-definitions';
import { Pool } from 'pg';

export class WebhookTriggerHandler {
  constructor(
    private skillRegistry: SkillRegistry,
    private skillDispatcher: SkillDispatcher,
    private db?: Pool,
    private billingManager?: BillingManager
  ) {}

  /**
   * Handle an incoming webhook request.
   * Returns the HTTP status code to respond with (always 200 if the token is valid).
   * Processing is async — the response is sent before the skill runs.
   */
  async handle(
    token: string,
    req: Request
  ): Promise<{ status: number; body: string }> {
    const trigger = await this.skillRegistry.getTriggerByToken(token);

    if (!trigger) {
      return { status: 404, body: 'Trigger not found' };
    }

    // Check if the parent skill is paused — return 200 so the source platform
    // doesn't retry or unregister the webhook, but don't create an execution.
    const userSkill = await this.skillRegistry.getUserSkill(trigger.userSkillId);
    if (userSkill?.status === 'paused') {
      console.log(`[WebhookTrigger] Skill ${trigger.userSkillId} is paused — dropping webhook`);
      return { status: 200, body: 'Paused' };
    }

    const rawBody = req.body as Buffer;
    const payload = rawBody instanceof Buffer ? rawBody : Buffer.from(JSON.stringify(rawBody));

    // Verify the request (pluggable per trigger)
    const verificationError = await verifyRequest(req, payload, trigger.verificationConfig);
    if (verificationError) {
      console.warn(`[WebhookTrigger] Verification failed for token ${token.slice(0, 8)}...: ${verificationError}`);
      return { status: 401, body: 'Verification failed' };
    }

    // Parse the JSON payload
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(payload.toString('utf8'));
    } catch {
      return { status: 400, body: 'Invalid JSON body' };
    }

    // Check execution quota and determine sandbox mode
    let sandboxMode = false;
    if (this.billingManager && this.db) {
      const scopeRow = await this.db.query<{ org_id: string | null }>(
        'SELECT org_id FROM user_skills WHERE id = $1',
        [trigger.userSkillId]
      );
      if (scopeRow.rows.length > 0) {
        const { org_id } = scopeRow.rows[0];
        if (org_id) {
          // Operator-managed customer orgs don't have their own billing_subscriptions row —
          // they run under the operator relationship, not the self-serve free plan.
          // Skipping the plan-based sandbox check for these orgs prevents them from always
          // being forced into dry-run mode.
          const operatorRow = await this.db!.query<{ count: string }>(
            'SELECT COUNT(*) AS count FROM operator_customers WHERE org_id = $1',
            [org_id]
          );
          const isOperatorManaged = parseInt(operatorRow.rows[0]?.count ?? '0', 10) > 0;

          if (!isOperatorManaged) {
            const scope: BillingScope = { type: 'org', orgId: org_id };
            const plan = await this.billingManager.getEffectivePlan(scope);
            sandboxMode = isSandboxPlan(plan);
            if (!sandboxMode) {
              const overLimit = await this.billingManager.isOverLimit(scope, 'skillExecutionsPerMonth');
              if (overLimit) {
                return { status: 429, body: 'Monthly execution limit reached. Upgrade your plan.' };
              }
            }
          }
        }
      }
    }

    // Skill-level test mode: force sandbox regardless of billing plan
    const skillConfig = userSkill?.configuration as { testMode?: boolean } | undefined;
    if (skillConfig?.testMode === true) {
      sandboxMode = true;
    }

    // Start execution record (sandbox flag controls billing increment + dry-run)
    const execution = await this.skillRegistry.createExecution(
      trigger.userSkillId,
      trigger.id,
      parsedPayload,
      { sandbox: sandboxMode }
    );

    // Dispatch asynchronously — caller gets 200 immediately
    this.skillDispatcher
      .dispatch(execution.id, trigger.userSkillId, parsedPayload, { dryRun: sandboxMode })
      .catch(err => {
        console.error(`[WebhookTrigger] Dispatch error for execution ${execution.id}:`, err);
      });

    return { status: 200, body: 'Accepted' };
  }
}

/**
 * Verify an incoming webhook request based on the trigger's verification config.
 * Returns null if valid, or an error message string if invalid.
 */
async function verifyRequest(
  req: Request,
  rawBody: Buffer,
  config: WebhookVerification
): Promise<string | null> {
  switch (config.type) {
    case 'none':
      return null;

    case 'hmac_sha256': {
      const signature = req.headers[config.header.toLowerCase()] as string | undefined;
      if (!signature) return `Missing header: ${config.header}`;

      const expected = createHmac('sha256', config.secret)
        .update(rawBody)
        .digest('base64');

      const actual = signature.startsWith('sha256=') ? signature.slice(7) : signature;

      try {
        if (!timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
          return 'HMAC signature mismatch';
        }
      } catch {
        return 'HMAC signature comparison failed';
      }
      return null;
    }

    case 'hmac_sha256_v0': {
      // Slack-style: X-Slack-Signature = v0=<hmac(v0:<timestamp>:<body>)>
      const signature = req.headers[config.header.toLowerCase()] as string | undefined;
      const timestamp  = req.headers['x-slack-request-timestamp'] as string | undefined;
      if (!signature || !timestamp) return 'Missing Slack signature headers';

      // Reject requests older than 5 minutes
      if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) {
        return 'Request timestamp too old';
      }

      const sigBase = `v0:${timestamp}:${rawBody.toString('utf8')}`;
      const expected = 'v0=' + createHmac('sha256', config.secret).update(sigBase).digest('hex');

      try {
        if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
          return 'Slack HMAC signature mismatch';
        }
      } catch {
        return 'Slack HMAC comparison failed';
      }
      return null;
    }

    case 'google_oidc': {
      // Google Cloud Pub/Sub / Gmail push sends a Bearer JWT
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return 'Missing Google OIDC Bearer token';

      // For now: log and trust (full JWT verification requires google-auth-library)
      // TODO: verify JWT signature using Google's public keys + check `audience`
      console.warn('[WebhookTrigger] google_oidc verification is accept-all; add JWT check for production');
      return null;
    }

    default:
      return null;
  }
}
