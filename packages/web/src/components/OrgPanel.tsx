import { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, Shield, Eye, User, Loader2 } from 'lucide-react';
import {
  fetchOrgWithMembers,
  addOrgMember,
  updateMemberRole,
  removeOrgMember,
  OrgWithMembers,
  OrgMember,
} from '../hooks/useOrgs';
import { useAuthStore } from '../store/authStore';

const ROLE_ICONS = {
  admin:  <Shield size={12} className="text-blue-500" />,
  member: <User   size={12} className="text-gray-400" />,
  viewer: <Eye    size={12} className="text-gray-400" />,
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

interface OrgPanelProps {
  orgId: string;
  isAdmin: boolean;
  onClose: () => void;
}

export function OrgPanel({ orgId, isAdmin, onClose }: OrgPanelProps) {
  const currentUser = useAuthStore((s) => s.user);
  const [org, setOrg] = useState<OrgWithMembers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Per-member action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOrgWithMembers(orgId);
      setOrg(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orgId]);

  async function handleInvite() {
    const userId = inviteUserId.trim();
    if (!userId) return;
    setInviting(true);
    setInviteError(null);
    try {
      await addOrgMember(orgId, userId, inviteRole);
      setInviteUserId('');
      setInviteRole('member');
      await load();
    } catch (e: any) {
      setInviteError(e.message);
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(member: OrgMember, newRole: string) {
    setActionLoading(member.id);
    try {
      await updateMemberRole(orgId, member.userId, newRole);
      await load();
    } catch {
      // ignore — role reverts on reload
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemove(member: OrgMember) {
    setActionLoading(member.id);
    try {
      await removeOrgMember(orgId, member.userId);
      await load();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-96 max-w-full bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">
              {org ? org.name : 'Organization'}
            </h2>
            {org && (
              <p className="text-xs text-gray-400 mt-0.5">/{org.slug}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-6">
          {loading && (
            <div className="flex items-center justify-center h-24 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          {org && (
            <>
              {/* Members list */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Members ({org.members.length})
                </h3>
                <div className="space-y-1">
                  {org.members.map((member) => {
                    const isSelf = member.userId === currentUser?.id;
                    const busy = actionLoading === member.id;
                    return (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50"
                      >
                        {/* Avatar placeholder */}
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-xs font-medium text-gray-500">
                          {(member.name ?? member.email)[0].toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          {member.name && (
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {member.name}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 truncate">{member.email}</p>
                        </div>

                        {/* Role selector */}
                        {isAdmin && !isSelf ? (
                          <select
                            value={member.role}
                            disabled={busy}
                            onChange={(e) => handleRoleChange(member, e.target.value)}
                            className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 bg-white disabled:opacity-50"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            {ROLE_ICONS[member.role as keyof typeof ROLE_ICONS]}
                            {ROLE_LABELS[member.role]}
                          </span>
                        )}

                        {/* Remove */}
                        {isAdmin && !isSelf && (
                          <button
                            onClick={() => handleRemove(member)}
                            disabled={busy}
                            title="Remove member"
                            className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          >
                            {busy
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Trash2 size={13} />}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Invite (admin only) */}
              {isAdmin && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Add Member
                  </h3>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="User ID"
                      value={inviteUserId}
                      onChange={(e) => setInviteUserId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                    />
                    <div className="flex gap-2">
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="text-sm border border-gray-200 rounded px-2 py-1.5 text-gray-600 bg-white"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={handleInvite}
                        disabled={inviting || !inviteUserId.trim()}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {inviting
                          ? <Loader2 size={13} className="animate-spin" />
                          : <UserPlus size={13} />}
                        Add
                      </button>
                    </div>
                    {inviteError && (
                      <p className="text-xs text-red-600">{inviteError}</p>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
