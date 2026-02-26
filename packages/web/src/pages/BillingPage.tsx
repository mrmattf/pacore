import { RefreshCw, Zap, Building2, Users, CreditCard } from 'lucide-react';
import { useBilling, PlanTier, LimitSummaryItem } from '../hooks/useBilling';

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
