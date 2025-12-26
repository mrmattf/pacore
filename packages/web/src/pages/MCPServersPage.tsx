import { useState } from 'react';
import { useMCPServers, MCPServer } from '../hooks/useMCPServers';
import { Plus, Database, Check, Trash2, RefreshCw, Copy, CheckCheck } from 'lucide-react';
import { MCPServerModal } from '../components/MCPServerModal';

export function MCPServersPage() {
  const { servers, loading, deleteServer, testConnection, refresh } = useMCPServers();
  const [showModal, setShowModal] = useState(false);
  const [testingServer, setTestingServer] = useState<string | null>(null);
  const [deletingServer, setDeletingServer] = useState<string | null>(null);

  const handleDelete = async (serverId: string) => {
    if (!confirm('Are you sure you want to delete this MCP server?')) return;

    setDeletingServer(serverId);
    try {
      await deleteServer(serverId);
    } catch (error) {
      alert('Failed to delete server');
    } finally {
      setDeletingServer(null);
    }
  };

  const handleTest = async (serverId: string) => {
    setTestingServer(serverId);
    try {
      const isConnected = await testConnection(serverId);
      alert(isConnected ? 'Connection successful!' : 'Connection failed');
    } catch (error) {
      alert('Failed to test connection');
    } finally {
      setTestingServer(null);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">MCP Servers</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage your Model Context Protocol servers
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => refresh()}
              disabled={loading}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus size={16} />
              Add Server
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && servers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Loading servers...
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-12">
            <Database size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No MCP servers yet
            </h3>
            <p className="text-gray-600 mb-4">
              Get started by adding your first MCP server
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add Server
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto">
            {servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onDelete={handleDelete}
                onTest={handleTest}
                isDeleting={deletingServer === server.id}
                isTesting={testingServer === server.id}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && <MCPServerModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

interface ServerCardProps {
  server: MCPServer;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  isDeleting: boolean;
  isTesting: boolean;
}

function ServerCard({ server, onDelete, onTest, isDeleting, isTesting }: ServerCardProps) {
  const toolCount = server.capabilities?.tools?.length || 0;
  const [copied, setCopied] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(server.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{server.name}</h3>
            {server.hasCredentials && (
              <span className="flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                <Check size={12} />
                Authenticated
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1 truncate">
            {server.connectionConfig.url}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {server.categories.map((category) => (
          <span
            key={category}
            className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded"
          >
            {category}
          </span>
        ))}
        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
          {server.protocol}
        </span>
      </div>

      <div className="text-sm text-gray-600 mb-3">
        <span className="font-medium">{toolCount}</span> tool{toolCount !== 1 && 's'}{' '}
        available
      </div>

      <div className="flex items-center gap-2 mb-4 p-2 bg-gray-50 rounded border border-gray-200">
        <span className="text-xs text-gray-500 font-medium">Server ID:</span>
        <code className="flex-1 text-xs font-mono text-gray-700 truncate">
          {server.id}
        </code>
        <button
          onClick={handleCopyId}
          className="px-2 py-1 text-xs bg-white hover:bg-gray-100 border rounded flex items-center gap-1 transition-colors"
          title="Copy server ID"
        >
          {copied ? (
            <>
              <CheckCheck size={12} className="text-green-600" />
              <span className="text-green-600">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onTest(server.id)}
          disabled={isTesting}
          className="flex-1 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
        >
          {isTesting ? 'Testing...' : 'Test'}
        </button>
        <button
          onClick={() => onDelete(server.id)}
          disabled={isDeleting}
          className="px-3 py-2 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded disabled:opacity-50"
        >
          {isDeleting ? (
            'Deleting...'
          ) : (
            <Trash2 size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
