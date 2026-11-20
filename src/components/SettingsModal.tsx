import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type {
  AgentApproach,
  InterfaceLanguage,
  MemoryNote,
  PersonalizationConfig,
} from '../types/workspace';

interface SettingsModalProps {
  open: boolean;
  config: PersonalizationConfig;
  memoryNotes: MemoryNote[];
  onUpdateConfig: (next: PersonalizationConfig) => void;
  onAddMemoryNote: (text: string) => void;
  onDeleteMemoryNote: (id: string) => void;
  onClose: () => void;
}

export function SettingsModal({
  open,
  config,
  memoryNotes,
  onUpdateConfig,
  onAddMemoryNote,
  onDeleteMemoryNote,
  onClose,
}: SettingsModalProps) {
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    onAddMemoryNote(trimmed);
    setNoteDraft('');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Memory and personalization"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="font-display text-sm font-semibold">
              Memory &amp; Personalization
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Saved locally on your device and injected into MYAI &amp; MYRA context.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close personalization dialog"
            className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="pref-language"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
              >
                Response Language
              </label>
              <select
                id="pref-language"
                value={config.language}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    language: e.target.value as InterfaceLanguage,
                  })
                }
                className="w-full px-3 py-2 rounded-lg text-xs border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="en">Auto / Match User (English &amp; ID)</option>
                <option value="id">Indonesian (Bahasa Indonesia)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="pref-approach"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
              >
                Agent Approach
              </label>
              <select
                id="pref-approach"
                value={config.approach}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    approach: e.target.value as AgentApproach,
                  })
                }
                className="w-full px-3 py-2 rounded-lg text-xs border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="balanced">Balanced</option>
                <option value="coding-partner">Coding Partner</option>
                <option value="tutor">Step-by-Step Tutor</option>
                <option value="concise">Concise &amp; Direct</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between py-2 border-y border-zinc-200 dark:border-zinc-800">
            <div>
              <div className="text-xs font-medium">Theme</div>
              <div className="text-[11px] text-zinc-500">
                Choose dark obsidian or clean light studio surface
              </div>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              {(['dark', 'light'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onUpdateConfig({ ...config, theme: mode })}
                  className={`px-3 py-1 rounded-md text-xs font-medium capitalize cursor-pointer ${
                    config.theme === mode
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium text-zinc-800 dark:text-zinc-200 mb-2">
              On-Device Memory Notes ({memoryNotes.length})
            </h3>
            <form onSubmit={handleAddNote} className="flex gap-2 mb-3">
              <label htmlFor="memory-note-input" className="sr-only">
                Add memory note
              </label>
              <input
                id="memory-note-input"
                type="text"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="e.g. Always use TypeScript strict mode and Tailwind v4..."
                className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save Note</span>
              </button>
            </form>

            {memoryNotes.length === 0 ? (
              <p className="text-xs text-zinc-500 py-2">
                No memory notes saved yet. Add preferences MYRA should remember across sessions.
              </p>
            ) : (
              <div className="space-y-1.5">
                {memoryNotes.map((note) => (
                  <div
                    key={note.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-xs"
                  >
                    <span className="text-zinc-700 dark:text-zinc-300">{note.text}</span>
                    <button
                      type="button"
                      onClick={() => onDeleteMemoryNote(note.id)}
                      aria-label={`Delete memory note: ${note.text}`}
                      className="p-1 text-zinc-400 hover:text-red-500 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
