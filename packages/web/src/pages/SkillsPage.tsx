import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ChevronRight, RefreshCw, Settings, CheckCircle, Clock, Trash2, Pause, Play } from 'lucide-react';
import { apiFetch } from '../services/auth';
import { UserSkill } from '../hooks/useSkills';

interface SkillTypeCard {
  id: string;
  name: string;
  description: string;
  category: string;
  templateCount: number;
  templateNames: string[];
}

interface TemplateMeta { name: string; skillTypeId: string; }

export function SkillsPage() {
  const navigate = useNavigate();

  const [skillTypes, setSkillTypes] = useState<SkillTypeCard[]>([]);
  const [mySkills, setMySkills] = useState<UserSkill[]>([]);
  // templateId → { name, skillTypeId } — used to resolve names/routes for older skills
  // that were created before we stored templateName/skillTypeId in configuration.
  const [templateMap, setTemplateMap] = useState<Record<string, TemplateMeta>>({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('All');

  async function load() {
    setLoading(true);
    try {
      const [typesRes, myRes] = await Promise.all([
        apiFetch('/v1/skill-types'),
        apiFetch('/v1/me/skills'),
      ]);
      const types: SkillTypeCard[] = typesRes.ok ? await typesRes.json() : [];
      if (typesRes.ok) setSkillTypes(types);
      if (myRes.ok)   setMySkills(await myRes.json());

      // Build a flat templateId → {name, skillTypeId} map so we can display
      // and navigate correctly even for older skills that didn't store these fields.
      const map: Record<string, TemplateMeta> = {};
      await Promise.all(types.map(async (type) => {
        try {
          const res = await apiFetch(`/v1/skill-types/${type.id}/templates`);
          if (res.ok) {
            const templates: Array<{ id: string; name: string; skillTypeId: string }> = await res.json();
            for (const t of templates) map[t.id] = { name: t.name, skillTypeId: t.skillTypeId };
          }
        } catch { /* non-fatal */ }
      }));
      setTemplateMap(map);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const categories = ['All', ...Array.from(new Set(skillTypes.map(t => t.category)))];

  const visibleTypes = activeCategory === 'All'
    ? skillTypes
    : skillTypes.filter(t => t.category === activeCategory);

  const groupedByCategory = visibleTypes.reduce<Record<string, SkillTypeCard[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  const myConfiguredSkills = mySkills.filter(s => s.status === 'active' || s.status === 'paused' || s.status === 'pending');

  async function handleRemoveSkill(skillId: string) {
    try {
      await apiFetch(`/v1/me/skills/${skillId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      console.error('Failed to remove skill', e);
    }
  }

  async function handleTogglePause(skill: UserSkill) {
    const action = skill.status === 'active' ? 'pause' : 'resume';
    try {
      await apiFetch(`/v1/me/skills/${skill.id}/${action}`, { method: 'PUT' });
      const newStatus = action === 'pause' ? 'paused' : 'active';
      setMySkills(prev => prev.map(s => s.id === skill.id ? { ...s, status: newStatus as UserSkill['status'] } : s));
    } catch (e) {
      console.error('Failed to toggle skill pause', e);
    }
  }

  function handleBrowseTemplates(typeId: string) {
    navigate(`/skills/${typeId}/templates`);
  }

  function handleConfigure(skill: UserSkill) {
    const cfg = skill.configuration as any;
    const templateId = cfg?.templateId ?? '';
    // Prefer stored skillTypeId; fall back to the template map for older records
    const typeId = cfg?.skillTypeId ?? templateMap[templateId]?.skillTypeId ?? '';
    if (!typeId || !templateId) return; // shouldn't happen but guard anyway
    navigate(`/skills/${typeId}/templates/${templateId}/configure/${skill.id}`);
  }

  function resolveTemplateName(skill: UserSkill): string {
    const cfg = skill.configuration as any;
    if (cfg?.templateName) return cfg.templateName;
    const templateId = cfg?.templateId ?? '';
    return templateMap[templateId]?.name ?? templateId ?? 'Skill';
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Skills</h1>
            <p className="text-sm text-gray-600 mt-1">
              Browse and activate pre-built automations for your workspace
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-2 disabled:opacity-50 text-sm"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-8">

          {/* My skills (active + pending/incomplete) */}
          {myConfiguredSkills.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                My Skills
              </h2>
              <div className="space-y-2">
                {myConfiguredSkills.map(skill => {
                  const cfg = skill.configuration as any;
                  const templateName = resolveTemplateName(skill);
                  const templateId = cfg?.templateId ?? '';
                  const typeId = cfg?.skillTypeId ?? templateMap[templateId]?.skillTypeId ?? '';
                  const canConfigure = Boolean(typeId && templateId);
                  const isPaused = skill.status === 'paused';
                  const isPending = skill.status === 'pending';
                  return (
                    <div
                      key={skill.id}
                      className="bg-white border rounded-lg px-5 py-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {skill.status === 'active'
                          ? <CheckCircle size={15} className="text-green-500 flex-shrink-0" />
                          : isPaused
                            ? <Pause size={15} className="text-amber-500 flex-shrink-0" />
                            : <Clock size={15} className="text-amber-400 flex-shrink-0" />
                        }
                        <span className={`text-sm font-medium truncate ${isPaused ? 'text-gray-400' : 'text-gray-900'}`}>
                          {templateName}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          skill.status === 'active'
                            ? 'bg-green-50 text-green-700'
                            : isPaused
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-gray-100 text-gray-500'
                        }`}>
                          {skill.status === 'active' ? 'active' : isPaused ? 'paused' : 'incomplete'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleConfigure(skill)}
                          disabled={!canConfigure}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Settings size={12} /> Configure
                        </button>
                        {!isPending && (
                          <button
                            onClick={() => handleTogglePause(skill)}
                            title={isPaused ? 'Resume skill' : 'Pause skill'}
                            className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors"
                          >
                            {isPaused ? <Play size={14} /> : <Pause size={14} />}
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveSkill(skill.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
                          title="Remove skill"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Category filter */}
          {categories.length > 2 && (
            <div className="flex gap-2 flex-wrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    activeCategory === cat
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Skill type catalog */}
          {loading && skillTypes.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              Loading skills…
            </div>
          ) : visibleTypes.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Zap size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">No skills available yet</p>
              <p className="text-sm mt-1">Platform skills will appear here as they are added.</p>
            </div>
          ) : (
            Object.entries(groupedByCategory).map(([category, types]) => (
              <section key={category}>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  {category}
                </h2>
                <div className="space-y-3">
                  {types.map(skillType => (
                    <div
                      key={skillType.id}
                      className="bg-white border rounded-lg p-5 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex gap-3 min-w-0">
                          <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                            <Zap size={20} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-gray-900">{skillType.name}</h3>
                            <p className="text-sm text-gray-500 mt-0.5">{skillType.description}</p>
                            {skillType.templateNames.length > 0 && (
                              <p className="text-xs text-gray-400 mt-1.5">
                                Templates:{' '}
                                {skillType.templateNames.join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleBrowseTemplates(skillType.id)}
                          className="flex-shrink-0 flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap"
                        >
                          Browse Templates
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
