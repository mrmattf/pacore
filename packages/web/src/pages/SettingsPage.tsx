import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { ArrowLeft } from 'lucide-react';

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
      </div>
    </div>
  );
}
