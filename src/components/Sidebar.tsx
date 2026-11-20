import { useMemo, useState } from 'react';
import {
  Activity,
  Box,
  FileCode2,
  FolderOpen,
  FolderPlus,
  Gamepad2,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { filterWorkspaceFiles } from '../utils/fileFilter';
import type {
  MediaSuiteTab,
  WorkFolder,
  WorkspaceFile,
  WorkspaceSession,
} from '../types/workspace';

interface SidebarProps {
  open: boolean;
  folders: WorkFolder[];
  activeFolderId: string;
  sessions: WorkspaceSession[];
  activeSessionId: string;
  activeFiles: WorkspaceFile[];
  activeFilePath: string | null;
  onSelectFolder: (folderId: string) => void;
  onCreateFolder: (name: string) => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: (folderId?: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onDeleteAllSessions: () => void;
  onSelectFile: (filePath: string) => void;
  onOpenDiagnostics: () => void;
  onOpenSettings: () => void;
  onOpenSuite: (tab: MediaSuiteTab) => void;
  onOpenGame: () => void;
  onCloseMobile: () => void;
}

export function Sidebar({
  open,
  folders,
  activeFolderId,
  sessions,
  activeSessionId,
  activeFiles,
  activeFilePath,
  onSelectFolder,
  onCreateFolder,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onDeleteAllSessions,
  onSelectFile,
  onOpenDiagnostics,
  onOpenSettings,
  onOpenSuite,
  onOpenGame,
  onCloseMobile,
}: SidebarProps) {
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderDraft, setFolderDraft] = useState('');
  const [fileQuery, setFileQuery] = useState('');

  const filteredFiles = useMemo(
    () => filterWorkspaceFiles(activeFiles, fileQuery),
    [activeFiles, fileQuery],
  );

  if (!open) {
    return null;
  }

  const folderSessions = sessions.filter((s) => s.folderId === activeFolderId);

  function handleFolderSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = folderDraft.trim();
    if (!trimmed) return;
    onCreateFolder(trimmed);
    setFolderDraft('');
    setAddingFolder(false);
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onCloseMobile}
        className="fixed inset-0 z-30 bg-black/50 lg:hidden"
      />
      <aside
        aria-label="Workspace navigation"
        className="fixed inset-y-0 left-0 z-40 lg:static lg:z-auto w-[264px] shrink-0 h-full flex flex-col border-r border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/95 dark:bg-[#0D0D10] text-zinc-900 dark:text-zinc-100 shadow-2xl lg:shadow-none"
      >
        <div className="px-4 h-[52px] flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark variant="myai" className="w-6 h-5 text-zinc-900 dark:text-white shrink-0" />
            <span className="font-display font-semibold text-sm tracking-tight whitespace-nowrap">
              MyAI Studio
            </span>
          </div>
          <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
            MYRA
          </span>
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={() => onCreateSession(activeFolderId)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New workspace</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-5">
          <div>
            <div className="flex items-center justify-between px-2 mb-1.5">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Work folders
              </span>
              <button
                type="button"
                onClick={() => setAddingFolder((prev) => !prev)}
                aria-label="Create work folder"
                className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>

            {addingFolder && (
              <form onSubmit={handleFolderSubmit} className="mb-2 px-1 flex gap-1.5">
                <label htmlFor="new-folder-name" className="sr-only">
                  Folder name
                </label>
                <input
                  id="new-folder-name"
                  type="text"
                  value={folderDraft}
                  onChange={(e) => setFolderDraft(e.target.value)}
                  placeholder="Folder name..."
                  autoFocus
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-md bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-500 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Add
                </button>
              </form>
            )}

            <div className="space-y-0.5">
              {folders.map((folder) => {
                const isActive = folder.id === activeFolderId;
                const count = sessions.filter((s) => s.folderId === folder.id).length;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => onSelectFolder(folder.id)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-900 dark:text-white font-medium'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/40 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between px-2 mb-1.5">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 tabular-nums">
                Sessions ({folderSessions.length})
              </span>
              <button
                type="button"
                onClick={onDeleteAllSessions}
                disabled={sessions.length === 0}
                className="text-[11px] text-zinc-500 hover:text-red-500 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap cursor-pointer"
              >
                Clear all
              </button>
            </div>

            {folderSessions.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-zinc-500 dark:text-zinc-500">
                No sessions in this folder yet.
              </p>
            ) : (
              <div className="space-y-0.5">
                {folderSessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <div
                      key={session.id}
                      className={`group flex items-center gap-1 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-zinc-200/80 dark:bg-zinc-800/90 text-zinc-900 dark:text-white'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectSession(session.id)}
                        className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 text-left text-xs cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{session.title}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSession(session.id)}
                        aria-label={`Delete session ${session.title}`}
                        className="p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 text-zinc-400 hover:text-red-500 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between px-2 mb-1.5">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Workspace files
              </span>
              <span className="text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                {fileQuery.trim()
                  ? `${filteredFiles.length}/${activeFiles.length}`
                  : activeFiles.length}
              </span>
            </div>

            <div className="relative mb-2">
              <label htmlFor="sidebar-file-search" className="sr-only">
                Filter workspace files
              </label>
              <Search
                aria-hidden="true"
                className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                id="sidebar-file-search"
                type="text"
                role="searchbox"
                value={fileQuery}
                onChange={(e) => setFileQuery(e.target.value)}
                placeholder="Filter workspace files..."
                className="w-full pl-8 pr-7 py-1.5 rounded-lg text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {fileQuery && (
                <button
                  type="button"
                  onClick={() => setFileQuery('')}
                  aria-label="Clear file filter"
                  className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {activeFiles.length === 0 ? (
              <p className="px-2.5 py-1.5 text-xs text-zinc-500">
                No files in this workspace yet.
              </p>
            ) : filteredFiles.length === 0 ? (
              <p className="px-2.5 py-1.5 text-xs text-zinc-500">
                No files matching &ldquo;{fileQuery.trim()}&rdquo;.
              </p>
            ) : (
              <div className="space-y-0.5 max-h-44 overflow-y-auto pr-0.5">
                {filteredFiles.map((file) => {
                  const isActive = file.path === activeFilePath;
                  const modified =
                    file.previousContent !== undefined &&
                    file.previousContent !== file.content;
                  return (
                    <button
                      key={file.path}
                      type="button"
                      title={file.path}
                      onClick={() => onSelectFile(file.path)}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-mono text-left transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-indigo-600/15 text-indigo-600 dark:text-indigo-300 font-medium'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <FileCode2 className="w-3.5 h-3.5 shrink-0 opacity-80" />
                        <span className="truncate">{file.path}</span>
                      </span>
                      {modified && (
                        <span className="text-[10px] text-amber-500 shrink-0">
                          M
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="px-2 mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Multimodal &amp; 3D Labs
            </div>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => onOpenSuite('image')}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>Media &amp; Voice Lab</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenSuite('maps')}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Google Maps Explorer</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenSuite('3d')}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 cursor-pointer"
              >
                <Box className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>3D Orbital Core</span>
              </button>
              <button
                type="button"
                onClick={onOpenGame}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 cursor-pointer"
              >
                <Gamepad2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>MYRA: Core Defense</span>
              </button>
            </div>
          </div>
        </nav>

        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 space-y-1">
          <button
            type="button"
            onClick={onOpenDiagnostics}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>Provider &amp; MYRA diagnostics</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span>Memory &amp; personalization</span>
          </button>
        </div>
      </aside>
    </>
  );
}
