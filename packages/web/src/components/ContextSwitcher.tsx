import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Building2, Loader2, Settings, LayoutDashboard } from 'lucide-react';
import { useContextStore, OrgRole } from '../store/contextStore';
import { useOrgs, fetchOrgWithMembers } from '../hooks/useOrgs';
import { useAuthStore } from '../store/authStore';

interface ContextSwitcherProps {
  onManageOrg?: () => void;
}

export function ContextSwitcher({ onManageOrg }: ContextSwitcherProps) {
  const { context, setContext } = useContextStore();
  const { orgs, loading: orgsLoading, error: orgsError, refresh: refreshOrgs } = useOrgs();
  const { user, isOperator, logout } = useAuthStore((s) => ({ user: s.user, isOperator: s.isOperator, logout: s.logout }));

  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
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
    } catch (e: any) {
      if (e.message?.includes('403') || e.message?.includes('member')) {
        // No longer a member — refresh org list and switch to first available org
        const refreshed = await refreshOrgs();
        if (refreshed && refreshed.length > 0) {
          setContext({ type: 'org', orgId: refreshed[0].id, orgName: refreshed[0].name, role: 'member' });
        } else {
          logout();
          window.location.href = '/login';
        }
      } else {
        setContext({ type: 'org', orgId, orgName, role: 'member' });
      }
    } finally {
      setSwitching(false);
    }
  }

  const isAdmin = context.role === 'admin';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={switching}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-60"
      >
        {switching ? (
          <Loader2 size={14} className="animate-spin text-gray-400" />
        ) : (
          <Building2 size={14} className="text-blue-500" />
        )}
        <span className="max-w-[160px] truncate">{context.orgName || 'Select account'}</span>
        <ChevronDown size={12} className="text-gray-400 ml-0.5" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          {/* Operator Dashboard link */}
          {isOperator && (
            <>
              <div className="p-1">
                <Link
                  to="/operator"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                >
                  <LayoutDashboard size={14} className="text-purple-500 flex-shrink-0" />
                  <span>Operator Dashboard</span>
                </Link>
              </div>
              <div className="border-t border-gray-100 mx-1" />
            </>
          )}

          {/* Accounts list */}
          <div className="p-1">
            {orgsLoading && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
                <Loader2 size={13} className="animate-spin" /> Loading…
              </div>
            )}
            {orgsError && !orgsLoading && (
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-red-500">{orgsError}</span>
                <button onClick={() => refreshOrgs()} className="text-xs text-blue-500 hover:underline ml-2">Retry</button>
              </div>
            )}
            {orgs.map((org) => {
              const isActive = context.orgId === org.id;
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
                      title="Manage account"
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded mr-1"
                    >
                      <Settings size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
