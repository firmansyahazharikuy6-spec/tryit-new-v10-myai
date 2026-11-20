import { useEffect, useState } from 'react';
import {
  Check,
  Cpu,
  FileSpreadsheet,
  FileText,
  Layers,
  Play,
  Presentation,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AGENT_SKILLS,
  ENGINE_PROFILES,
  SKILL_ECOSYSTEMS,
} from '../data/skills';
import type {
  EngineProfileId,
  SkillEcosystem,
  SpecialistSlashId,
} from '../types/workspace';

interface SkillsModalProps {
  open: boolean;
  activeSpecialist: SpecialistSlashId;
  activeProfile: EngineProfileId;
  onClose: () => void;
  onSelectSkill: (skillId: SpecialistSlashId) => void;
  onRunSkillPrompt: (skillId: SpecialistSlashId, starterPrompt: string) => void;
  onSelectProfile: (profileId: EngineProfileId) => void;
}

const ECOSYSTEM_BADGE: Record<SkillEcosystem, string> = {
  Office: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
  Gemini: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30',
  GPT: 'bg-teal-500/15 text-teal-600 dark:text-teal-300 border-teal-500/30',
  Claude: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',
  Kimi: 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30',
  Qoder: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30',
  MYRA: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/30',
};

export function SkillsModal({
  open,
  activeSpecialist,
  activeProfile,
  onClose,
  onSelectSkill,
  onRunSkillPrompt,
  onSelectProfile,
}: SkillsModalProps) {
  const [ecosystem, setEcosystem] =
    useState<(typeof SKILL_ECOSYSTEMS)[number]>('All');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filteredSkills = AGENT_SKILLS.filter((skill) => {
    const matchesEco = ecosystem === 'All' || skill.ecosystem === ecosystem;
    if (!matchesEco) return false;
    if (!q) return true;
    return (
      skill.name.toLowerCase().includes(q) ||
      skill.command.toLowerCase().includes(q) ||
      skill.ecosystem.toLowerCase().includes(q) ||
      skill.role.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agent Skills and Engine Profiles"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-indigo-500 shrink-0" />
            <div>
              <h2 className="font-display text-sm font-semibold">
                Agent Skills &amp; Multi-Lab Engine Hub
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Office (.docx / .pptx / .xlsx) &amp; frontier skills from Gemini, GPT, Claude, Kimi, and Qoder.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close skills hub"
            className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Engine Profiles */}
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                <span>Engine Workflow Profiles (All Backed by Stable Failover Core)</span>
              </h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {ENGINE_PROFILES.map((profile) => {
                const selected = profile.id === activeProfile;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => onSelectProfile(profile.id)}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-500/15'
                        : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{profile.name}</span>
                      {selected ? (
                        <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      ) : (
                        <span className="text-[10px] font-mono text-zinc-500">
                          {profile.vendor}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      {profile.summary}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Filter & Search Bar */}
          <section className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Skill ecosystem filter">
                {SKILL_ECOSYSTEMS.map((eco) => (
                  <button
                    key={eco}
                    type="button"
                    onClick={() => setEcosystem(eco)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      ecosystem === eco
                        ? 'bg-indigo-600 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {eco}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <label htmlFor="skills-modal-search" className="sr-only">
                  Search skills
                </label>
                <Search
                  aria-hidden="true"
                  className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  id="skills-modal-search"
                  type="text"
                  role="searchbox"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search /word, claude, qoder..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear skills search"
                    className="p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {filteredSkills.map((skill) => {
                const isActive = activeSpecialist === skill.id;
                const SkillIcon =
                  skill.outputKind === 'docx'
                    ? FileText
                    : skill.outputKind === 'pptx'
                      ? Presentation
                      : skill.outputKind === 'xlsx'
                        ? FileSpreadsheet
                        : Layers;

                return (
                  <div
                    key={skill.id}
                    className={`p-3.5 rounded-xl border transition-colors flex flex-col justify-between gap-3 ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <SkillIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span className="text-xs font-semibold truncate">
                            {skill.name}
                          </span>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${ECOSYSTEM_BADGE[skill.ecosystem]}`}
                        >
                          {skill.ecosystem}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-[11px] font-mono text-indigo-600 dark:text-indigo-400">
                        <span>{skill.command}</span>
                        <span className="text-zinc-400">·</span>
                        <span className="text-zinc-500 uppercase">
                          {skill.outputKind}
                        </span>
                      </div>

                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
                        {skill.role}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSkill(skill.id);
                          onClose();
                        }}
                        className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {isActive ? 'Active Skill' : 'Select Skill'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onRunSkillPrompt(skill.id, skill.starterPrompt);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 py-1.5 px-2.5 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 cursor-pointer"
                      >
                        <Play className="w-3 h-3" />
                        <span>Try Prompt</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
