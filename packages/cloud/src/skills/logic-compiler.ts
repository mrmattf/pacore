import type {
  CompiledPolicy,
  DataEnrichmentSpec,
  NamedTemplates,
  Action,
} from '@pacore/core';
import type {
  BackorderPolicyEvalContext,
  BackorderCondition,
} from '../chains/backorder-types';

// Backorder-specific aliases used in evaluatePolicy/matchesCondition
type PolicyEvalContext = BackorderPolicyEvalContext;
type Condition = BackorderCondition;

const ENRICHMENT_MAX_ITERATIONS = 50;

// ---- Policy evaluation (pure TS, no LLM at runtime) ----

/**
 * Evaluates a CompiledPolicy against an enriched context.
 * Returns the actions from the first matching rule, or defaultActions.
 */
export function evaluatePolicy(
  policy: CompiledPolicy,
  context: Record<string, unknown>
): Action[] {
  const ctx = context as PolicyEvalContext;
  for (const rule of policy.rules) {
    if (matchesRule(rule.conditions as Condition[][], ctx)) {
      return rule.actions as Action[];
    }
  }
  return policy.defaultActions as Action[];
}

function matchesRule(conditions: Condition[][], context: PolicyEvalContext): boolean {
  // Outer = OR groups; inner = AND within group
  return conditions.some(andGroup => andGroup.every(cond => matchesCondition(cond, context)));
}

function matchesCondition(cond: Condition, ctx: PolicyEvalContext): boolean {
  switch (cond.type) {
    case 'backorder_status':
      if (cond.value === 'all')     return ctx.allItemsBackordered;
      if (cond.value === 'partial') return ctx.someItemsBackordered && !ctx.allItemsBackordered;
      if (cond.value === 'none')    return !ctx.someItemsBackordered;
      return false;

    case 'order_total_gt':
      return ctx.orderTotal > cond.value;

    case 'backordered_item_count_gt':
      return ctx.backorderedItems.length > cond.value;

    case 'customer_order_count_gt':
      return typeof ctx.customerOrderCount === 'number' && ctx.customerOrderCount > cond.value;

    default:
      return false;
  }
}

// ---- Enrichment runner (pure TS, no LLM at runtime) ----

export interface MCPToolCaller {
  callTool(tool: string, params: Record<string, unknown>): Promise<unknown>;
}

/**
 * Runs the DataEnrichmentSpec steps against the current context.
 * Each step calls an MCP tool and merges the result into the context.
 * Steps with iterateOver call the tool once per item (capped at ENRICHMENT_MAX_ITERATIONS).
 */
export async function runEnrichmentSteps(
  spec: DataEnrichmentSpec,
  context: Record<string, unknown>,
  mcpCaller: MCPToolCaller
): Promise<Record<string, unknown>> {
  const ctx = { ...context } as Record<string, unknown>;

  for (const step of spec.steps) {
    if (step.iterateOver) {
      const items = ctx[step.iterateOver];
      if (!Array.isArray(items)) continue;

      const capped = items.slice(0, ENRICHMENT_MAX_ITERATIONS);
      for (const item of capped) {
        const params = resolveParams(step.inputMapping, { ...ctx, item });
        try {
          const result = await mcpCaller.callTool(step.tool, params);
          setPath(item, step.resultPath.replace(/^item\./, ''), result);
        } catch (err) {
          console.warn(`[EnrichmentStep] ${step.tool} failed for item:`, err);
        }
      }
    } else {
      const params = resolveParams(step.inputMapping, ctx);
      try {
        const result = await mcpCaller.callTool(step.tool, params);
        setPath(ctx, step.resultPath, result);
      } catch (err) {
        console.warn(`[EnrichmentStep] ${step.tool} failed:`, err);
      }
    }
  }

  return ctx;
}

// ---- NL → CompiledPolicy compiler (used by skill developers, not end users) ----

export interface CompileInstructionsInput {
  instructions: string;
  availableReadOnlyTools: string[];  // ONLY read-only tools — never pass write/mutate tools here
}

export interface CompileInstructionsOutput {
  compiledPolicy: CompiledPolicy;
  defaultTemplates: NamedTemplates;
  enrichmentSpec: DataEnrichmentSpec;
}

/**
 * Developer tooling: compiles natural-language skill instructions into a CompiledPolicy,
 * NamedTemplates stubs, and a DataEnrichmentSpec.
 *
 * SECURITY: availableReadOnlyTools MUST contain only read-only tools.
 * Write/mutate operations (cancel_order, update_inventory, etc.) must never
 * be passed here — they could otherwise appear in enrichment steps.
 *
 * This function is used during skill template authoring, NOT at execution time.
 * At execution time, evaluatePolicy() and runEnrichmentSteps() are used directly.
 */
export async function compileInstructions(
  input: CompileInstructionsInput,
  llmCall: (prompt: string) => Promise<string>
): Promise<CompileInstructionsOutput> {
  const toolList = input.availableReadOnlyTools.join(', ');

  const prompt = `You are a skill policy compiler. Given natural-language instructions for an e-commerce backorder notification skill, produce a JSON object with exactly three keys: "compiledPolicy", "defaultTemplates", "enrichmentSpec".

Available read-only tools (for enrichmentSpec steps only): ${toolList}

Instructions:
${input.instructions}

Output ONLY a valid JSON object matching these TypeScript types:

CompiledPolicy: { version: 2, rules: Array<{ name: string, conditions: Condition[][], actions: Action[] }>, defaultActions: Action[] }
Condition: { type: 'backorder_status', value: 'all'|'partial'|'none' } | { type: 'order_total_gt'|'backordered_item_count_gt'|'customer_order_count_gt', value: number }
Action:
  | { type: 'invoke', targetSlot: string, capability: string, params: Record<string,unknown>, templateKey?: string }
    // targetSlot: abstract slot key (e.g. 'notification') — resolved to the user's chosen integration at runtime
    // capability: bare name (e.g. 'create_ticket') — not namespaced
    // params: static params merged with runtime context (e.g. { priority: 'high' })
    // templateKey: if set, renders a named template and merges subject+message into params before dispatch
  | { type: 'skip' }
    // stop processing — no action taken
  | { type: 'escalate', message?: string }
    // platform handles this — logs and continues (does not break the action loop)
NamedTemplates: Record<string, { label: string, subject: string, intro: string, body: string, closing: string }>
DataEnrichmentSpec: { steps: Array<{ tool: string, iterateOver?: string, inputMapping: Record<string,string>, resultPath: string }> }

Rules:
- conditions outer array = OR groups; inner array = AND conditions
- templateKey in invoke actions must match a key in defaultTemplates
- enrichmentSpec.steps must only reference tools from the available tools list
- If no enrichment is needed, return { steps: [] }
- body in NamedTemplates may include HTML
- Use {{orderNumber}}, {{customerName}}, {{backorderedItemsTable}}, {{eta}} as template variables
- Use 'notification' as the targetSlot for support ticket creation actions

Respond with ONLY the JSON object, no markdown fences.`;

  const raw = await llmCall(prompt);
  const parsed = JSON.parse(raw.trim());

  return {
    compiledPolicy:  parsed.compiledPolicy,
    defaultTemplates: parsed.defaultTemplates,
    enrichmentSpec:  parsed.enrichmentSpec,
  };
}

// ---- Private utilities ----

function resolveParams(
  mapping: Record<string, string>,
  context: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [param, path] of Object.entries(mapping)) {
    result[param] = getPath(context, path);
  }
  return result;
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((cur: unknown, key) => {
    if (cur && typeof cur === 'object') return (cur as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}
