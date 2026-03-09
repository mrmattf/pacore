import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap, ChevronRight, ThumbsUp } from 'lucide-react';
import { apiFetch } from '../services/auth';

interface SkillTemplate {
  id: string;
  skillTypeId: string;
  name: string;
  version: string;
  author: string;
  price: number;
}

interface TemplateRequest {
  id: string;
  integrationCombo: string;
  voteCount: number;
}

export function TemplatePickerPage() {
  const { typeId } = useParams<{ typeId: string }>();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<SkillTemplate[]>([]);
  const [requests, setRequests] = useState<TemplateRequest[]>([]);
  const [typeName, setTypeName] = useState('');
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [voting, setVoting] = useState<string | null>(null);
  const [requestCombo, setRequestCombo] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);

  useEffect(() => {
    if (!typeId) return;
    loadData();
  }, [typeId]);

  async function loadData() {
    setLoading(true);
    try {
      const [typesRes, templatesRes] = await Promise.all([
        apiFetch('/v1/skill-types'),
        apiFetch(`/v1/skill-types/${typeId}/templates`),
      ]);

      if (typesRes.ok) {
        const types = await typesRes.json();
        const found = types.find((t: any) => t.id === typeId);
        if (found) setTypeName(found.name);
      }

      if (templatesRes.ok) {
        setTemplates(await templatesRes.json());
      }

      // Load template requests from DB (if endpoint exists)
      const reqRes = await apiFetch(`/v1/skill-types/${typeId}/template-requests`);
      if (reqRes.ok) setRequests(await reqRes.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleConfigure(template: SkillTemplate) {
    setActivating(template.id);
    try {
      // Create a user_skill record with pending status
      const res = await apiFetch(`/v1/me/skills/${template.skillTypeId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? 'Failed to start configuration');
        return;
      }

      const userSkill = await res.json();
      // Pre-configure with template metadata so SkillsPage can display and navigate correctly
      await apiFetch(`/v1/me/skills/${userSkill.id}/configure`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          skillTypeId: template.skillTypeId,
          templateName: template.name,
          slotConnections: {},
          fieldOverrides: {},
          namedTemplates: {},
        }),
      });

      navigate(`/skills/${typeId}/templates/${template.id}/configure/${userSkill.id}`);
    } finally {
      setActivating(null);
    }
  }

  async function handleVote(request: TemplateRequest) {
    setVoting(request.id);
    try {
      await apiFetch(`/v1/skill-types/${typeId}/template-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationCombo: request.integrationCombo }),
      });
      await loadData();
    } finally {
      setVoting(null);
    }
  }

  async function handleSubmitRequest() {
    if (!requestCombo.trim()) return;
    await apiFetch(`/v1/skill-types/${typeId}/template-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationCombo: requestCombo.trim(), description: '' }),
    });
    setRequestCombo('');
    setShowRequestForm(false);
    await loadData();
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <button
          onClick={() => navigate('/skills')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-2"
        >
          <ArrowLeft size={14} /> Back to Skills
        </button>
        <h1 className="text-2xl font-bold">{typeName || 'Templates'}</h1>
        <p className="text-sm text-gray-500 mt-1">Choose a template to configure</p>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          {loading ? (
            <div className="text-gray-400 text-center py-12">Loading templates…</div>
          ) : (
            <>
              {/* Available templates */}
              <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map(tmpl => (
                    <div
                      key={tmpl.id}
                      className="bg-white border rounded-lg p-5 hover:border-blue-400 transition-colors flex flex-col gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 flex-shrink-0">
                          <Zap size={18} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{tmpl.name}</h3>
                          <p className="text-xs text-gray-500">{tmpl.author} · {tmpl.price === 0 ? 'Free' : `$${tmpl.price}`} · v{tmpl.version}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleConfigure(tmpl)}
                        disabled={activating === tmpl.id}
                        className="mt-auto w-full flex items-center justify-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {activating === tmpl.id ? 'Starting…' : 'Configure'}
                        {activating !== tmpl.id && <ChevronRight size={14} />}
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Requested / coming soon */}
              {(requests.length > 0 || true) && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Requested — Coming Soon
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {requests.map(req => (
                      <div key={req.id} className="bg-white border border-dashed rounded-lg p-5 flex flex-col gap-3">
                        <p className="font-medium text-gray-700">{req.integrationCombo}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">{req.voteCount} request{req.voteCount !== 1 ? 's' : ''}</span>
                          <button
                            onClick={() => handleVote(req)}
                            disabled={voting === req.id}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                          >
                            <ThumbsUp size={12} /> Vote
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {!showRequestForm ? (
                    <button
                      onClick={() => setShowRequestForm(true)}
                      className="mt-4 text-sm text-blue-600 hover:underline"
                    >
                      + Request a template for {typeName}
                    </button>
                  ) : (
                    <div className="mt-4 flex gap-2 items-center">
                      <input
                        type="text"
                        value={requestCombo}
                        onChange={e => setRequestCombo(e.target.value)}
                        placeholder="e.g., WooCommerce → Intercom"
                        className="border rounded px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleSubmitRequest}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Submit
                      </button>
                      <button
                        onClick={() => setShowRequestForm(false)}
                        className="px-3 py-1.5 text-sm text-gray-600 border rounded hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
