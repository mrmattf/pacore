import { useNavigate } from 'react-router-dom';
import { Zap, CheckCircle, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import { useSkills, UserSkill } from '../hooks/useSkills';

const TRIGGER_LABEL: Record<string, string> = {
  webhook: 'Webhook',
  scheduled: 'Scheduled',
  manual: 'Manual',
};

export function SkillsPage() {
  const navigate = useNavigate();
  const { catalog, mySkills, loading, refresh, activateSkill, deleteSkill } = useSkills();

  const activatedIds = new Set(mySkills.map((s) => s.skillId));

  const findMySkill = (skillId: string): UserSkill | undefined =>
    mySkills.find((s) => s.skillId === skillId);

  const handleActivate = async (skillId: string) => {
    try {
      const userSkill = await activateSkill(skillId);
      navigate(`/skills/${skillId}/setup/${userSkill.id}`);
    } catch (e: any) {
      alert(`Failed to activate skill: ${e.message}`);
    }
  };

  const handleConfigure = (skillId: string, userSkillId: string) => {
    navigate(`/skills/${skillId}/setup/${userSkillId}`);
  };

  const handleDelete = async (userSkillId: string) => {
    if (!confirm('Remove this skill? This will also delete its webhook triggers and history.')) return;
    try {
      await deleteSkill(userSkillId);
    } catch (e: any) {
      alert(`Failed to remove skill: ${e.message}`);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Skills</h1>
            <p className="text-sm text-gray-600 mt-1">
              Activate and configure automated capabilities for your workspace
            </p>
          </div>
          <button
            onClick={() => refresh()}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-auto p-6">
        {loading && catalog.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            Loading skills…
          </div>
        ) : catalog.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Zap size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No skills available yet</p>
            <p className="text-sm mt-1">Platform skills will appear here as they are added.</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {catalog.map((skill) => {
              const mySkill = findMySkill(skill.id);
              const isActive = activatedIds.has(skill.id);

              return (
                <div
                  key={skill.id}
                  className="bg-white border rounded-lg p-5 flex items-start gap-4 hover:border-blue-300 transition-colors"
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                    <Zap size={20} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-gray-900">{skill.name}</h2>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                        v{skill.version}
                      </span>
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                        {TRIGGER_LABEL[skill.triggerType] ?? skill.triggerType}
                      </span>
                      {isActive && mySkill?.status === 'active' && (
                        <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle size={11} /> Active
                        </span>
                      )}
                      {isActive && mySkill?.status === 'pending' && (
                        <span className="text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded">
                          Setup required
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{skill.description}</p>
                    {skill.requiredCapabilities.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {skill.requiredCapabilities.map((cap) => (
                          <span
                            key={cap}
                            className="text-xs bg-gray-50 border text-gray-500 px-2 py-0.5 rounded"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isActive && mySkill ? (
                      <>
                        <button
                          onClick={() => handleConfigure(skill.id, mySkill.id)}
                          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
                        >
                          Configure
                          <ChevronRight size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(mySkill.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                          title="Remove skill"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleActivate(skill.id)}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
