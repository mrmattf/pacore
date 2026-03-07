import { useState } from 'react';
import { RefreshCw, Zap, Building2, Users, CreditCard, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useBilling, PlanTier, LimitSummaryItem } from '../hooks/useBilling';
import { useSkillExecutions, SkillExecution, ExecutionStep } from '../hooks/useSkillExecutions';

// ─── Plan badge colours ──────────────────────────────────────────────────────
const PLAN_COLORS: Record<PlanTier, string> = {
  free:       'bg-gray-100 text-gray-700',
  starter:    'bg-blue-100 text-blue-700',
  growth:     'bg-purple-100 text-purple-700',
  business:   'bg-indigo-100 text-indigo-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

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

// ─── Plan comparison table ───────────────────────────────────────────────────
function fmtPrice(p: number | null) {
  if (p === null) return 'Custom';
  if (p === 0) return 'Free';
  return `$${p}/mo`;
}

// ─── Step timeline row ───────────────────────────────────────────────────────
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

// ─── Activity feed ───────────────────────────────────────────────────────────
function ActivityFeed() {
  const { executions, loading, error, refresh } = useSkillExecutions(20);
  const [expanded, setExpanded] = useState<string | null>(null);

  function skillLabel(ex: SkillExecution) {
    if (!ex.skillTypeId) return `Skill …${ex.userSkillId.slice(-8)}`;
    return ex.skillTypeId.split('-').map((w: string) => w[0].toUpperCase() + w.slice(1)).join(' ');
  }

  function duration(ex: SkillExecution) {
    if (!ex.completedAt) return null;
    const ms = new Date(ex.completedAt).getTime() - new Date(ex.startedAt).getTime();
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(iso).toLocaleDateString();
  }

  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recent Activity</h2>
        <button onClick={refresh} className="text-xs text-gray-400 hover:text-gray-600">Refresh</button>
      </div>
      {loading && <p className="text-sm text-gray-400">Loading...</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!loading && executions.length === 0 && <p className="text-sm text-gray-400">No executions yet.</p>}
      <div className="divide-y divide-gray-50">
        {executions.map((ex) => (
          <div key={ex.id}>
            <button
              className="w-full text-left py-2.5 flex items-center gap-3 hover:bg-gray-50 rounded px-1 -mx-1"
              onClick={() => setExpanded(expanded === ex.id ? null : ex.id)}
            >
              {ex.status === 'completed' && <CheckCircle size={14} className="text-green-500 shrink-0" />}
              {ex.status === 'failed'    && <XCircle    size={14} className="text-red-500 shrink-0" />}
              {ex.status === 'running'   && <Clock      size={14} className="text-yellow-500 shrink-0 animate-pulse" />}
              {ex.sandbox && (
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium shrink-0">Sandbox</span>
              )}
              <span className="flex-1 text-sm text-gray-800 font-medium">{skillLabel(ex)}</span>
              <span className="text-xs text-gray-400 tabular-nums">{duration(ex) ?? '—'}</span>
              <span className="text-xs text-gray-400 w-20 text-right tabular-nums">{relativeTime(ex.startedAt)}</span>
              {expanded === ex.id
                ? <ChevronDown  size={12} className="text-gray-400 shrink-0" />
                : <ChevronRight size={12} className="text-gray-400 shrink-0" />}
            </button>
            {expanded === ex.id && (() => {
              const steps = (ex.result as Record<string, unknown> | null)?.steps as ExecutionStep[] | undefined;
              return (
                <div className="mx-1 mb-2 border-l-2 border-gray-100 ml-5 pl-3 py-1 space-y-0.5">
                  {steps && steps.length > 0 ? (
                    steps.map((step, i) => <StepRow key={i} step={step} />)
                  ) : (
                    <>
                      {ex.error && (
                        <div className="text-xs text-red-600 py-1">
                          <span className="font-semibold">Error: </span>{ex.error}
                        </div>
                      )}
                      {!ex.error && (
                        <div className="text-xs text-gray-400 py-1">No step detail available</div>
                      )}
                    </>
                  )}
                  {ex.payload != null && (
                    <details className="mt-1">
                      <summary className="text-xs cursor-pointer text-gray-400 hover:text-gray-600 pl-5">Payload</summary>
                      <pre className="mt-1 ml-5 p-2 bg-white border rounded text-xs text-gray-600 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                        {JSON.stringify(ex.payload, null, 2)}
                      </pre>
                    </details>
                  )}
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
  const { billing, plans, loading, error, refresh } = useBilling(orgId);

  const currentPlan: PlanTier = billing?.plan ?? 'free';
  const sub = billing?.subscription;
  const summary = billing?.summary;

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
          {/* ── Current Plan Card ── */}
          <div className="bg-white border rounded-lg p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-gray-500" />
                  <span className="text-sm text-gray-500 font-medium uppercase tracking-wide">
                    Current plan
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${PLAN_COLORS[currentPlan]}`}
                  >
                    {currentPlan}
                  </span>
                  {sub && (
                    <span className="text-sm text-gray-500">
                      Status: {sub.status}
                    </span>
                  )}
                  {sub?.currentPeriodEnd && (
                    <span className="text-sm text-gray-500">
                      Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <button
                disabled
                title="Payments coming soon"
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded opacity-50 cursor-not-allowed"
              >
                Upgrade
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Payments coming soon — plan changes are available via the admin API in the meantime.
            </p>
          </div>

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

          {/* ── Recent Activity ── */}
          <ActivityFeed />

          {/* ── Plan Comparison Table ── */}
          {plans.length > 0 && (
            <div className="bg-white border rounded-lg p-6 overflow-x-auto">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
                Plan comparison
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium w-40"></th>
                    {plans.map((p) => (
                      <th key={p.tier} className="text-center py-2 px-3 font-semibold">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs capitalize ${PLAN_COLORS[p.tier]}`}
                        >
                          {p.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-2.5 pr-4 text-gray-600">Price</td>
                    {plans.map((p) => (
                      <td key={p.tier} className="text-center py-2.5 px-3 text-gray-900 font-medium">
                        {fmtPrice(p.priceMonthly)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-gray-600">Executions/mo</td>
                    {plans.map((p) => {
                      // These come from plan definitions on the server; we can infer from features
                      const feat = p.features.find((f) => f.includes('execution'));
                      return (
                        <td key={p.tier} className="text-center py-2.5 px-3 text-gray-700">
                          {feat?.split(' ')[0] ?? '—'}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-gray-600">Active Skills</td>
                    {plans.map((p) => {
                      const feat = p.features.find((f) => f.includes('skill'));
                      return (
                        <td key={p.tier} className="text-center py-2.5 px-3 text-gray-700">
                          {feat?.split(' ')[0] ?? '—'}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-gray-600">Organizations</td>
                    {plans.map((p) => {
                      const feat = p.features.find((f) => f.includes('organization') || f.includes('personal only'));
                      return (
                        <td key={p.tier} className="text-center py-2.5 px-3 text-gray-700">
                          {feat?.includes('personal') ? '—' : feat?.split(' ')[0] ?? '—'}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-gray-600"></td>
                    {plans.map((p) => (
                      <td key={p.tier} className="text-center py-2.5 px-3">
                        <button
                          disabled
                          title="Payments coming soon"
                          className={`px-3 py-1 rounded text-xs font-medium cursor-not-allowed ${
                            p.tier === currentPlan
                              ? 'bg-blue-600 text-white opacity-80'
                              : 'bg-gray-100 text-gray-500 opacity-60'
                          }`}
                        >
                          {p.tier === currentPlan ? 'Current' : 'Select'}
                        </button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
