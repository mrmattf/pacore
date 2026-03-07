import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../services/auth';
import { ArrowLeft, Copy, RotateCcw, Trash2, Plus, Check, KeyRound } from 'lucide-react';

function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    if (newPassword !== confirm) { setError('Passwords do not match'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await apiFetch('/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to change password');
        return;
      }
      setSuccess(true);
      setCurrentPassword(''); setNewPassword(''); setConfirm('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mt-6">
      <div className="flex items-center gap-2 mb-3">
        <KeyRound size={18} className="text-gray-500" />
        <h2 className="text-lg font-semibold">Change Password</h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full px-4 py-2 border rounded text-sm"
          required
        />
        <input
          type="password"
          placeholder="New password (min 8 characters)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full px-4 py-2 border rounded text-sm"
          required
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-4 py-2 border rounded text-sm"
          required
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-green-600 text-sm">Password changed successfully.</p>}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

interface McpClient {
  id: string;
  client_id: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
}

interface NewCredential {
  clientId: string;
  clientSecret: string;
  name: string;
}

function DeveloperCredentials() {
  const [clients, setClients] = useState<McpClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCredential, setNewCredential] = useState<NewCredential | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('Claude Desktop');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const mcpSseUrl = `${window.location.origin}/v1/mcp/sse`;

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    setLoading(true);
    try {
      const res = await apiFetch('/v1/me/mcp-clients');
      if (res.ok) setClients(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await apiFetch('/v1/me/mcp-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() || 'Claude Desktop' }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewCredential({ clientId: data.clientId, clientSecret: data.clientSecret, name: data.name });
        await loadClients();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleRotate(id: string) {
    setRotatingId(id);
    try {
      const res = await apiFetch(`/v1/me/mcp-clients/${id}/rotate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const client = clients.find(c => c.id === id);
        setNewCredential({ clientId: data.clientId, clientSecret: data.clientSecret, name: client?.name ?? '' });
        await loadClients();
      }
    } finally {
      setRotatingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await apiFetch(`/v1/me/mcp-clients/${id}`, { method: 'DELETE' });
      await loadClients();
    } finally {
      setDeletingId(null);
    }
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <button
      onClick={() => copyToClipboard(text, field)}
      className="p-1 text-gray-400 hover:text-gray-700"
      title="Copy"
    >
      {copiedField === field ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );

  return (
    <div className="bg-white rounded-lg shadow p-6 mt-6">
      <h2 className="text-lg font-semibold mb-1">Developer Credentials</h2>
      <p className="text-sm text-gray-500 mb-4">
        Generate per-user API credentials for external clients like Claude Desktop.
        The secret is shown once — store it securely.
      </p>

      {/* Existing clients */}
      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : clients.length > 0 ? (
        <div className="border rounded-lg divide-y mb-4">
          {clients.map(client => (
            <div key={client.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium">{client.name}</div>
                <div className="text-xs text-gray-400 font-mono">{client.client_id}</div>
                <div className="text-xs text-gray-400">
                  {client.last_used_at
                    ? `Last used ${new Date(client.last_used_at).toLocaleDateString()}`
                    : 'Never used'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRotate(client.id)}
                  disabled={rotatingId === client.id}
                  className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-40"
                  title="Rotate secret"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  onClick={() => handleDelete(client.id)}
                  disabled={deletingId === client.id}
                  className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-40"
                  title="Revoke"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-400 mb-4">No credentials yet.</div>
      )}

      {/* New credential revealed after create/rotate */}
      {newCredential && (
        <div className="mb-4 border border-amber-300 rounded-lg p-4 bg-amber-50 space-y-3">
          <p className="text-sm font-medium text-amber-800">
            Save these credentials now — the secret will not be shown again.
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
            <div className="flex items-center gap-2 font-mono text-sm bg-white border rounded px-3 py-1.5">
              <span className="flex-1">{newCredential.clientId}</span>
              <CopyButton text={newCredential.clientId} field="clientId" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret</label>
            <div className="flex items-center gap-2 font-mono text-sm bg-white border rounded px-3 py-1.5">
              <span className="flex-1 break-all">{newCredential.clientSecret}</span>
              <CopyButton text={newCredential.clientSecret} field="clientSecret" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">MCP SSE URL</label>
            <div className="flex items-center gap-2 font-mono text-sm bg-white border rounded px-3 py-1.5">
              <span className="flex-1">{mcpSseUrl}</span>
              <CopyButton text={mcpSseUrl} field="sseUrl" />
            </div>
          </div>

          <details className="text-xs text-gray-600">
            <summary className="cursor-pointer font-medium">Claude Desktop config snippet</summary>
            <pre className="mt-2 bg-white border rounded p-3 overflow-x-auto text-xs">{JSON.stringify({
              mcpServers: {
                pacore: {
                  url: mcpSseUrl,
                  clientId: newCredential.clientId,
                  clientSecret: newCredential.clientSecret,
                },
              },
            }, null, 2)}</pre>
          </details>

          <button
            onClick={() => setNewCredential(null)}
            className="text-xs text-gray-500 underline"
          >
            I've saved these — dismiss
          </button>
        </div>
      )}

      {/* Generate new */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Name (e.g. Claude Desktop)"
          className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={14} />
          {creating ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const token = useAuthStore((state) => state.token);
  const navigate = useNavigate();

  const fetchOllamaModels = async () => {
    if (!ollamaEndpoint) return;
    setLoadingModels(true);
    try {
      const response = await fetch(`${ollamaEndpoint}/api/tags`);
      const data = await response.json();
      setAvailableModels(data.models?.map((m: any) => m.name) || []);
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error);
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSaveProvider = async (providerId: string, config: any) => {
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch(`/v1/providers/${providerId}/configure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) throw new Error('Failed to save');
      setMessage(`${providerId} configured successfully!`);
    } catch (error) {
      setMessage(`Error configuring ${providerId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/chat')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft size={20} />
          Back to Chat
        </button>

        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-6">Provider Configuration</h1>

          {message && (
            <div className="mb-4 p-3 bg-blue-100 text-blue-800 rounded">
              {message}
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Anthropic API Key
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="flex-1 px-4 py-2 border rounded"
                />
                <button
                  onClick={() => handleSaveProvider('anthropic', { apiKey: anthropicKey })}
                  disabled={loading || !anthropicKey}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Save
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                OpenAI API Key
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="flex-1 px-4 py-2 border rounded"
                />
                <button
                  onClick={() => handleSaveProvider('openai', { apiKey: openaiKey })}
                  disabled={loading || !openaiKey}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Save
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Ollama Endpoint
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={ollamaEndpoint}
                  onChange={(e) => setOllamaEndpoint(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="flex-1 px-4 py-2 border rounded"
                />
                <button
                  onClick={fetchOllamaModels}
                  disabled={loadingModels || !ollamaEndpoint}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                >
                  {loadingModels ? 'Loading...' : 'Fetch Models'}
                </button>
              </div>

              <label className="block text-sm font-medium mb-2">
                Model
              </label>
              <div className="flex gap-2">
                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="flex-1 px-4 py-2 border rounded"
                  disabled={availableModels.length === 0}
                >
                  <option value="">Select a model...</option>
                  {availableModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleSaveProvider('ollama', {
                    endpoint: ollamaEndpoint,
                    model: ollamaModel || undefined
                  })}
                  disabled={loading || !ollamaEndpoint || !ollamaModel}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Local LLM server (requires Ollama installed and running)
              </p>
            </div>
          </div>
        </div>

        <DeveloperCredentials />
        <ChangePassword />
      </div>
    </div>
  );
}
