import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import { useSkills, SkillTrigger } from '../hooks/useSkills';

// ─── JSON Schema helpers ──────────────────────────────────────────────────────

interface SchemaProperty {
  type: 'string' | 'number' | 'boolean';
  title?: string;
  description?: string;
  format?: string;
  default?: unknown;
  'x-group'?: string;
  'x-group-label'?: string;
}

interface ConfigSchema {
  type: 'object';
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

interface WizardStep {
  id: string;
  label: string;
  fields: Array<{ key: string; schema: SchemaProperty; required: boolean }>;
}

/**
 * Build the ordered list of dynamic steps from configSchema.
 * One step per unique x-group value, in first-occurrence order.
 */
function buildDynamicSteps(schema: ConfigSchema | undefined): WizardStep[] {
  if (!schema?.properties) return [];

  const groupOrder: string[] = [];
  const groupLabel: Record<string, string> = {};
  const groupFields: Record<string, WizardStep['fields']> = {};
  const required = new Set(schema.required ?? []);

  for (const [key, prop] of Object.entries(schema.properties)) {
    const group = prop['x-group'];
    if (!group) continue;

    if (!groupOrder.includes(group)) {
      groupOrder.push(group);
      groupLabel[group] = prop['x-group-label'] ?? group;
      groupFields[group] = [];
    }

    groupFields[group].push({ key, schema: prop, required: required.has(key) });
  }

  return groupOrder.map((g) => ({
    id: g,
    label: groupLabel[g],
    fields: groupFields[g],
  }));
}

// ─── Helper components ────────────────────────────────────────────────────────

function StepIndicator({ current, steps }: { current: number; steps: Array<{ id: string; label: string }> }) {
  return (
    <ol className="flex items-center gap-1">
      {steps.map((step, i) => (
        <li key={step.id} className="flex items-center gap-1">
          <span
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold
              ${i < current ? 'bg-blue-600 text-white' :
                i === current ? 'border-2 border-blue-600 text-blue-600' :
                'border border-gray-300 text-gray-400'}`}
          >
            {i < current ? <Check size={14} /> : i + 1}
          </span>
          <span
            className={`text-xs hidden sm:block ${
              i === current ? 'text-blue-600 font-medium' : 'text-gray-400'
            }`}
          >
            {step.label}
          </span>
          {i < steps.length - 1 && (
            <span className="w-6 h-px bg-gray-200 mx-1" />
          )}
        </li>
      ))}
    </ol>
  );
}

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${props.className ?? ''}`}
    />
  );
}

/** Render a single schema-driven field as the appropriate input control. */
function SchemaField({
  fieldKey,
  prop,
  required,
  values,
  onChange,
}: {
  fieldKey: string;
  prop: SchemaProperty;
  required: boolean;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const value = values[fieldKey] ?? prop.default ?? (prop.type === 'number' ? 0 : prop.type === 'boolean' ? false : '');

  if (prop.type === 'boolean') {
    return (
      <Field label={prop.title ?? fieldKey} required={required} hint={prop.description}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => onChange(fieldKey, e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
          />
          <span className="text-sm text-gray-700">{prop.title ?? fieldKey}</span>
        </label>
      </Field>
    );
  }

  if (prop.type === 'number') {
    return (
      <Field label={prop.title ?? fieldKey} required={required} hint={prop.description}>
        <Input
          type="number"
          value={value as number}
          onChange={(e) => onChange(fieldKey, parseFloat(e.target.value) || 0)}
        />
      </Field>
    );
  }

  return (
    <Field label={prop.title ?? fieldKey} required={required} hint={prop.description}>
      <Input
        type={prop.format === 'password' ? 'password' : 'text'}
        value={value as string}
        placeholder={prop.format === 'password' ? '••••••••••••••••' : undefined}
        onChange={(e) => onChange(fieldKey, e.target.value)}
      />
    </Field>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SkillConfigPage() {
  const { skillId, userSkillId } = useParams<{ skillId: string; userSkillId: string }>();
  const navigate = useNavigate();
  const { catalog, mySkills, configureSkill, createTrigger, getTriggers } = useSkills();

  const skill = catalog.find((s) => s.id === skillId);
  const userSkill = mySkills.find((s) => s.id === userSkillId);

  // ── Build wizard steps from configSchema ────────────────────────────────
  const configSchema = skill?.configSchema as ConfigSchema | undefined;
  const dynamicSteps = useMemo(() => buildDynamicSteps(configSchema), [configSchema]);

  const showWebhookStep = skill?.triggerType === 'webhook';

  const allSteps = useMemo(() => [
    { id: 'scope', label: 'Scope' },
    ...dynamicSteps,
    ...(showWebhookStep ? [{ id: 'webhook', label: 'Webhook URL' }] : []),
  ], [dynamicSteps, showWebhookStep]);

  // ── State ────────────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [trigger, setTrigger] = useState<SkillTrigger | null>(null);
  const [copied, setCopied] = useState(false);
  const [scope, setScope] = useState<'personal' | 'org'>('personal');

  // Generic form values for schema-driven fields
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});

  const setField = (key: string, value: unknown) =>
    setFieldValues((prev) => ({ ...prev, [key]: value }));

  // Pre-fill from existing config if re-visiting
  useEffect(() => {
    if (!userSkill?.configuration) return;
    const c = userSkill.configuration as Record<string, unknown>;
    setFieldValues(c);
  }, [userSkill]);

  // Load trigger on the last (webhook) step
  useEffect(() => {
    const lastStepIdx = allSteps.length - 1;
    if (step === lastStepIdx && showWebhookStep && userSkillId && !trigger) {
      getTriggers(userSkillId).then((ts) => {
        if (ts.length > 0) setTrigger(ts[0]);
      });
    }
  }, [step, allSteps.length, showWebhookStep, userSkillId, trigger, getTriggers]);

  if (!skill || !userSkill) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Loading…
      </div>
    );
  }

  const webhookUrl = trigger
    ? `${window.location.origin}/v1/triggers/webhook/${trigger.endpointToken}`
    : null;

  // ── Validation for current step ──────────────────────────────────────────
  const canProceed = (): boolean => {
    const currentStepDef = allSteps[step];
    if (!currentStepDef || currentStepDef.id === 'scope' || currentStepDef.id === 'webhook') {
      return true;
    }
    const dynStep = dynamicSteps.find((s) => s.id === currentStepDef.id);
    if (!dynStep) return true;
    return dynStep.fields
      .filter((f) => f.required)
      .every((f) => {
        const v = fieldValues[f.key];
        return v !== undefined && v !== null && String(v).trim() !== '';
      });
  };

  // ── Navigation ───────────────────────────────────────────────────────────
  const isSaveStep = step === allSteps.length - (showWebhookStep ? 2 : 1);

  const handleSaveAndNext = async () => {
    if (isSaveStep) {
      setSaving(true);
      try {
        await configureSkill(userSkillId!, fieldValues);

        if (showWebhookStep) {
          const existing = await getTriggers(userSkillId!);
          if (existing.length === 0) {
            const t = await createTrigger(userSkillId!);
            setTrigger(t);
          } else {
            setTrigger(existing[0]);
          }
        }

        setStep((s) => s + 1);
      } catch (e: unknown) {
        alert(`Save failed: ${(e as Error).message}`);
      } finally {
        setSaving(false);
      }
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleCopy = () => {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const currentStepDef = allSteps[step];
  const currentDynStep = dynamicSteps.find((s) => s.id === currentStepDef?.id);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/skills')}
              className="text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold">{skill.name}</h1>
              <p className="text-sm text-gray-500">Setup wizard</p>
            </div>
          </div>
          <StepIndicator current={step} steps={allSteps} />
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-auto flex items-start justify-center p-8">
        <div className="bg-white rounded-xl border shadow-sm w-full max-w-lg p-8">

          {/* Step: Scope (always first) */}
          {currentStepDef?.id === 'scope' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Where should this skill run?</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Skills can run in your personal space or be shared with your organization.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(['personal', 'org'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className={`p-4 border-2 rounded-lg text-left transition-colors ${
                      scope === s
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium capitalize">{s === 'org' ? 'Organization' : 'Personal'}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {s === 'personal'
                        ? 'Only visible to you'
                        : 'Shared with all org members'}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                Organization activation requires admin access and can be changed later.
              </p>
            </div>
          )}

          {/* Dynamic steps driven by configSchema x-group */}
          {currentDynStep && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">{currentDynStep.label}</h2>
              </div>
              <div className="space-y-4">
                {currentDynStep.fields.map(({ key, schema: prop, required }) => (
                  <SchemaField
                    key={key}
                    fieldKey={key}
                    prop={prop}
                    required={required}
                    values={fieldValues}
                    onChange={setField}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Step: Webhook URL (always last, only for webhook-triggered skills) */}
          {currentStepDef?.id === 'webhook' && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle size={20} className="text-green-500" />
                  <h2 className="text-lg font-semibold">Skill is configured!</h2>
                </div>
                <p className="text-sm text-gray-500">
                  Copy the webhook URL below and paste it into your Shopify store's webhook settings.
                  Shopify will call this URL whenever an order is created or updated.
                </p>
              </div>

              {webhookUrl ? (
                <div className="space-y-3">
                  <div className="bg-gray-50 border rounded-lg p-3 flex items-center gap-2">
                    <code className="flex-1 text-xs text-gray-700 break-all">{webhookUrl}</code>
                    <button
                      onClick={handleCopy}
                      className="flex-shrink-0 p-2 hover:bg-gray-200 rounded text-gray-500"
                      title="Copy URL"
                    >
                      {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <p className="font-medium text-gray-700">Next steps in Shopify:</p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>Go to Settings → Notifications → Webhooks</li>
                      <li>Click "Create webhook"</li>
                      <li>Event: <strong>Order creation</strong></li>
                      <li>Format: <strong>JSON</strong></li>
                      <li>Paste the URL above and click Save</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Generating webhook URL…</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={() => navigate('/skills')}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  Done — Go to Skills
                </button>
              </div>
            </div>
          )}

          {/* Navigation — shown on all steps except the final webhook step */}
          {currentStepDef?.id !== 'webhook' && (
            <div className="flex justify-between mt-8 pt-4 border-t">
              <button
                onClick={() => (step === 0 ? navigate('/skills') : setStep((s) => s - 1))}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1"
              >
                <ArrowLeft size={14} />
                {step === 0 ? 'Cancel' : 'Back'}
              </button>
              <button
                onClick={handleSaveAndNext}
                disabled={!canProceed() || saving}
                className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {isSaveStep ? 'Save & finish' : 'Next'}
                {!saving && <ArrowRight size={14} />}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
