import { useState, useRef, useEffect } from 'react';
import { ChevronDown, User, Building2, Plus, Loader2, Settings } from 'lucide-react';
import { useContextStore, OrgRole } from '../store/contextStore';
import { useOrgs, fetchOrgWithMembers, createOrg } from '../hooks/useOrgs';
import { useAuthStore } from '../store/authStore';

interface ContextSwitcherProps {
  onManageOrg?: () => void;
}

export function ContextSwitcher({ onManageOrg }: ContextSwitcherProps) {
  const { context, setContext } = useContextStore();
  const { orgs, loading: orgsLoading, refresh: refreshOrgs } = useOrgs();
  const user = useAuthStore((s) => s.user);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewOrgName('');
        setCreateError(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function switchToOrg(orgId: string, orgName: string) {
    setSwitching(true);
    setOpen(false);
    try {
      const orgData = await fetchOrgWithMembers(orgId);
      const member = orgData.members.find((m) => m.userId === user?.id);
      const role: OrgRole = (member?.role as OrgRole) ?? 'member';
      setContext({ type: 'org', orgId, orgName, role });
    } catch {
      // Fall back to member role if fetch fails
      setContext({ type: 'org', orgId, orgName, role: 'member' });
    } finally {
      setSwitching(false);
    }
  }

  async function handleCreateOrg() {
    const name = newOrgName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const org = await createOrg(name);
      await refreshOrgs();
      await switchToOrg(org.id, org.name);
      setNewOrgName('');
    } catch (e: any) {
      setCreateError(e.message);
      setCreating(false);
    }
  }

  const label = context.type === 'personal'
    ? 'Personal'
    : context.orgName;

  const isAdmin = context.type === 'org' && context.role === 'admin';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={switching}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-60"
      >
        {switching ? (
          <Loader2 size={14} className="animate-spin text-gray-400" />
        ) : context.type === 'personal' ? (
          <User size={14} className="text-gray-400" />
        ) : (
          <Building2 size={14} className="text-blue-500" />
        )}
        <span className="max-w-[160px] truncate">{label}</span>
        {context.type === 'org' && (
          <span className="text-xs text-gray-400 font-normal">{context.role}</span>
        )}
        <ChevronDown size={12} className="text-gray-400 ml-0.5" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          {/* Personal */}
          <div className="p-1">
            <button
              onClick={() => { setContext({ type: 'personal' }); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors ${
                context.type === 'personal'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <User size={14} className="text-gray-400 flex-shrink-0" />
              <span className="flex-1 text-left">Personal</span>
              {context.type === 'personal' && (
                <span className="text-xs text-blue-500">active</span>
              )}
            </button>
          </div>

          {/* Orgs */}
          {(orgsLoading || orgs.length > 0) && (
            <>
              <div className="border-t border-gray-100 mx-1" />
              <div className="p-1">
                <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Organizations
                </p>
                {orgsLoading && (
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
                    <Loader2 size={13} className="animate-spin" /> Loading…
                  </div>
                )}
                {orgs.map((org) => {
                  const isActive = context.type === 'org' && context.orgId === org.id;
                  return (
                    <div key={org.id} className="flex items-center gap-1">
                      <button
                        onClick={() => switchToOrg(org.id, org.name)}
                        className={`flex-1 flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors ${
                          isActive
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <Building2 size={14} className={isActive ? 'text-blue-500' : 'text-gray-400'} />
                        <span className="flex-1 text-left truncate">{org.name}</span>
                        {isActive && <span className="text-xs text-blue-500">active</span>}
                      </button>
                      {isActive && isAdmin && onManageOrg && (
                        <button
                          onClick={() => { setOpen(false); onManageOrg(); }}
                          title="Manage organization"
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded mr-1"
                        >
                          <Settings size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Create new org */}
          <div className="border-t border-gray-100 mx-1" />
          <div className="p-2">
            {!creating ? (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
              >
                <Plus size={14} className="text-gray-400" />
                New Organization
              </button>
            ) : (
              <div className="space-y-1.5 px-1">
                <input
                  autoFocus
                  type="text"
                  placeholder="Organization name"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateOrg();
                    if (e.key === 'Escape') { setCreating(false); setNewOrgName(''); }
                  }}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                />
                {createError && (
                  <p className="text-xs text-red-600">{createError}</p>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={handleCreateOrg}
                    disabled={!newOrgName.trim()}
                    className="flex-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewOrgName(''); setCreateError(null); }}
                    className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
