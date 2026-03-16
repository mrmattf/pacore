import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, Check } from 'lucide-react';
import { apiFetch } from '../services/auth';
import { updateMode, storeAssessment, fetchAssessment, AssessmentReport } from '../hooks/useOperator';

const ASSESSMENT_SECTIONS = ['assessment', 'ticket_categories', 'activation_gaps', 'summary'] as const;
const SECTION_LABELS: Record<string, string> = {
  assessment: 'Assessment Summary',
  ticket_categories: 'Ticket Categories',
  activation_gaps: 'Activation Gaps',
  gap_candidates: 'Gap Candidates',
  summary: 'Summary',
};

const RECOMMENDATION_OPTIONS = [
  { value: '', label: 'No recommendation' },
  { value: 'self_managed', label: 'Self-Managed' },
  { value: 'concierge_starter', label: 'Concierge Starter' },
  { value: 'concierge_standard', label: 'Concierge Standard' },
  { value: 'concierge_growth', label: 'Concierge Growth' },
];

function AssessmentTab({ orgId }: { orgId: string }) {
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedSections, setParsedSections] = useState<string[] | null>(null);
  const [recommendation, setRecommendation] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchAssessment(orgId)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [orgId]);

  function handleJsonChange(value: string) {
    setJsonInput(value);
    setParseError(null);
    setParsedSections(null);
    setSaved(false);
    if (!value.trim()) return;
    try {
      const parsed = JSON.parse(value);
      const found = ASSESSMENT_SECTIONS.filter(s => parsed[s]);
      const missing = ASSESSMENT_SECTIONS.filter(s => !parsed[s]);
      if (missing.length > 0) {
        setParseError(`Missing sections: ${missing.map(s => SECTION_LABELS[s]).join(', ')}`);
      } else {
        setParsedSections(found);
      }
    } catch {
      setParseError('Invalid JSON — please check the format');
    }
  }

  async function handleSave() {
    if (!parsedSections) return;
    setSaving(true);
    setSaveError(null);
    try {
      const parsed = JSON.parse(jsonInput);
      await storeAssessment(orgId, parsed, recommendation || undefined);
      setSaved(true);
      setJsonInput('');
      setParsedSections(null);
      const updated = await fetchAssessment(orgId);
      setReport(updated);
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-gray-400 py-8"><Loader2 size={16} className="animate-spin" /> Loading…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Upload panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Upload Assessment Report</h3>
        <p className="text-sm text-gray-500 mb-3">
          Paste the JSON output from your Claude Desktop assessment session.
        </p>
        <textarea
          value={jsonInput}
          onChange={(e) => handleJsonChange(e.target.value)}
          placeholder='{ "assessment": {...}, "ticket_categories": [...], "activation_gaps": [...], "summary": {...} }'
          rows={8}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400 resize-none"
        />

        {parseError && (
          <div className="flex items-center gap-2 text-sm text-red-600 mt-2">
            <AlertCircle size={14} /> {parseError}
          </div>
        )}

        {parsedSections && (
          <div className="flex items-center gap-2 text-sm text-green-600 mt-2">
            <Check size={14} />
            {parsedSections.length} sections parsed: {parsedSections.map(s => SECTION_LABELS[s]).join(' · ')}
          </div>
        )}

        {parsedSections && (
          <div className="mt-4 flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Recommendation
              </label>
              <select
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              >
                {RECOMMENDATION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {saving ? 'Saving…' : 'Save report'}
            </button>
          </div>
        )}

        {saveError && <p className="text-sm text-red-600 mt-2">{saveError}</p>}
        {saved && <p className="text-sm text-green-600 mt-2">Report saved.</p>}
      </div>

      {/* Stored report */}
      {report && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Current Assessment</h3>
            {report.recommendation && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                {RECOMMENDATION_OPTIONS.find(o => o.value === report.recommendation)?.label ?? report.recommendation}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">Created {new Date(report.created_at).toLocaleDateString()}</p>

          {([...ASSESSMENT_SECTIONS, 'gap_candidates'] as string[]).map(section => {
            const data = report.report[section];
            if (data === undefined || data === null) return null;
            return (
              <div key={section}>
                <h4 className="font-medium text-gray-700 mb-2">{SECTION_LABELS[section]}</h4>
                <pre className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded p-3 overflow-auto whitespace-pre-wrap">
                  {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
                </pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModeToggle({ orgId, currentMode, onUpdated }: {
  orgId: string;
  currentMode: 'concierge' | 'self_managed';
  onUpdated: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [handoffNotes, setHandoffNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    const newMode = currentMode === 'concierge' ? 'self_managed' : 'concierge';
    try {
      await updateMode(orgId, newMode, handoffNotes || undefined);
      setShowConfirm(false);
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
      >
        Switch to {currentMode === 'concierge' ? 'Self-managed' : 'Concierge'}
      </button>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">
              Switch to {currentMode === 'concierge' ? 'Self-managed' : 'Concierge'}?
            </h3>
            {currentMode === 'concierge' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Handoff notes for customer <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={handoffNotes}
                  onChange={(e) => setHandoffNotes(e.target.value)}
                  placeholder="e.g. Your Backorder Notification skill is already configured and running. To adjust thresholds, visit the Skills page."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">Customer will see this as a banner on their Skills page after transition.</p>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                Confirm
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OperatorCustomerDetail() {
  const { orgId } = useParams<{ orgId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'skills' | 'assessment'>('overview');

  async function load() {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/v1/operator/customers/${orgId}`);
      if (!res.ok) throw new Error('Failed to load customer');
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orgId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-red-600">{error ?? 'Customer not found'}</p>
      </div>
    );
  }

  const { org, profile, members, executions } = data;
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'skills', label: 'Skills' },
    { id: 'assessment', label: 'Assessment' },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Back + header */}
        <Link to="/operator" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={14} /> Back to dashboard
        </Link>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                profile.management_mode === 'concierge'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {profile.management_mode === 'concierge' ? 'Concierge' : 'Self-managed'}
              </span>
              {profile.onboarded_at ? (
                <span className="text-xs text-gray-400">Onboarded {new Date(profile.onboarded_at).toLocaleDateString()}</span>
              ) : (
                <span className="text-xs text-amber-600">Not yet onboarded</span>
              )}
            </div>
          </div>
          <ModeToggle orgId={org.id} currentMode={profile.management_mode} onUpdated={load} />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{executions?.this_month ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Executions this month</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{executions?.total ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Total executions</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{members?.length ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Members</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Members</h3>
              {members.length === 0 ? (
                <p className="text-sm text-gray-400">No members yet.</p>
              ) : (
                <div className="space-y-2">
                  {members.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between py-1.5">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{m.name || m.email}</div>
                        {m.name && <div className="text-xs text-gray-400">{m.email}</div>}
                      </div>
                      <span className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-0.5">{m.role}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {profile.handoff_notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Handoff notes</p>
                <p className="text-sm text-amber-800">{profile.handoff_notes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'skills' && (
          <SkillsTab orgId={org.id} mode={profile.management_mode} />
        )}

        {activeTab === 'assessment' && orgId && (
          <AssessmentTab orgId={orgId} />
        )}
      </div>
    </div>
  );
}

function SkillsTab({ orgId, mode }: { orgId: string; mode: string }) {
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/v1/operator/customers/${orgId}/skills`)
      .then(r => r.json())
      .then(d => setSkills(d.skills ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) return <div className="flex items-center gap-2 text-gray-400 py-8"><Loader2 size={16} className="animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-3">
      {mode === 'self_managed' && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle size={14} />
          This customer is self-managed. Skill write actions are disabled.
        </div>
      )}
      {skills.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No skills activated for this customer.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {skills.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900">{s.skillId}</div>
                <div className="text-xs text-gray-400">{s.status}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
