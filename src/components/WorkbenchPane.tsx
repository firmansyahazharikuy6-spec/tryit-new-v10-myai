import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode2,
  FilePlus2,
  FileSpreadsheet,
  GitCompare,
  Laptop,
  Radio,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Smartphone,
  Table2,
  Terminal,
  Trash2,
  Users,
} from 'lucide-react';
import { MYAI_AUDIT_ITEMS } from '../data/catalog';
import type { CollabFileMeta } from '../hooks/useCollabWorkspace';
import { computeLineDiff } from '../utils/diffEngine';
import {
  exportOfficeFileDownload,
  parseOfficeSpecFromFile,
} from '../utils/officeGenerator';
import { buildPreviewDocument } from '../utils/routerEngine';
import { OfficePreview } from './OfficePreview';
import { SpreadsheetDataGrid } from './SpreadsheetDataGrid';
import type {
  CollabPresencePeer,
  CollabSyncStatus,
  SandboxLogEntry,
  WorkbenchTab,
  WorkspaceFile,
} from '../types/workspace';

interface WorkbenchPaneProps {
  files: WorkspaceFile[];
  activeFilePath: string | null;
  activeTab: WorkbenchTab;
  onChangeTab: (tab: WorkbenchTab) => void;
  onSelectFile: (path: string) => void;
  onUpdateFileContent: (path: string, nextContent: string) => void;
  onCreateFile: (path: string, initialContent?: string) => void;
  onRevertFile: (path: string) => void;
  onOpenDiagnostics: () => void;
  onSendPromptToAgent: (prompt: string) => void;
  isCollabActive?: boolean;
  collabSyncStatus?: CollabSyncStatus;
  collabPeers?: CollabPresencePeer[];
  collabFileMetas?: Record<string, CollabFileMeta>;
  onOpenCollab?: () => void;
  onEditorCursorChange?: (
    filePath: string,
    content: string,
    selectionStart: number,
    selectionEnd: number,
    isTyping: boolean,
  ) => void;
}

export function WorkbenchPane({
  files,
  activeFilePath,
  activeTab,
  onChangeTab,
  onSelectFile,
  onUpdateFileContent,
  onCreateFile,
  onRevertFile,
  onOpenDiagnostics,
  onSendPromptToAgent,
  isCollabActive = false,
  collabSyncStatus = 'offline',
  collabPeers = [],
  collabFileMetas = {},
  onOpenCollab,
  onEditorCursorChange,
}: WorkbenchPaneProps) {
  const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop');
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [copied, setCopied] = useState(false);

  const [codeViewMode, setCodeViewMode] = useState<'edit' | 'diff'>('edit');
  const [addingFile, setAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const [consoleOpen, setConsoleOpen] = useState(false);
  const [logs, setLogs] = useState<SandboxLogEntry[]>([]);

  const selectedFile =
    files.find((f) => f.path === activeFilePath) ?? files[0] ?? null;

  const selectedOfficeSpec = useMemo(
    () => (selectedFile ? parseOfficeSpecFromFile(selectedFile) : null),
    [selectedFile],
  );

  const previewOfficeTarget = useMemo(() => {
    if (selectedFile && selectedOfficeSpec) {
      return { file: selectedFile, spec: selectedOfficeSpec };
    }
    for (const f of files) {
      const spec = parseOfficeSpecFromFile(f);
      if (spec) return { file: f, spec };
    }
    return null;
  }, [files, selectedFile, selectedOfficeSpec]);

  const isShowingOfficePreview = Boolean(
    previewOfficeTarget &&
      (selectedOfficeSpec ||
        !selectedFile?.path.toLowerCase().endsWith('.html')),
  );

  const previewHtml = useMemo(() => buildPreviewDocument(files), [files]);

  const diffLines = useMemo(() => {
    if (!selectedFile) return [];
    const baseline = selectedFile.previousContent ?? selectedFile.content;
    return computeLineDiff(baseline, selectedFile.content);
  }, [selectedFile]);

  const hasDiffChanges = Boolean(
    selectedFile &&
      selectedFile.previousContent !== undefined &&
      selectedFile.previousContent !== selectedFile.content,
  );

  // Listen to live sandbox runtime logs & errors via postMessage
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'myai-sandbox-log') {
        const entry: SandboxLogEntry = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          level: data.level || 'log',
          message: String(data.message ?? ''),
          timestamp: Date.now(),
        };
        setLogs((prev) => [...prev.slice(-49), entry]);
        if (entry.level === 'error') {
          setConsoleOpen(true);
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function handleCopyCode() {
    if (!selectedFile) return;
    navigator.clipboard.writeText(selectedFile.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleDownloadActiveFile() {
    if (!selectedFile) return;
    const blob = new Blob([selectedFile.content], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.path.split('/').pop() || 'artifact.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCreateFileSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    onCreateFile(trimmed);
    setNewFileName('');
    setAddingFile(false);
    setCodeViewMode('edit');
  }

  const errorLogCount = logs.filter((l) => l.level === 'error').length;

  return (
    <section
      aria-label="Product workbench"
      className="flex-1 min-w-0 h-full flex flex-col border-l border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#0D0D10] text-zinc-900 dark:text-zinc-100"
    >
      {/* Workbench Tab Header */}
      <div className="h-11 shrink-0 px-3 flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800/80">
        <div
          role="tablist"
          aria-label="Workbench views"
          className="flex items-center gap-1"
        >
          {(
            [
              { id: 'preview', label: 'Preview', icon: Eye },
              { id: 'code', label: 'Code & Files', icon: Code2 },
              { id: 'grid', label: 'Data Grid', icon: Table2 },
              { id: 'audit', label: 'MYAI Audit', icon: ShieldCheck },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => onChangeTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-zinc-900 text-white dark:bg-zinc-800 dark:text-white'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === 'preview' && !isShowingOfficePreview && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setConsoleOpen((p) => !p)}
              aria-expanded={consoleOpen}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-colors whitespace-nowrap cursor-pointer ${
                errorLogCount > 0
                  ? 'text-red-500 bg-red-500/10'
                  : consoleOpen
                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="tabular-nums">Console ({logs.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewportMode('desktop')}
              aria-label="Desktop preview width"
              aria-pressed={viewportMode === 'desktop'}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewportMode === 'desktop'
                  ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewportMode('mobile')}
              aria-label="Mobile preview width"
              aria-pressed={viewportMode === 'mobile'}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewportMode === 'mobile'
                  ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setLogs([]);
                setRefreshSeed((n) => n + 1);
              }}
              aria-label="Refresh sandbox preview"
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {activeTab === 'code' && selectedFile && (
          <div className="flex items-center gap-1.5">
            {onOpenCollab && (
              <button
                type="button"
                onClick={onOpenCollab}
                className={`hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border whitespace-nowrap cursor-pointer ${
                  isCollabActive
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {isCollabActive ? (
                  <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                ) : (
                  <Users className="w-3 h-3 text-indigo-500" />
                )}
                <span>
                  {isCollabActive
                    ? collabSyncStatus === 'saving'
                      ? 'Syncing...'
                      : collabSyncStatus === 'merged'
                        ? 'Merged!'
                        : `Live (${collabPeers.length + 1})`
                    : 'Live Collab'}
                </span>
              </button>
            )}
            <div className="flex items-center p-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setCodeViewMode('edit')}
                className={`px-2 py-0.5 text-[11px] font-medium rounded cursor-pointer ${
                  codeViewMode === 'edit'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white'
                    : 'text-zinc-500'
                }`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setCodeViewMode('diff')}
                className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded cursor-pointer ${
                  codeViewMode === 'diff'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white'
                    : 'text-zinc-500'
                }`}
              >
                <GitCompare className="w-3 h-3" />
                <span>Diff</span>
              </button>
            </div>
            {hasDiffChanges && (
              <button
                type="button"
                onClick={() => onRevertFile(selectedFile.path)}
                aria-label="Revert file changes"
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-zinc-200 dark:border-zinc-800 text-amber-600 dark:text-amber-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Revert</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadActiveFile}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
            {selectedOfficeSpec && (
              <button
                type="button"
                onClick={() =>
                  void exportOfficeFileDownload(selectedOfficeSpec, selectedFile.path)
                }
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>
                  Export{' '}
                  {selectedOfficeSpec.kind === 'word'
                    ? '.docx'
                    : selectedOfficeSpec.kind === 'ppt'
                      ? '.pptx'
                      : '.xlsx'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tab Body */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === 'preview' && (
          isShowingOfficePreview && previewOfficeTarget ? (
            <OfficePreview
              spec={previewOfficeTarget.spec}
              filePath={previewOfficeTarget.file.path}
              onEditInGrid={() => onChangeTab('grid')}
            />
          ) : (
            <>
              <div className="flex-1 min-h-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-3">
                <iframe
                  key={refreshSeed}
                  title="Live workspace preview"
                  sandbox="allow-scripts allow-forms allow-modals"
                  srcDoc={previewHtml}
                  className={`h-full bg-white rounded-lg border border-zinc-200 dark:border-zinc-800 transition-all ${
                    viewportMode === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
                  }`}
                />
              </div>

            {consoleOpen && (
              <div className="h-44 shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-950 text-zinc-200 flex flex-col">
                <div className="px-3 py-1.5 border-b border-zinc-800 flex items-center justify-between text-xs">
                  <span className="font-mono text-zinc-400">
                    Sandbox Runtime Console
                  </span>
                  <div className="flex items-center gap-2">
                    {errorLogCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const lastErr = logs
                            .filter((l) => l.level === 'error')
                            .slice(-1)[0];
                          if (lastErr) {
                            onSendPromptToAgent(
                              `/debugger Fix this runtime error in @${selectedFile?.path ?? 'index.html'}: ${lastErr.message}`,
                            );
                          }
                        }}
                        className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white text-[11px] font-medium cursor-pointer"
                      >
                        Fix with /debugger
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setLogs([])}
                      aria-label="Clear sandbox console"
                      className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 font-mono text-xs space-y-1">
                  {logs.length === 0 ? (
                    <p className="text-zinc-500">
                      No runtime logs emitted yet. console.log() or errors from your preview appear here.
                    </p>
                  ) : (
                    logs.map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex items-start gap-2 ${
                          entry.level === 'error'
                            ? 'text-red-400'
                            : entry.level === 'warn'
                              ? 'text-amber-400'
                              : 'text-zinc-300'
                        }`}
                      >
                        <span className="text-zinc-500 tabular-nums shrink-0">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="uppercase text-[10px] shrink-0 mt-0.5">
                          [{entry.level}]
                        </span>
                        <span className="break-all">{entry.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
          )
        )}

        {activeTab === 'code' && (
          <div className="w-full h-full flex">
            <div className="w-52 shrink-0 border-r border-zinc-200 dark:border-zinc-800/80 p-2 overflow-y-auto bg-zinc-50 dark:bg-[#0B0B0E]">
              <div className="px-2 py-1 flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Files ({files.length})
                </span>
                <button
                  type="button"
                  onClick={() => setAddingFile((p) => !p)}
                  aria-label="Create new file"
                  className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {addingFile && (
                <form onSubmit={handleCreateFileSubmit} className="mt-1 mb-2 flex gap-1">
                  <label htmlFor="new-workspace-file" className="sr-only">
                    New file path
                  </label>
                  <input
                    id="new-workspace-file"
                    type="text"
                    autoFocus
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="styles.css"
                    className="flex-1 min-w-0 px-2 py-1 text-xs font-mono rounded bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 text-[11px] rounded bg-indigo-600 text-white cursor-pointer"
                  >
                    Add
                  </button>
                </form>
              )}

              {files.length === 0 ? (
                <p className="px-2 py-2 text-xs text-zinc-500">
                  No files generated yet.
                </p>
              ) : (
                <div className="space-y-0.5 mt-1">
                  {files.map((file) => {
                    const isSelected = selectedFile?.path === file.path;
                    const modified =
                      file.previousContent !== undefined &&
                      file.previousContent !== file.content;
                    const filePeers = collabPeers.filter(
                      (p) => p.activeFilePath === file.path,
                    );
                    return (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() => onSelectFile(file.path)}
                        className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs font-mono text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600/15 text-indigo-600 dark:text-indigo-300 font-medium'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{file.path}</span>
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          {filePeers.map((peer) => (
                            <span
                              key={peer.uid}
                              title={`${peer.displayName} (Ln ${peer.cursorLine})`}
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: peer.color }}
                            />
                          ))}
                          {modified && (
                            <span className="text-[10px] text-amber-500">
                              M
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 h-full flex flex-col bg-zinc-950 text-zinc-100">
              {selectedFile ? (
                <>
                  <div className="px-3 py-1.5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-zinc-400">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{selectedFile.path}</span>
                      {isCollabActive && collabFileMetas[selectedFile.path] && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 whitespace-nowrap">
                          v{collabFileMetas[selectedFile.path].version} ·{' '}
                          {collabFileMetas[selectedFile.path].lastEditorName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isCollabActive &&
                        collabPeers
                          .filter((p) => p.activeFilePath === selectedFile.path)
                          .map((peer) => (
                            <span
                              key={peer.uid}
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 whitespace-nowrap"
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: peer.color }}
                              />
                              <span>
                                {peer.displayName} Ln {peer.cursorLine}:
                                {peer.cursorCol}
                              </span>
                            </span>
                          ))}
                      <span className="tabular-nums">
                        {selectedFile.content.split('\n').length} lines
                      </span>
                    </div>
                  </div>

                  {codeViewMode === 'edit' ? (
                    <>
                      <label htmlFor="live-code-editor" className="sr-only">
                        Edit {selectedFile.path}
                      </label>
                      <textarea
                        id="live-code-editor"
                        value={selectedFile.content}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          onUpdateFileContent(selectedFile.path, nextVal);
                          onEditorCursorChange?.(
                            selectedFile.path,
                            nextVal,
                            e.target.selectionStart ?? 0,
                            e.target.selectionEnd ?? 0,
                            true,
                          );
                        }}
                        onSelect={(e) => {
                          const target = e.currentTarget;
                          onEditorCursorChange?.(
                            selectedFile.path,
                            target.value,
                            target.selectionStart ?? 0,
                            target.selectionEnd ?? 0,
                            false,
                          );
                        }}
                        onBlur={(e) => {
                          onEditorCursorChange?.(
                            selectedFile.path,
                            e.currentTarget.value,
                            e.currentTarget.selectionStart ?? 0,
                            e.currentTarget.selectionEnd ?? 0,
                            false,
                          );
                        }}
                        spellCheck={false}
                        className="flex-1 w-full p-4 bg-transparent font-mono text-xs leading-6 text-zinc-100 focus:outline-none resize-none"
                      />
                    </>
                  ) : (
                    <div className="flex-1 overflow-auto p-3 font-mono text-xs leading-5">
                      {!hasDiffChanges ? (
                        <p className="text-zinc-500 p-2">
                          No uncommitted changes compared to the previous snapshot for {selectedFile.path}. Edit the file or let MYRA update it to inspect line diffs.
                        </p>
                      ) : (
                        diffLines.map((line, idx) => (
                          <div
                            key={idx}
                            className={`flex gap-3 px-2 py-0.5 ${
                              line.type === 'add'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : line.type === 'remove'
                                  ? 'bg-red-500/15 text-red-300'
                                  : 'text-zinc-400'
                            }`}
                          >
                            <span className="w-8 text-right select-none text-zinc-600 tabular-nums shrink-0">
                              {line.lineNumberOld ?? ''}
                            </span>
                            <span className="w-8 text-right select-none text-zinc-600 tabular-nums shrink-0">
                              {line.lineNumberNew ?? ''}
                            </span>
                            <span className="w-3 select-none shrink-0">
                              {line.type === 'add'
                                ? '+'
                                : line.type === 'remove'
                                  ? '-'
                                  : ' '}
                            </span>
                            <span className="whitespace-pre-wrap break-all">
                              {line.text}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
                  Select a file to inspect or edit.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'grid' && (
          <SpreadsheetDataGrid
            files={files}
            activeFilePath={activeFilePath}
            onSelectFile={onSelectFile}
            onUpdateFileContent={onUpdateFileContent}
            onCreateSpreadsheetFile={(path, initialContent) =>
              onCreateFile(path, initialContent)
            }
            onAskExcelAgent={() =>
              onSendPromptToAgent(
                '/excel Create a quarterly revenue & expense financial workbook (.xlsx.json) with SUM and AVERAGE formulas.',
              )
            }
          />
        )}

        {activeTab === 'audit' && (
          <div className="w-full h-full overflow-y-auto p-5 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-white">
                  MYAI v10.6 to MyAI Studio Upgrade Matrix
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Architectural transition from single-box chat to Emergent / Qoder / Qwen workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenDiagnostics}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Run Live Diagnostics</span>
              </button>
            </div>

            <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-zinc-500 dark:text-zinc-400">
                    <th className="py-2.5 px-3 font-medium">Layer</th>
                    <th className="py-2.5 px-3 font-medium">MYAI v10.6 Finding</th>
                    <th className="py-2.5 px-3 font-medium">MyAI Studio Architecture</th>
                    <th className="py-2.5 px-3 font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {MYAI_AUDIT_ITEMS.map((item) => (
                    <tr
                      key={item.dimension}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                    >
                      <td className="py-3 px-3 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap align-top">
                        {item.dimension}
                      </td>
                      <td className="py-3 px-3 text-zinc-600 dark:text-zinc-400 align-top">
                        {item.legacyV106}
                      </td>
                      <td className="py-3 px-3 text-zinc-800 dark:text-zinc-200 align-top">
                        {item.nextGenStudio}
                      </td>
                      <td className="py-3 px-3 text-indigo-600 dark:text-indigo-400 align-top">
                        {item.impact}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Want MYRA to generate a tailored Cloudflare + Express migration plan?
              </p>
              <button
                type="button"
                onClick={() =>
                  onSendPromptToAgent(
                    '/architect Generate a concrete migration plan to upgrade MYAI v10.6 into a scalable Emergent/Qoder-style workspace with resilient guest authentication and BYOK provider routing.',
                  )
                }
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
              >
                Ask /architect for Migration Plan
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
