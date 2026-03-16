import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ChevronRight, ChevronDown, RefreshCw, Settings, CheckCircle, Clock, Trash2, Pause, Play, Package, Truck, BarChart2, ShieldAlert, X, XCircle, Minus, Bug, type LucideIcon } from 'lucide-react';

const SKILL_ICONS: Record<string, LucideIcon> = {
  Package, Truck, BarChart2, ShieldAlert, Zap,
};
import { apiFetch } from '../services/auth';
import { UserSkill } from '../hooks/useSkills';
import { SkillExecution, ExecutionStep } from '../hooks/useSkillExecutions';
import { useContextStore, skillsBasePath } from '../store/contextStore';
import { ContextSwitcher } from '../components/ContextSwitcher';
import { OrgPanel } from '../components/OrgPanel';
import { AppNav } from '../components/AppNav';

interface SkillTypeCard {
  id: string;
  name: string;
  description: string;
  category: string;
  templateCount: number;
  templateNames: string[];
  iconKey?: string;
}

interface TemplateMeta { name: string; skillTypeId: string; }

// ─── Step timeline helpers ────────────────────────────────────────────────────
const STEP_ICONS: Record<ExecutionStep['status'], string> = {
  ok: '✓', skipped: '—', sandbox: '◎', error: '✕',
};
const STEP_COLORS: Record<ExecutionStep['status'], string> = {
  ok: 'text-green-600', skipped: 'text-gray-400', sandbox: 'text-amber-500', error: 'text-red-500',
};

function HtmlPreview({ html }: { html: string }) {
  return (
    <iframe
      srcDoc={html}
      sandbox=""
      className="w-full border rounded bg-white"
      style={{ height: '200px' }}
      title="Message preview"
    />
  );
}

function StepDetail({ detail }: { detail: unknown }) {
  const d = detail as Record<string, unknown>;
  const topHtml = typeof d.messageHtml === 'string' ? d.messageHtml : null;
  const previews = Array.isArray(d.previews) ? d.previews as Record<string, unknown>[] : null;
  const rest = Object.fromEntries(
    Object.entries(d).filter(([k]) => k !== 'messageHtml' && k !== 'previews')
  );
  return (
    <div className="space-y-2">
      {Object.keys(rest).length > 0 && (
        <pre className="p-2 bg-white border rounded text-xs text-gray-600 whitespace-pre-wrap break-all">
          {JSON.stringify(rest, null, 2)}
        </pre>
      )}
      {topHtml && <HtmlPreview html={topHtml} />}
      {previews && previews.map((p, i) => (
        <div key={i} className="space-y-1">
          {(p.subject != null || p.orderNumber != null) && (
            <div className="text-xs text-gray-500 font-medium">
              {p.orderNumber != null && <span>Order #{String(p.orderNumber)} — </span>}
              {p.subject != null && <span>{String(p.subject)}</span>}
            </div>
          )}
          {typeof p.messageHtml === 'string' && <HtmlPreview html={p.messageHtml} />}
        </div>
      ))}
    </div>
  );
}

function StepRow({ step }: { step: ExecutionStep }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs py-0.5">
      <button
        className="flex items-start gap-2 w-full text-left hover:bg-gray-50 rounded px-1"
        onClick={() => step.detail != null && setOpen(!open)}
      >
        <span className={`font-mono font-bold w-3 shrink-0 mt-px ${STEP_COLORS[step.status]}`}>
          {STEP_ICONS[step.status]}
        </span>
        <span className="text-gray-500 w-28 shrink-0">{step.name}</span>
        <span className="text-gray-700 flex-1">{step.summary}</span>
      </button>
      {open && step.detail != null && (
        <div className="mt-1 ml-5">
          <StepDetail detail={step.detail} />
        </div>
      )}
    </div>
  );
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Skill row with execution history ────────────────────────────────────────
interface SkillRowItemProps {
  skill: UserSkill;
  templateName: string;
  canConfigure: boolean;
  canEdit: boolean;
  basePath: string;
  onConfigure: () => void;
  onRemove: () => void;
}

function SkillRowItem({ skill, templateName, canConfigure, canEdit, basePath, onConfigure, onRemove }: SkillRowItemProps) {
  const [status, setStatus] = useState(skill.status);
  const [testMode, setTestMode] = useState(Boolean((skill.configuration as any)?.testMode));
  const [executions, setExecutions] = useState<SkillExecution[]>([]);
  const [execLoading, setExecLoading] = useState(false);
  const [expandedExec, setExpandedExec] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [debugToggling, setDebugToggling] = useState(false);

  const isPaused = status === 'paused';
  const isPending = status === 'pending';

  useEffect(() => {
    setExecLoading(true);
    apiFetch(`${basePath}/${skill.id}/executions?limit=3`)
      .then(r => r.json())
      .then(setExecutions)
      .catch(() => {})
      .finally(() => setExecLoading(false));
  }, [skill.id, basePath]);

  async function handleTogglePause() {
    if (toggling) return;
    setToggling(true);
    const action = status === 'active' ? 'pause' : 'resume';
    try {
      await apiFetch(`${basePath}/${skill.id}/${action}`, { method: 'PUT' });
      setStatus(action === 'pause' ? 'paused' : 'active');
    } catch { /* revert on error — local state stays */ }
    finally { setToggling(false); }
  }

  async function handleToggleDebug() {
    if (debugToggling) return;
    setDebugToggling(true);
    const newTestMode = !testMode;
    try {
      await apiFetch(`${basePath}/${skill.id}/configure`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(skill.configuration as any), testMode: newTestMode }),
      });
      setTestMode(newTestMode);
    } catch { /* revert — toggle stays at old value */ }
    finally { setDebugToggling(false); }
  }

  const showHistory = execLoading || executions.length > 0;

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {/* ── Main row ── */}
      <div className="px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {status === 'active'
            ? <CheckCircle size={15} className="text-green-500 flex-shrink-0" />
            : isPaused
              ? <Pause size={15} className="text-amber-500 flex-shrink-0" />
              : <Clock size={15} className="text-amber-400 flex-shrink-0" />
          }
          <span className={`text-sm font-medium truncate ${isPaused ? 'text-gray-400' : 'text-gray-900'}`}>
            {templateName}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
            status === 'active'
              ? 'bg-green-50 text-green-700'
              : isPaused
                ? 'bg-amber-50 text-amber-700'
                : 'bg-gray-100 text-gray-500'
          }`}>
            {status === 'active' ? 'active' : isPaused ? 'paused' : 'incomplete'}
          </span>
          {/* Debug mode badge */}
          {testMode && (
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium">
              Debug
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canEdit && (
            <>
              <button
                onClick={onConfigure}
                disabled={!canConfigure}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Settings size={12} /> Configure
              </button>
              {!isPending && (
                <>
                  <button
                    onClick={handleToggleDebug}
                    disabled={debugToggling}
                    title={testMode ? 'Disable debug mode (go live)' : 'Enable debug mode (preview without sending)'}
                    className={`p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      testMode
                        ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
                        : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Bug size={14} />
                  </button>
                  <button
                    onClick={handleTogglePause}
                    disabled={toggling}
                    title={isPaused ? 'Resume skill' : 'Pause skill'}
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors disabled:opacity-40"
                  >
                    {isPaused ? <Play size={14} /> : <Pause size={14} />}
                  </button>
                </>
              )}
              <button
                onClick={onRemove}
                className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
                title="Remove skill"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Execution history panel ── */}
      {showHistory && (
        <div className="border-t bg-gray-50 px-5 py-2">
          {execLoading && <div className="text-xs text-gray-400 py-1">Loading…</div>}
          {!execLoading && executions.map(ex => (
            <div key={ex.id} className="border-b border-gray-100 last:border-0">
              <button
                className="w-full text-left py-1.5 flex items-center gap-2 hover:bg-gray-100 rounded px-1 -mx-1"
                onClick={() => setExpandedExec(expandedExec === ex.id ? null : ex.id)}
              >
                {ex.status === 'completed' && !ex.skipped && (
                  <CheckCircle size={11} className="text-green-500 shrink-0" />
                )}
                {ex.status === 'completed' && ex.skipped && (
                  <Minus size={11} className="text-gray-400 shrink-0" />
                )}
                {ex.status === 'failed' && (
                  <XCircle size={11} className="text-red-500 shrink-0" />
                )}
                {ex.status === 'running' && (
                  <Clock size={11} className="text-yellow-500 shrink-0 animate-pulse" />
                )}
                {ex.sandbox && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-medium">
                    Debug
                  </span>
                )}
                {!ex.sandbox && ex.skipped && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-1 py-0.5 rounded font-medium">
                    Skipped
                  </span>
                )}
                <span className="flex-1 text-xs text-gray-500">{relativeTime(ex.startedAt)}</span>
                {ex.error && (
                  <span className="text-xs text-red-500 truncate max-w-xs">{ex.error}</span>
                )}
                {expandedExec === ex.id
                  ? <ChevronDown size={10} className="text-gray-400 shrink-0" />
                  : <ChevronRight size={10} className="text-gray-400 shrink-0" />
                }
              </button>
              {expandedExec === ex.id && (() => {
                const steps = (ex.result as Record<string, unknown> | null)?.steps as ExecutionStep[] | undefined;
                return (
                  <div className="ml-4 mb-2 border-l-2 border-gray-200 pl-3 space-y-0.5">
                    {steps && steps.length > 0
                      ? steps.map((step, i) => <StepRow key={i} step={step} />)
                      : ex.error
                        ? <div className="text-xs text-red-600 py-1">{ex.error}</div>
                        : <div className="text-xs text-gray-400 py-1">No step detail</div>
                    }
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function SkillsPage() {
  const navigate = useNavigate();
  const { context } = useContextStore();

  const [skillTypes, setSkillTypes] = useState<SkillTypeCard[]>([]);
  const [mySkills, setMySkills] = useState<UserSkill[]>([]);
  const [templateMap, setTemplateMap] = useState<Record<string, TemplateMeta>>({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [orgPanelOpen, setOrgPanelOpen] = useState(false);

  const [operatorContact, setOperatorContact] = useState<{ operatorName: string; operatorEmail: string; managementMode: string; handoffNotes: string | null } | null>(null);
  const [handoffDismissed, setHandoffDismissed] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const base = skillsBasePath(context);
      const [typesRes, myRes] = await Promise.all([
        apiFetch('/v1/skill-types'),
        apiFetch(base),
      ]);

      if (myRes.status === 403) {
        window.location.href = '/login';
        return;
      }

      const types: SkillTypeCard[] = typesRes.ok ? await typesRes.json() : [];
      if (typesRes.ok) setSkillTypes(types);
      if (myRes.ok)   setMySkills(await myRes.json());

      const map: Record<string, TemplateMeta> = {};
      await Promise.all(types.map(async (type) => {
        try {
          const res = await apiFetch(`/v1/skill-types/${type.id}/templates`);
          if (res.ok) {
            const templates: Array<{ id: string; name: string; skillTypeId: string }> = await res.json();
            for (const t of templates) map[t.id] = { name: t.name, skillTypeId: t.skillTypeId };
          }
        } catch { /* non-fatal */ }
      }));
      setTemplateMap(map);

      try {
        const contactRes = await apiFetch(`/v1/organizations/${context.orgId}/operator-contact`);
        if (contactRes.ok) {
          const contact = await contactRes.json();
          setOperatorContact(contact);
          const dismissKey = `handoff-dismissed-${context.orgId}`;
          setHandoffDismissed(!!localStorage.getItem(dismissKey));
        } else {
          setOperatorContact(null);
        }
      } catch {
        setOperatorContact(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [context]);

  const categories = ['All', ...Array.from(new Set(skillTypes.map(t => t.category)))];

  const visibleTypes = activeCategory === 'All'
    ? skillTypes
    : skillTypes.filter(t => t.category === activeCategory);

  const groupedByCategory = visibleTypes.reduce<Record<string, SkillTypeCard[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  const myConfiguredSkills = mySkills.filter(s => s.status === 'active' || s.status === 'paused' || s.status === 'pending');

  async function handleRemoveSkill(skillId: string) {
    try {
      const base = skillsBasePath(context);
      await apiFetch(`${base}/${skillId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      console.error('Failed to remove skill', e);
    }
  }

  function handleConfigure(skill: UserSkill) {
    const cfg = skill.configuration as any;
    const templateId = cfg?.templateId ?? '';
    const typeId = cfg?.skillTypeId ?? templateMap[templateId]?.skillTypeId ?? '';
    if (!typeId || !templateId) return;
    navigate(`/skills/${typeId}/templates/${templateId}/configure/${skill.id}`);
  }

  function resolveTemplateName(skill: UserSkill): string {
    const cfg = skill.configuration as any;
    if (cfg?.templateName) return cfg.templateName;
    const templateId = cfg?.templateId ?? '';
    return templateMap[templateId]?.name ?? templateId ?? 'Skill';
  }

  const isOrgAdmin = context.role === 'admin';

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <AppNav>
        <ContextSwitcher onManageOrg={() => setOrgPanelOpen(true)} />
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1.5 disabled:opacity-50 text-sm"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </AppNav>

      {/* Handoff banner */}
      {operatorContact?.managementMode === 'self_managed' && operatorContact.handoffNotes && !handoffDismissed && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start justify-between gap-4">
          <div className="text-sm text-amber-800">
            <span className="font-semibold">Your account is now self-managed.</span>{' '}
            {operatorContact.handoffNotes}
          </div>
          <button
            onClick={() => {
              if (context.type === 'org') {
                localStorage.setItem(`handoff-dismissed-${context.orgId}`, '1');
              }
              setHandoffDismissed(true);
            }}
            className="shrink-0 text-amber-500 hover:text-amber-700"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Concierge mode badge */}
      {operatorContact?.managementMode === 'concierge' && (
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-2 flex items-center gap-2 text-sm text-blue-700">
          <span className="font-medium">Managed by Clarissi</span>
          <span className="text-blue-400">·</span>
          <span>Skills are configured and managed by {operatorContact.operatorName}.</span>
          <a href={`mailto:${operatorContact.operatorEmail}`} className="text-blue-600 hover:underline ml-1">
            {operatorContact.operatorEmail}
          </a>
        </div>
      )}

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-8">

          {/* My skills */}
          {myConfiguredSkills.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {context.orgName} Skills
              </h2>
              <div className="space-y-2">
                {myConfiguredSkills.map(skill => {
                  const cfg = skill.configuration as any;
                  const templateName = resolveTemplateName(skill);
                  const templateId = cfg?.templateId ?? '';
                  const typeId = cfg?.skillTypeId ?? templateMap[templateId]?.skillTypeId ?? '';
                  const canConfigure = Boolean(typeId && templateId);
                  return (
                    <SkillRowItem
                      key={skill.id}
                      skill={skill}
                      templateName={templateName}
                      canConfigure={canConfigure}
                      canEdit={isOrgAdmin}
                      basePath={skillsBasePath(context)}
                      onConfigure={() => handleConfigure(skill)}
                      onRemove={() => handleRemoveSkill(skill.id)}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* Category filter */}
          {categories.length > 2 && (
            <div className="flex gap-2 flex-wrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    activeCategory === cat
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Skill type catalog */}
          {loading && skillTypes.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              Loading…
            </div>
          ) : visibleTypes.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Zap size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">No skills in this category</p>
              <p className="text-sm mt-1">Try selecting a different category, or contact your operator to activate a skill.</p>
            </div>
          ) : (
            Object.entries(groupedByCategory).map(([category, types]) => (
              <section key={category}>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  {category}
                </h2>
                <div className="space-y-3">
                  {types.map(skillType => (
                    <div
                      key={skillType.id}
                      className="bg-white border rounded-lg p-5 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex gap-3 min-w-0">
                          <div className="flex-shrink-0 w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                            {(() => { const Icon = SKILL_ICONS[skillType.iconKey ?? ''] ?? Zap; return <Icon size={20} />; })()}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-gray-900">{skillType.name}</h3>
                            <p className="text-sm text-gray-500 mt-0.5">{skillType.description}</p>
                            {skillType.templateNames.length > 0 && (
                              <p className="text-xs text-gray-400 mt-1.5">
                                Templates:{' '}
                                {skillType.templateNames.join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => navigate(`/skills/${skillType.id}/templates`)}
                          className="flex-shrink-0 flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap"
                        >
                          Set Up
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </main>

      {orgPanelOpen && (
        <OrgPanel
          orgId={context.orgId}
          onClose={() => setOrgPanelOpen(false)}
        />
      )}
    </div>
  );
}
