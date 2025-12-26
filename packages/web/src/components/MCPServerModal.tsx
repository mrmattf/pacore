import { useState } from 'react';
import { X, AlertCircle, Check } from 'lucide-react';
import { useMCPServers, RegisterServerRequest } from '../hooks/useMCPServers';
import { useCategories } from '../hooks/useCategories';

interface Props {
  onClose: () => void;
}

export function MCPServerModal({ onClose }: Props) {
  const { registerServer, testConnection } = useMCPServers();
  const { categories } = useCategories();

  const [formData, setFormData] = useState<RegisterServerRequest>({
    name: '',
    serverType: 'cloud',
    protocol: 'http',
    connectionConfig: {
      url: '',
    },
    categories: [],
    credentials: {},
  });

  const [showCredentials, setShowCredentials] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      // Temporarily register the server to test it
      const tempServer = await registerServer(formData);

      // Test the connection
      const isConnected = await testConnection(tempServer.id);

      if (isConnected) {
        setTestResult('success');
      } else {
        setTestResult('error');
        setError('Connection test failed. Please check your URL and credentials.');
      }
    } catch (err: any) {
      setTestResult('error');
      setError(err.message || 'Failed to test connection');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.connectionConfig.url) {
      setError('Name and URL are required');
      return;
    }

    if (testResult !== 'success') {
      setError('Please test the connection before saving');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await registerServer(formData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save server');
    } finally {
      setSaving(false);
    }
  };

  const updateCredentials = (key: string, value: string | object | undefined) => {
    setFormData((prev) => ({
      ...prev,
      credentials: {
        ...prev.credentials,
        [key]: value || undefined,
      },
    }));
    setTestResult(null); // Reset test result when credentials change
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Add MCP Server</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded">
              <AlertCircle size={16} className="text-red-600 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {testResult === 'success' && (
            <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded">
              <Check size={16} className="text-green-600 mt-0.5" />
              <p className="text-sm text-green-800">Connection test successful!</p>
            </div>
          )}

          {/* Server Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Server Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., Legal Database API"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Endpoint URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Endpoint URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={formData.connectionConfig.url}
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  connectionConfig: { ...prev.connectionConfig, url: e.target.value },
                }));
                setTestResult(null);
              }}
              placeholder="https://api.example.com/mcp"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              The base URL for your MCP server
            </p>
          </div>

          {/* Protocol */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Protocol
            </label>
            <select
              value={formData.protocol}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  protocol: e.target.value as 'http' | 'websocket' | 'stdio',
                }))
              }
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="http">HTTP</option>
              <option value="websocket" disabled>
                WebSocket (Coming Soon)
              </option>
              <option value="stdio" disabled>
                Stdio (Coming Soon)
              </option>
            </select>
          </div>

          {/* Categories */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categories (Optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => {
                    const isSelected = formData.categories?.includes(category);
                    setFormData((prev) => ({
                      ...prev,
                      categories: isSelected
                        ? prev.categories?.filter((c) => c !== category)
                        : [...(prev.categories || []), category],
                    }));
                  }}
                  className={`px-3 py-1 text-sm rounded ${
                    formData.categories?.includes(category)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Credentials Section */}
          <div className="border-t pt-4">
            <button
              onClick={() => setShowCredentials(!showCredentials)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-medium text-gray-700">
                Connection Credentials (Optional)
              </span>
              <span className="text-xs text-gray-500">
                {showCredentials ? 'Hide' : 'Show'}
              </span>
            </button>

            {showCredentials && (
              <div className="mt-4 space-y-3 bg-gray-50 p-4 rounded">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={formData.credentials?.apiKey || ''}
                    onChange={(e) => updateCredentials('apiKey', e.target.value)}
                    placeholder="Enter API key"
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Will be encrypted and stored securely
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={formData.credentials?.username || ''}
                      onChange={(e) => updateCredentials('username', e.target.value)}
                      placeholder="Username"
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={formData.credentials?.password || ''}
                      onChange={(e) => updateCredentials('password', e.target.value)}
                      placeholder="Password"
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custom Headers (JSON)
                  </label>
                  <textarea
                    value={
                      typeof formData.credentials?.customHeaders === 'string'
                        ? formData.credentials.customHeaders
                        : formData.credentials?.customHeaders
                        ? JSON.stringify(formData.credentials.customHeaders, null, 2)
                        : ''
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      if (!value) {
                        updateCredentials('customHeaders', undefined);
                        return;
                      }

                      try {
                        // Try to parse as JSON
                        const parsed = JSON.parse(value);
                        updateCredentials('customHeaders', parsed);
                      } catch {
                        // Store as string while typing (invalid JSON)
                        updateCredentials('customHeaders', value);
                      }
                    }}
                    placeholder='{"x-api-key": "your-key"}'
                    rows={3}
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional JSON object for custom headers (e.g., x-api-key)
                  </p>
                </div>

                <p className="text-xs text-gray-600 italic">
                  For Basic Auth, provide username and password. For Bearer token, use API Key.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !formData.name || !formData.connectionConfig.url}
            className="px-4 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || testResult !== 'success'}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Server'}
          </button>
        </div>
      </div>
    </div>
  );
}
