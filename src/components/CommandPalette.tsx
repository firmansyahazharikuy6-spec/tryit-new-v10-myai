import { useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  Download,
  Search,
  Settings,
  Terminal,
  X,
} from 'lucide-react';
import { ENGINE_TIERS, SPECIALIST_AGENTS } from '../data/catalog';
import type { EngineTierId, SpecialistSlashId } from '../types/workspace';

interface CommandPaletteProps {
  open: boolean;
  activeTier: EngineTierId;
  activeSpecialist: SpecialistSlashId;
  onClose: () => void;
  onSelectTier: (tier: EngineTierId) => void;
  onSelectSpecialist: (specialist: SpecialistSlashId) => void;
  onOpenDiagnostics: () => void;
  onOpenSettings: () => void;
  onOpenAudit: () => void;
  onExportJson: () => void;
}

export function CommandPalette({
  open,
  activeTier,
  activeSpecialist,
  onClose,
  onSelectTier,
  onSelectSpecialist,
  onOpenDiagnostics,
  onOpenSettings,
  onOpenAudit,
  onExportJson,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filteredTiers = ENGINE_TIERS.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.tagline.toLowerCase().includes(q) ||
      t.backendModel.toLowerCase().includes(q),
  );
  const filteredAgents = SPECIALIST_AGENTS.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.command.toLowerCase().includes(q) ||
      a.role.toLowerCase().includes(q),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="All tools"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <label htmlFor="command-palette-search" className="sr-only">
            Search engines, specialist agents, and tools
          </label>
          <input
            id="command-palette-search"
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search engine tiers, /slash specialists, or workspace tools..."
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close all tools dialog"
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-3 space-y-5">
          {filteredTiers.length > 0 && (
            <section>
              <h3 className="px-2 mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                MyAI Engine Tiers
              </h3>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {filteredTiers.map((tier) => {
                  const selected = tier.id === activeTier;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => {
                        onSelectTier(tier.id);
                        onClose();
                      }}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/40'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/70 border border-transparent'
                      }`}
                    >
                      <Cpu className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                          {tier.name}{' '}
                          <span className="font-mono text-[11px] text-zinc-500">
                            · {tier.backendModel}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {tier.tagline}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {filteredAgents.length > 0 && (
            <section>
              <h3 className="px-2 mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                MYRA &amp; Multi-Lab Specialists ({SPECIALIST_AGENTS.length} Slash Commands)
              </h3>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {filteredAgents.map((agent) => {
                  const selected = agent.id === activeSpecialist;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => {
                        onSelectSpecialist(agent.id);
                        onClose();
                      }}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/40'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/70 border border-transparent'
                      }`}
                    >
                      <Terminal className="w-4 h-4 mt-0.5 text-zinc-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                          <span className="font-mono text-indigo-600 dark:text-indigo-400">
                            {agent.command}
                          </span>{' '}
                          · {agent.name}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {agent.role}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <h3 className="px-2 mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Workspace Tools
            </h3>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  onOpenDiagnostics();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/70 cursor-pointer"
              >
                <Activity className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>
                  <strong className="font-medium">Provider Status &amp; MYRA Diagnostics</strong>
                  <span className="text-zinc-500"> · Live API latency &amp; readiness check</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenAudit();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/70 cursor-pointer"
              >
                <Cpu className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>
                  <strong className="font-medium">MYAI v10.6 Audit &amp; Architecture Blueprint</strong>
                  <span className="text-zinc-500"> · Open upgrade matrix in workbench</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenSettings();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/70 cursor-pointer"
              >
                <Settings className="w-4 h-4 text-zinc-500 shrink-0" />
                <span>
                  <strong className="font-medium">Memory &amp; Personalization</strong>
                  <span className="text-zinc-500"> · On-device notes, language &amp; approach</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportJson();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/70 cursor-pointer"
              >
                <Download className="w-4 h-4 text-zinc-500 shrink-0" />
                <span>
                  <strong className="font-medium">Export Workspace (.json)</strong>
                  <span className="text-zinc-500"> · Download all sessions and files</span>
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
