import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Copy, Check, Zap } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { ConnectionPicker } from '../components/ConnectionPicker';
import { useContextStore, skillsBasePath } from '../store/contextStore';
import { apiFetch } from '../services/auth';

interface SkillSlot {
  key: string;
  label: string;
  integrationKey: string;
  required: boolean;
}

interface EditableField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number';
  defaultValue: unknown;
  hint?: string;
  rows?: number;
}

interface TemplateVariable {
  key: string;
  label: string;
  example?: string;
}

interface SkillTemplate {
  id: string;
  skillTypeId: string;
  name: string;
  slots: SkillSlot[];
  editableFields: EditableField[];
  templateVariables?: TemplateVariable[];
}

type Panel = 'connections' | 'customize' | 'activate';

export function SkillConfigPage() {
  const { typeId, templateId, userSkillId } = useParams<{
    typeId: string;
    templateId: string;
    userSkillId: string;
  }>();
  const navigate = useNavigate();
  const token = useAuthStore(s => s.token)!;
  const { context } = useContextStore();

  const [template, setTemplate] = useState<SkillTemplate | null>(null);
  const [slotConnections, setSlotConnections] = useState<Record<string, string>>({});
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, unknown>>({});
  const [activePanel, setActivePanel] = useState<Panel>('connections');
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    if (!typeId || !templateId || !token) return;
    loadTemplate();
    loadExistingConfig();
    loadWebhook();
  }, [typeId, templateId, userSkillId, token]);

  async function loadTemplate() {
    const res = await apiFetch(`/v1/skill-types/${typeId}/templates`);
    if (res.ok) {
      const templates: SkillTemplate[] = await res.json();
      const found = templates.find(t => t.id === templateId);
      if (found) setTemplate(found);
    }
  }

  async function loadExistingConfig() {
    if (!userSkillId) return;
    const base = skillsBasePath(context);
    const res = await apiFetch(`${base}/${userSkillId}`);
    // If skill has existing config, pre-populate
    if (res.ok) {
      const skill = await res.json();
      const cfg = skill.configuration ?? {};
      if (cfg.slotConnections) setSlotConnections(cfg.slotConnections);
      if (cfg.fieldOverrides) setFieldOverrides(cfg.fieldOverrides);
      if (cfg.testMode !== undefined) setTestMode(Boolean(cfg.testMode));
    }
  }

  async function loadWebhook() {
    if (!userSkillId) return;
    const base = skillsBasePath(context);
    const res = await apiFetch(`${base}/${userSkillId}/triggers`);
    if (res.ok) {
      const triggers = await res.json();
      if (triggers.length > 0) {
        const origin = window.location.origin.replace(':3001', ':3000');
        setWebhookUrl(`${origin}/v1/triggers/webhook/${triggers[0].endpointToken}`);
      }
    }
  }

  async function saveConfig() {
    if (!userSkillId) return;
    setSaving(true);
    const base = skillsBasePath(context);
    try {
      await apiFetch(`${base}/${userSkillId}/configure`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          slotConnections,
          fieldOverrides,
          testMode,
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate() {
    if (!userSkillId) return;
    setActivating(true);
    try {
      await saveConfig();

      const base = skillsBasePath(context);

      // Create webhook trigger if not yet created
      if (!webhookUrl) {
        const res = await apiFetch(`${base}/${userSkillId}/triggers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verification: { type: 'none' } }),
        });
        if (res.ok) {
          const trigger = await res.json();
          const origin = window.location.origin.replace(':3001', ':3000');
          setWebhookUrl(`${origin}/v1/triggers/webhook/${trigger.endpointToken}`);
        }
      }

      // Mark skill as active
      await apiFetch(`${base}/${userSkillId}/configure`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          slotConnections,
          fieldOverrides,
          testMode,
          status: 'active',
        }),
      });

      navigate('/skills');
    } finally {
      setActivating(false);
    }
  }

  async function handleTestEvent() {
    if (!userSkillId) return;
    setTestLoading(true);
    setTestResult(null);
    setTestError(null);
    try {
      await saveConfig();
      const base = skillsBasePath(context);
      const res = await apiFetch(`${base}/${userSkillId}/test-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Test failed');
      setTestResult(data);
    } catch (err: any) {
      setTestError(err.message);
    } finally {
      setTestLoading(false);
    }
  }

  function handleCopyWebhook() {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const allSlotsConnected = template?.slots
    .filter(s => s.required)
    .every(s => slotConnections[s.key]) ?? false;

  const notificationSlot = template?.slots.find(s => s.key !== 'shopify');
  const notificationName = notificationSlot
    ? notificationSlot.integrationKey.charAt(0).toUpperCase() + notificationSlot.integrationKey.slice(1)
    : 'support tool';

  function getFieldValue(field: EditableField): string {
    const override = fieldOverrides[field.key];
    return override !== undefined ? String(override) : String(field.defaultValue ?? '');
  }

  function setFieldValue(key: string, value: string | number) {
    setFieldOverrides(prev => ({ ...prev, [key]: value }));
  }

  const panels: { id: Panel; label: string }[] = [
    { id: 'connections', label: '1. Connect' },
    { id: 'customize',   label: '2. Customize' },
    { id: 'activate',    label: '3. Activate' },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <button
          onClick={() => navigate(`/skills/${typeId}/templates`)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-2"
        >
          <ArrowLeft size={14} /> Back to Templates
        </button>
        <h1 className="text-xl font-bold">{template?.name ?? 'Configure Skill'}</h1>
      </header>

      {/* Panel tabs */}
      <div className="bg-white border-b px-6 flex gap-6">
        {panels.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePanel(p.id)}
            className={`py-3 text-sm border-b-2 transition-colors ${
              activePanel === p.id
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {p.label}
            {p.id === 'connections' && allSlotsConnected && (
              <CheckCircle size={12} className="inline ml-1 text-green-500" />
            )}
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Panel 1: Connections */}
          {activePanel === 'connections' && template && (
            <div className="space-y-6">
              {template.slots.map(slot => (
                <div key={slot.key} className="bg-white border rounded-lg p-5">
                  <ConnectionPicker
                    integrationKey={slot.integrationKey}
                    slotLabel={slot.label}
                    selectedConnectionId={slotConnections[slot.key] ?? null}
                    onSelect={connId =>
                      setSlotConnections(prev => ({ ...prev, [slot.key]: connId }))
                    }
                    token={token}
                    orgId={context.orgId}
                  />
                </div>
              ))}

              <div className="flex justify-end">
                <button
                  onClick={() => setActivePanel('customize')}
                  disabled={!allSlotsConnected}
                  className="px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40"
                >
                  Next: Customize →
                </button>
              </div>
            </div>
          )}

          {/* Panel 2: Customize */}
          {activePanel === 'customize' && template && (
            <div className="space-y-4">
              {template.templateVariables && template.templateVariables.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-xs font-medium text-blue-700 mb-2">Available variables — click to copy</p>
                  <div className="flex flex-wrap gap-1.5">
                    {template.templateVariables.map(v => (
                      <button
                        key={v.key}
                        onClick={() => navigator.clipboard.writeText(`{{${v.key}}}`)}
                        title={v.example ? `Example: ${v.example}` : v.label}
                        className="text-xs font-mono bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100"
                      >
                        {`{{${v.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-white border rounded-lg p-5 space-y-4">
                {template.editableFields.map(field => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        value={getFieldValue(field)}
                        onChange={e => setFieldValue(field.key, e.target.value)}
                        rows={field.rows ?? 3}
                        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : field.type === 'number' ? (
                      <input
                        type="number"
                        value={getFieldValue(field)}
                        onChange={e => setFieldValue(field.key, parseInt(e.target.value) || 0)}
                        className="w-32 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <input
                        type="text"
                        value={getFieldValue(field)}
                        onChange={e => setFieldValue(field.key, e.target.value)}
                        className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                    {field.hint && (
                      <p className="text-xs text-gray-400 mt-1">{field.hint}</p>
                    )}
                  </div>
                ))}

                <p className="text-xs text-gray-400 border-t pt-3">
                  ℹ Clarissi creates the ticket — {notificationName} handles delivery to your customer.
                </p>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setActivePanel('connections')}
                  className="px-4 py-2 text-sm border rounded text-gray-600 hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={async () => { await saveConfig(); setActivePanel('activate'); }}
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Next: Activate →'}
                </button>
              </div>
            </div>
          )}

          {/* Panel 3: Activate */}
          {activePanel === 'activate' && (
            <div className="space-y-4">
              {/* Test event */}
              <div className="bg-white border rounded-lg p-5 space-y-3">
                <h3 className="font-medium text-gray-900">Dry Run</h3>
                <p className="text-sm text-gray-500">
                  Fire a test event against a synthetic order — nothing will be sent to {notificationName}.
                </p>
                <button
                  onClick={handleTestEvent}
                  disabled={testLoading}
                  className="px-4 py-2 text-sm border rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {testLoading ? 'Running…' : '▶ Fire Test Event'}
                </button>

                {testError && (
                  <div className="text-xs text-red-600 bg-red-50 rounded p-2">{testError}</div>
                )}

                {testResult?.status === 'failed' && testResult?.error && (
                  <div className="text-xs text-red-600 bg-red-50 rounded p-2">{testResult.error}</div>
                )}

                {testResult?.result?.dryRun?.wouldCreateTicket && (
                  <div className="bg-gray-50 rounded p-3 text-xs space-y-1">
                    <div className="font-medium text-gray-700">Would create {notificationName} ticket:</div>
                    <div><span className="text-gray-500">Subject:</span> {testResult.result.dryRun.wouldCreateTicket.subject}</div>
                    <div><span className="text-gray-500">Priority:</span> {testResult.result.dryRun.wouldCreateTicket.priority}</div>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-blue-600">Preview message body</summary>
                      <iframe
                        srcDoc={testResult.result.dryRun.wouldCreateTicket.message}
                        className="mt-2 w-full border rounded bg-white"
                        style={{ height: '280px' }}
                        sandbox="allow-same-origin"
                        title="Email preview"
                      />
                    </details>
                  </div>
                )}

                {testResult?.skipped && !testResult?.result?.dryRun?.wouldCreateTicket && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                    No matching items in test order — skill would skip (no ticket created).
                  </div>
                )}
              </div>

              {/* Test Mode */}
              <div className="bg-white border rounded-lg p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-gray-900">Test Mode</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Runs on real webhooks but does not send to {notificationName}.
                      Executions are logged and do not count toward your quota.
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={testMode}
                    onClick={() => setTestMode(t => !t)}
                    className={`relative mt-1 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                      testMode ? 'bg-amber-500' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                      testMode ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
                {testMode && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                    Test Mode is ON — webhook events run the full chain but nothing is sent to {notificationName}.
                  </p>
                )}
              </div>

              {/* Webhook URL */}
              <div className="bg-white border rounded-lg p-5 space-y-3">
                <h3 className="font-medium text-gray-900">Webhook URL</h3>
                {webhookUrl ? (
                  <>
                    <div className="flex gap-2 items-center">
                      <code className="flex-1 bg-gray-50 border rounded px-3 py-2 text-xs break-all">
                        {webhookUrl}
                      </code>
                      <button onClick={handleCopyWebhook} className="p-2 text-gray-500 hover:text-gray-800">
                        {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p className="font-medium">Shopify webhook setup:</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-gray-400">
                        <li>Shopify Admin → Settings → Notifications → Webhooks</li>
                        <li>Create webhook → Event: <strong>Orders: Created</strong></li>
                        <li>Format: <strong>JSON</strong> → URL: paste the URL above</li>
                        <li>Save</li>
                      </ol>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">
                    Webhook URL will be generated when you activate the skill.
                  </p>
                )}
              </div>

              {/* Activate */}
              <div className="flex justify-between items-center">
                <button
                  onClick={() => setActivePanel('customize')}
                  className="px-4 py-2 text-sm border rounded text-gray-600 hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleActivate}
                  disabled={activating || !allSlotsConnected}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                >
                  <Zap size={14} />
                  {activating ? 'Activating…' : 'Activate Skill'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
