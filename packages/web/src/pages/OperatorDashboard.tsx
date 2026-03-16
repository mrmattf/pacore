import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Copy, Check, Loader2, Clock, AlertCircle } from 'lucide-react';
import { useOperatorCustomers, createCustomer, generateIntakeToken, OperatorCustomer } from '../hooks/useOperator';
import { AppNav } from '../components/AppNav';

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function IntakeTokenModal({ orgId, orgName, onClose }: { orgId: string; orgName: string; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ url: string; emailTemplate: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'url' | 'email' | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const data = await generateIntakeToken(orgId);
      setResult({ url: data.url, emailTemplate: data.emailTemplate });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function copy(type: 'url' | 'email') {
    const text = type === 'url' ? result!.url : result!.emailTemplate;
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Generate Intake URL</h2>
          <p className="text-sm text-gray-500 mt-1">For: {orgName}</p>
        </div>

        <div className="p-6 space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-gray-600">
                Generate a one-time secure link for your customer to submit their Shopify and Gorgias credentials.
                The link expires in 7 days.
              </p>
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}
              <button
                onClick={generate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {loading ? 'Generating…' : 'Generate Link'}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Intake URL
                </label>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                  <code className="flex-1 text-xs text-gray-700 truncate">{result.url}</code>
                  <button
                    onClick={() => copy('url')}
                    className="shrink-0 text-gray-400 hover:text-gray-700"
                    title="Copy URL"
                  >
                    {copied === 'url' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Email draft
                </label>
                <pre className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-3 whitespace-pre-wrap font-sans">
                  {result.emailTemplate}
                </pre>
                <button
                  onClick={() => copy('email')}
                  className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  {copied === 'email' ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                  {copied === 'email' ? 'Copied!' : 'Copy email draft'}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function AddCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [orgName, setOrgName] = useState('');
  const [mode, setMode] = useState<'concierge' | 'self_managed'>('concierge');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await createCustomer(orgName.trim(), mode);
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Add Customer</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Organization name</label>
            <input
              autoFocus
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Shopify Store"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Management mode</label>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${mode === 'concierge' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="mode" value="concierge" checked={mode === 'concierge'} onChange={() => setMode('concierge')} className="sr-only" />
                <span className="text-sm font-medium text-gray-700">Concierge</span>
              </label>
              <label className={`flex-1 flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${mode === 'self_managed' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="mode" value="self_managed" checked={mode === 'self_managed'} onChange={() => setMode('self_managed')} className="sr-only" />
                <span className="text-sm font-medium text-gray-700">Self-managed</span>
              </label>
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !orgName.trim()}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              {loading ? 'Creating…' : 'Create customer'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function OperatorDashboard() {
  const { customers, loading, error, refresh } = useOperatorCustomers();
  const [showAddModal, setShowAddModal] = useState(false);
  const [intakeTarget, setIntakeTarget] = useState<OperatorCustomer | null>(null);

  const pendingCount = customers.filter(c => c.pending_credentials > 0).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus size={14} />
          Add Customer
        </button>
      </AppNav>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            Operator Dashboard
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                <Clock size={11} />
                {pendingCount} pending
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage your Clarissi customers</p>
        </div>

        {/* Customer table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading customers…
          </div>
        ) : error ? (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
        ) : customers.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="mb-4">No customers yet.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-blue-600 text-sm hover:underline"
            >
              Add your first customer →
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Mode</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Onboarded</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Last execution</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">This month</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.name}</div>
                      {c.pending_credentials > 0 && !c.onboarded_at && (
                        <div className="flex items-center gap-1 text-xs text-amber-600 mt-0.5">
                          <Clock size={11} />
                          Credentials received — ready to onboard
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.management_mode === 'concierge'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {c.management_mode === 'concierge' ? 'Concierge' : 'Self-managed'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.onboarded_at ? formatTimeAgo(c.onboarded_at) : <span className="text-amber-600">Pending</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatTimeAgo(c.last_execution_at)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">
                      {c.executions_this_month}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setIntakeTarget(c)}
                          className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50"
                        >
                          Intake URL
                        </button>
                        <Link
                          to={`/operator/customers/${c.id}`}
                          className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50"
                        >
                          View →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onCreated={refresh}
        />
      )}

      {intakeTarget && (
        <IntakeTokenModal
          orgId={intakeTarget.id}
          orgName={intakeTarget.name}
          onClose={() => setIntakeTarget(null)}
        />
      )}
    </div>
  );
}
