import { useState, useEffect, useRef } from 'react';
import { CheckCircle, Plus, ChevronDown, ChevronUp, Trash2, Loader2, AlertCircle, Pencil } from 'lucide-react';

export interface Connection {
  id: string;
  integrationKey: string;
  displayName: string;
  status: 'active' | 'expired' | 'error';
  lastTestedAt: string | null;
}

interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number';
  placeholder?: string;
  hint?: string;
  required?: boolean;
}

interface IntegrationMeta {
  credentialFields: CredentialField[];
  setupGuide: string;
}

interface ConnectionPickerProps {
  integrationKey: string;
  slotLabel: string;
  selectedConnectionId: string | null;
  onSelect: (connectionId: string) => void;
  token: string;
  orgId: string;
}

export function ConnectionPicker({
  integrationKey,
  slotLabel,
  selectedConnectionId,
  onSelect,
  token,
  orgId,
}: ConnectionPickerProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [integrationMeta, setIntegrationMeta] = useState<IntegrationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [newCreds, setNewCreds] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const saveInFlight = useRef(false);

  // Edit connection state
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [editCreds, setEditCreds] = useState<Record<string, string>>({});
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Shopify OAuth state
  const [shopifyShop, setShopifyShop] = useState('');
  const [shopifyConnecting, setShopifyConnecting] = useState(false);
  const [shopifyOauthError, setShopifyOauthError] = useState<string | null>(null);

  const isShopify = integrationKey === 'shopify';

  useEffect(() => {
    loadConnections();
    if (!isShopify) {
      fetch(`/v1/integrations/${integrationKey}/fields`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setIntegrationMeta(data as IntegrationMeta); })
        .catch(() => {});
    }
  }, [integrationKey, orgId, token]);

  async function loadConnections() {
    try {
      setLoading(true);
      const res = await fetch(`/v1/organizations/${orgId}/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const all: Connection[] = await res.json();
        setConnections(all.filter(c => c.integrationKey === integrationKey));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(connectionId: string) {
    setDeletingId(connectionId);
    try {
      await fetch(`/v1/organizations/${orgId}/connections/${connectionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadConnections();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSave() {
    if (!displayName.trim()) {
      setSaveError('Please enter a display name for this connection');
      return;
    }
    if (saveInFlight.current) return;
    saveInFlight.current = true;

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/v1/organizations/${orgId}/connections`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationKey, displayName: displayName.trim(), credentials: newCreds }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? 'Connection failed');
        return;
      }

      setSavedName(displayName.trim());
      setShowNewForm(false);
      setNewCreds({});
      setDisplayName('');
      await loadConnections();
      onSelect(data.connectionId);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
      saveInFlight.current = false;
    }
  }

  async function handleShopifyOAuth() {
    const shop = shopifyShop.trim();
    if (!shop) return;
    setShopifyConnecting(true);
    setShopifyOauthError(null);
    try {
      const res = await fetch('/v1/integrations/shopify/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      });
      const data = await res.json();
      if (!res.ok) {
        setShopifyOauthError(data.error || 'Could not start Shopify connection.');
        return;
      }
      window.location.href = data.authUrl;
    } catch {
      setShopifyOauthError('Network error. Please check your connection and try again.');
    } finally {
      setShopifyConnecting(false);
    }
  }

  async function handleEditOpen(conn: Connection) {
    setEditingConnection(conn);
    setEditDisplayName(conn.displayName);
    setEditCreds({});
    setEditError(null);
    setEditLoading(true);
    try {
      const res = await fetch(`/v1/organizations/${orgId}/connections/${conn.id}/fields`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEditCreds(data.nonSecretFields ?? {});
      }
    } catch {}
    setEditLoading(false);
  }

  async function handleEditSave() {
    setEditSaving(true);
    setEditError(null);
    try {
      const body: Record<string, unknown> = { credentials: editCreds };
      if (editDisplayName !== editingConnection!.displayName) body.displayName = editDisplayName;
      const res = await fetch(`/v1/organizations/${orgId}/connections/${editingConnection!.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? 'Update failed');
        return;
      }
      setEditingConnection(null);
      await loadConnections();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">{slotLabel}</label>

      {/* Existing connections */}
      {loading ? (
        <div className="text-sm text-gray-400">Loading connections…</div>
      ) : connections.length > 0 ? (
        <div className="border rounded-lg divide-y bg-white">
          {connections.map(conn => (
            <div key={conn.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                {conn.id === selectedConnectionId ? (
                  <CheckCircle size={16} className="text-green-500" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-gray-300" />
                )}
                <span className="text-sm font-medium">{conn.displayName}</span>
                <span className="text-xs text-gray-400">
                  {conn.lastTestedAt
                    ? `last tested ${new Date(conn.lastTestedAt).toLocaleDateString()}`
                    : 'not tested'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {conn.id !== selectedConnectionId && (
                  <button
                    onClick={() => onSelect(conn.id)}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Use this
                  </button>
                )}
                {conn.id === selectedConnectionId && (
                  <span className="text-xs text-green-600 font-medium">Selected</span>
                )}
                {!isShopify && (
                  <button
                    onClick={() => handleEditOpen(conn)}
                    className="p-1 text-gray-300 hover:text-blue-500"
                    title="Edit connection"
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(conn.id)}
                  disabled={deletingId === conn.id}
                  className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-40"
                  title="Remove connection"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border rounded-lg p-4 text-sm text-gray-500 bg-gray-50">
          No {integrationKey} connections yet — connect one below.
        </div>
      )}

      {/* Edit connection */}
      {editingConnection && (
        <div className="border rounded-lg p-4 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Edit connection</span>
          </div>

          {editLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={12} className="animate-spin" />
              Loading fields…
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={e => setEditDisplayName(e.target.value)}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {integrationMeta?.credentialFields.map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    value={editCreds[field.key] ?? ''}
                    onChange={e => setEditCreds(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.type === 'password' ? 'Leave blank to keep existing' : (field.placeholder ?? '')}
                    autoComplete={field.type === 'password' ? 'new-password' : 'off'}
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {field.hint && <p className="text-xs text-gray-400 mt-0.5">{field.hint}</p>}
                </div>
              ))}

              {editError && (
                <div className="text-xs text-red-600 bg-red-50 rounded p-2">{editError}</div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleEditSave}
                  disabled={editSaving}
                  className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {editSaving ? 'Saving…' : 'Save & Test'}
                </button>
                <button
                  onClick={() => { setEditingConnection(null); setEditError(null); }}
                  className="px-4 py-1.5 text-sm text-gray-600 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Add new connection */}
      {isShopify ? (
        /* Shopify: OAuth connect flow */
        <div className="border rounded-lg p-4 bg-white space-y-3">
          <span className="text-sm font-medium">Connect a Shopify store</span>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Store URL</label>
            <input
              type="text"
              value={shopifyShop}
              onChange={e => setShopifyShop(e.target.value)}
              placeholder="mystore.myshopify.com"
              className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {shopifyOauthError && (
            <div className="flex items-center gap-1 text-xs text-red-600 bg-red-50 rounded p-2">
              <AlertCircle size={12} />
              {shopifyOauthError}
            </div>
          )}
          <button
            onClick={handleShopifyOAuth}
            disabled={shopifyConnecting || !shopifyShop.trim()}
            className="flex items-center gap-2 px-4 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50"
          >
            {shopifyConnecting && <Loader2 size={12} className="animate-spin" />}
            {shopifyConnecting ? 'Redirecting…' : 'Connect Shopify →'}
          </button>
          <p className="text-xs text-gray-400">
            You'll be redirected to Shopify to authorize. Takes about 30 seconds.
          </p>
        </div>
      ) : !showNewForm ? (
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
        >
          <Plus size={14} />
          Connect a new {integrationKey} account
        </button>
      ) : (
        <div className="border rounded-lg p-4 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">New {integrationKey} connection</span>
          </div>

          {/* Setup guide */}
          {integrationMeta && (
            <div>
              <button
                onClick={() => setShowSetupGuide(v => !v)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                {showSetupGuide ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                How to get these credentials
              </button>
              {showSetupGuide && (
                <div className="mt-2 p-3 bg-blue-50 rounded text-xs text-blue-800">
                  {integrationMeta.setupGuide}
                </div>
              )}
            </div>
          )}

          {/* Display name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Display Name <span className="text-gray-400">(how you'll recognize this connection)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={`e.g., "Acme Store" or "Main ${integrationKey}"`}
              className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Credential fields */}
          {integrationMeta?.credentialFields.map(field => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
              <input
                type={field.type}
                value={newCreds[field.key] ?? ''}
                onChange={e => setNewCreds(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder ?? ''}
                autoComplete={field.type === 'password' ? 'new-password' : 'off'}
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {field.hint && <p className="text-xs text-gray-400 mt-0.5">{field.hint}</p>}
            </div>
          ))}

          {saveError && (
            <div className="text-xs text-red-600 bg-red-50 rounded p-2">{saveError}</div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Testing connection…' : 'Test Connection & Save'}
            </button>
            <button
              onClick={() => { setShowNewForm(false); setSaveError(null); }}
              className="px-4 py-1.5 text-sm text-gray-600 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>

          {savedName && (
            <div className="text-xs text-green-600">✓ Saved as "{savedName}"</div>
          )}
        </div>
      )}
    </div>
  );
}
