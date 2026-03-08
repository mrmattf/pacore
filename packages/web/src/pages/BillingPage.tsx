import { useState, useEffect } from 'react';
import { RefreshCw, Zap, Building2, Users, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, Minus, Pause, Play } from 'lucide-react';
import { useBilling, PlanTier, LimitSummaryItem } from '../hooks/useBilling';
import { SkillExecution, ExecutionStep } from '../hooks/useSkillExecutions';
import { apiFetch } from '../services/auth';
import { useUserSkills, UserSkill } from '../hooks/useUserSkills';

// ─── Usage bar ───────────────────────────────────────────────────────────────
function UsageBar({
  label,
  icon: Icon,
  item,
}: {
  label: string;
  icon: React.ElementType;
  item: LimitSummaryItem;
}) {
  const isUnlimited = item.limit === -1;
  const pct = isUnlimited ? 0 : Math.min(item.percentUsed, 100);
  const barColor =
    pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-blue-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 text-gray-700 font-medium">
          <Icon size={14} />
          {label}
        </div>
        <span className="text-gray-500 tabular-nums">
          {item.current.toLocaleString()}
          {isUnlimited ? ' / ∞' : ` / ${item.limit.toLocaleString()}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Step timeline ───────────────────────────────────────────────────────────
const STEP_ICONS: Record<ExecutionStep['status'], string> = {
  ok:      '✓',
  skipped: '—',
  sandbox: '◎',
  error:   '✕',
};
const STEP_COLORS: Record<ExecutionStep['status'], string> = {
  ok:      'text-green-600',
  skipped: 'text-gray-400',
  sandbox: 'text-amber-500',
  error:   'text-red-500',
};

function HtmlPreview({ html }: { html: string }) {
  return (
    <div
      className="p-3 bg-white border rounded text-xs overflow-auto max-h-64 prose prose-xs max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
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
        {step.duration_ms != null && (
          <span className="text-gray-300 tabular-nums shrink-0">{step.duration_ms}ms</span>
        )}
      </button>
      {open && step.detail != null && (
        <div className="mt-1 ml-5">
          <StepDetail detail={step.detail} />
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Maps the platform plan tier to a skill-level tier key. */
function activeTierKey(plan: PlanTier): string | null {
  if (plan === 'free') return null;
  if (plan === 'enterprise') return 'business';
  return plan; // 'starter' | 'growth' | 'business'
}

// ─── Skill metadata + pricing ────────────────────────────────────────────────
const SKILL_META: Record<string, {
  name: string;
  description: string;
  tiers: Array<{ key: string; label: string; price: number; runs: number }>;
}> = {
  'backorder-notification': {
    name: 'Backorder Notification',
    description: 'Notifies customers when their ordered items are backordered.',
    tiers: [
      { key: 'starter',  label: 'Starter',  price: 49,  runs: 50    },
      { key: 'growth',   label: 'Growth',   price: 99,  runs: 250   },
      { key: 'business', label: 'Business', price: 199, runs: 1_000 },
    ],
  },
  'delivery-exception-alert': {
    name: 'Delivery Exception Alert',
    description: 'Alerts customers when their shipment encounters a delivery exception.',
    tiers: [
      { key: 'starter',  label: 'Starter',  price: 39,  runs: 50    },
      { key: 'growth',   label: 'Growth',   price: 79,  runs: 250   },
      { key: 'business', label: 'Business', price: 159, runs: 1_000 },
    ],
  },
  'low-stock-impact': {
    name: 'Low Stock Customer Impact',
    description: 'Proactively notifies customers when their ordered item runs low.',
    tiers: [
      { key: 'starter',  label: 'Starter',  price: 39,  runs: 50    },
      { key: 'growth',   label: 'Growth',   price: 79,  runs: 250   },
      { key: 'business', label: 'Business', price: 159, runs: 1_000 },
    ],
  },
  'high-risk-order-response': {
    name: 'High Risk Order Response',
    description: 'Automatically flags and responds to potentially fraudulent orders.',
    tiers: [
      { key: 'starter',  label: 'Starter',  price: 99,  runs: 50    },
      { key: 'growth',   label: 'Growth',   price: 349, runs: 250   },
      { key: 'business', label: 'Business', price: 999, runs: 1_000 },
    ],
  },
};

// ─── SkillCard ───────────────────────────────────────────────────────────────
function SkillCard({ userSkill, currentPlan }: { userSkill: UserSkill; currentPlan: PlanTier }) {
  const meta = SKILL_META[userSkill.skillId];
  const [executions, setExecutions] = useState<SkillExecution[]>([]);
  const [execLoading, setExecLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [status, setStatus] = useState(userSkill.status);
  const [toggling, setToggling] = useState(false);

  const tierKey = activeTierKey(currentPlan);
  const activeTier = meta?.tiers.find(t => t.key === tierKey);

  async function togglePause() {
    setToggling(true);
    try {
      const action = status === 'active' ? 'pause' : 'resume';
      await apiFetch(`/v1/me/skills/${userSkill.id}/${action}`, { method: 'PUT' });
      setStatus(status === 'active' ? 'paused' : 'active');
    } catch {
      // ignore — button reverts to previous state
    } finally {
      setToggling(false);
    }
  }

  useEffect(() => {
    apiFetch(`/v1/me/skills/${userSkill.id}/executions?limit=5`)
      .then(r => r.json())
      .then(setExecutions)
      .catch(() => {})
      .finally(() => setExecLoading(false));
  }, [userSkill.id]);

  if (!meta) return null;

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {/* ── Header ── */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{meta.name}</h3>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : status === 'paused'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-500'
              }`}>
                {status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            <button
              onClick={togglePause}
              disabled={toggling || status === 'pending'}
              title={status === 'active' ? 'Pause skill' : 'Resume skill'}
              className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'active'
                ? <Pause size={14} />
                : <Play size={14} />}
            </button>
            <div className="text-right">
              {currentPlan === 'free'
                ? <span className="text-sm font-semibold text-amber-600">Sandbox</span>
                : activeTier
                  ? <span className={`text-sm font-semibold ${status === 'paused' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>${activeTier.price}/mo</span>
                  : null}
            </div>
          </div>
        </div>

        {/* Tier selector */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {meta.tiers.map(tier => {
            const isCurrent = tier.key === tierKey;
            const tierIdx = meta.tiers.findIndex(t => t.key === tier.key);
            const currentIdx = tierKey ? meta.tiers.findIndex(t => t.key === tierKey) : -1;
            const isUpgrade = tierIdx > currentIdx;
            return (
              <div
                key={tier.key}
                className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1 ${
                  isCurrent
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="font-semibold text-gray-800">{tier.label}</div>
                <div className="text-gray-500">${tier.price}/mo</div>
                <div className="text-gray-400">{tier.runs.toLocaleString()} executions/mo</div>
                <div className="mt-1">
                  {isCurrent ? (
                    <span className="text-xs font-medium text-blue-600">Current</span>
                  ) : (
                    <button
                      disabled
                      title="Payments coming soon"
                      className={`text-xs font-medium cursor-not-allowed ${
                        isUpgrade ? 'text-blue-400' : 'text-gray-400'
                      }`}
                    >
                      {currentPlan === 'free' ? 'Subscribe' : isUpgrade ? 'Upgrade ↑' : 'Downgrade'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-2">Payments coming soon</p>
      </div>

      {/* ── Recent Executions ── */}
      <div className="border-t bg-gray-50 px-5 py-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Recent Executions
        </h4>
        {execLoading && <div className="text-xs text-gray-400 py-2">Loading…</div>}
        {!execLoading && executions.length === 0 && (
          <div className="text-xs text-gray-400 py-2">No executions yet</div>
        )}
        {executions.map(ex => (
          <div key={ex.id} className="border-b border-gray-100 last:border-0">
            <button
              className="w-full text-left py-2 flex items-center gap-2 hover:bg-gray-100 rounded px-1 -mx-1"
              onClick={() => setExpanded(expanded === ex.id ? null : ex.id)}
            >
              {ex.status === 'completed' && !ex.skipped && (
                <CheckCircle size={12} className="text-green-500 shrink-0" />
              )}
              {ex.status === 'completed' && ex.skipped && (
                <Minus size={12} className="text-gray-400 shrink-0" />
              )}
              {ex.status === 'failed' && (
                <XCircle size={12} className="text-red-500 shrink-0" />
              )}
              {ex.status === 'running' && (
                <Clock size={12} className="text-yellow-500 shrink-0 animate-pulse" />
              )}
              {ex.sandbox && (
                <span className="text-xs bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-medium">
                  Sandbox
                </span>
              )}
              {!ex.sandbox && ex.skipped && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1 py-0.5 rounded font-medium">
                  Skipped
                </span>
              )}
              <span className="flex-1 text-xs text-gray-600">{relativeTime(ex.startedAt)}</span>
              {expanded === ex.id
                ? <ChevronDown  size={10} className="text-gray-400" />
                : <ChevronRight size={10} className="text-gray-400" />}
            </button>

            {expanded === ex.id && (() => {
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
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
interface BillingPageProps {
  orgId?: string;
}

export function BillingPage({ orgId }: BillingPageProps) {
  const { billing, loading, error, refresh } = useBilling(orgId);
  const { userSkills } = useUserSkills();

  const currentPlan: PlanTier = billing?.plan ?? 'free';
  const summary = billing?.summary;

  // Total estimated monthly cost for active (non-paused) skills at current tier
  const tierKey = activeTierKey(currentPlan);
  const totalMonthly = userSkills.reduce((sum, s) => {
    if (s.status !== 'active') return sum;
    const tier = SKILL_META[s.skillId]?.tiers.find(t => t.key === tierKey);
    return sum + (tier?.price ?? 0);
  }, 0);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Billing</h1>
            <p className="text-sm text-gray-600 mt-1">
              {orgId ? 'Organization plan & usage' : 'Your plan & usage'}
            </p>
          </div>
          <button
            onClick={() => refresh()}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="max-w-3xl mx-auto space-y-6">
          {/* ── Usage This Month ── */}
          {summary && (
            <div className="bg-white border rounded-lg p-6">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
                Usage this month
              </h2>
              <div className="space-y-4">
                <UsageBar
                  label="Skill Executions"
                  icon={Zap}
                  item={summary.skillExecutionsPerMonth}
                />
                <UsageBar
                  label="Active Skills"
                  icon={Zap}
                  item={summary.activeSkills}
                />
                {!orgId && (
                  <UsageBar
                    label="Organizations"
                    icon={Building2}
                    item={summary.orgs}
                  />
                )}
                {orgId && (
                  <UsageBar
                    label="Org Members"
                    icon={Users}
                    item={summary.orgMembers}
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Your Skills ── */}
          {userSkills.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Your Skills
              </h2>
              {userSkills.map(us => (
                <SkillCard key={us.id} userSkill={us} currentPlan={currentPlan} />
              ))}
            </div>
          )}

          {/* ── Total this month ── */}
          {currentPlan !== 'free' && totalMonthly > 0 && (
            <div className="bg-white border rounded-lg px-5 py-3 flex justify-between items-center">
              <span className="text-sm text-gray-600">Estimated monthly total</span>
              <span className="text-sm font-semibold text-gray-900">${totalMonthly}/mo</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
