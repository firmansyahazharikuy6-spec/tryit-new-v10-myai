import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ChatPane } from './components/ChatPane';
import { CollabModal } from './components/CollabModal';
import { CommandPalette } from './components/CommandPalette';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { LandingPage } from './components/LandingPage';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { SkillsModal } from './components/SkillsModal';
import { SyncQueuePopover } from './components/SyncQueuePopover';
import { TopBar } from './components/TopBar';
import { WorkbenchPane } from './components/WorkbenchPane';
import { MyraArenaGame } from './components/game/MyraArenaGame';
import { MediaSuiteView } from './components/studio/MediaSuiteView';
import { useAuth } from './contexts/AuthContext';
import { useCollabWorkspace } from './hooks/useCollabWorkspace';
import { DEFAULT_FOLDERS, STARTER_DEMO_FILES } from './data/catalog';
import { loadWorkspacesFromCloud } from './lib/firebase';
import {
  syncQueueManager,
  type SyncQueueSnapshot,
} from './lib/syncQueueManager';
import { extractAtMentions } from './utils/diffEngine';
import { detectOfficeKindFromPath } from './utils/officeGenerator';
import {
  createStarterSpreadsheetContent,
  isSpreadsheetFile,
} from './utils/spreadsheetGrid';
import {
  createInitialStages,
  detectIntentAndRoute,
  extractArtifactsFromMarkdown,
  isValidSpecialist,
} from './utils/routerEngine';
import type {
  AgentMode,
  ChatMessage,
  EngineProfileId,
  EngineTierId,
  GeminiModelId,
  GroundingSource,
  LayoutMode,
  MediaSuiteTab,
  MemoryNote,
  PersonalizationConfig,
  PipelineStageKey,
  SpecialistSlashId,
  StageStatus,
  TokenMetrics,
  WorkFolder,
  WorkbenchTab,
  WorkspaceFile,
  WorkspaceSession,
} from './types/workspace';

type AppView = 'home' | 'studio' | 'suite' | 'game';

const STORAGE_KEYS = {
  folders: 'myai_studio_folders_v1',
  sessions: 'myai_studio_sessions_v1',
  activeSessionId: 'myai_studio_active_session_v1',
  memory: 'myai_studio_memory_v1',
  config: 'myai_studio_config_v1',
};

function createStarterSession(folderId = 'launch'): WorkspaceSession {
  const now = Date.now();
  return {
    id: `sess-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: 'MYAI × MYRA Blueprint',
    folderId,
    createdAt: now,
    updatedAt: now,
    messages: [],
    files: STARTER_DEMO_FILES.map((f) => ({
      ...f,
      previousContent: f.content,
    })),
    activeFilePath: STARTER_DEMO_FILES[0]?.path ?? null,
  };
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function resolveViewFromLocation(): AppView {
  if (typeof window === 'undefined') return 'home';
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (path.startsWith('/game')) return 'game';
  if (path.startsWith('/suite')) return 'suite';
  if (
    path.startsWith('/app') ||
    params.get('autostart') === '1' ||
    params.has('collab') ||
    params.has('agent') ||
    params.has('prompt')
  ) {
    return 'studio';
  }
  return 'home';
}

function resolveSuiteTabFromLocation(): MediaSuiteTab {
  if (typeof window === 'undefined') return 'image';
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (
    tab === 'image' ||
    tab === 'music' ||
    tab === 'video' ||
    tab === 'voice' ||
    tab === 'maps' ||
    tab === '3d'
  ) {
    return tab;
  }
  return 'image';
}

export default function App() {
  const { user, authReady } = useAuth();
  const [view, setView] = useState<AppView>(() => resolveViewFromLocation());
  const [suiteTab, setSuiteTab] = useState<MediaSuiteTab>(() =>
    resolveSuiteTabFromLocation(),
  );
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [draftSeed, setDraftSeed] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const p = new URLSearchParams(window.location.search).get('prompt');
    return p ? p : null;
  });

  const [folders, setFolders] = useState<WorkFolder[]>(() =>
    loadJson(STORAGE_KEYS.folders, DEFAULT_FOLDERS),
  );
  const [sessions, setSessions] = useState<WorkspaceSession[]>(() => {
    const saved = loadJson<WorkspaceSession[]>(STORAGE_KEYS.sessions, []);
    return saved.length > 0 ? saved : [createStarterSession('launch')];
  });
  const [activeSessionId, setActiveSessionId] = useState<string>(() =>
    loadJson<string>(STORAGE_KEYS.activeSessionId, ''),
  );

  const [memoryNotes, setMemoryNotes] = useState<MemoryNote[]>(() =>
    loadJson(STORAGE_KEYS.memory, []),
  );
  const [config, setConfig] = useState<PersonalizationConfig>(() =>
    loadJson(STORAGE_KEYS.config, {
      language: 'en',
      approach: 'balanced',
      theme: 'dark',
      myraDefault: true,
    }),
  );

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('split');
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>('preview');

  const [agentMode, setAgentMode] = useState<AgentMode>(() => {
    if (typeof window === 'undefined') return 'build';
    const m = new URLSearchParams(window.location.search).get('mode');
    return m === 'build' || m === 'code' || m === 'ask' || m === 'research' ? m : 'build';
  });
  const [activeTier, setActiveTier] = useState<EngineTierId>(() => {
    if (typeof window === 'undefined') return 'auto';
    const t = new URLSearchParams(window.location.search).get('tier');
    return t === 'auto' ||
      t === 'general' ||
      t === 'chats' ||
      t === 'coding' ||
      t === 'flash' ||
      t === 'pro' ||
      t === 'max'
      ? t
      : 'auto';
  });
  const [activeProfile, setActiveProfile] = useState<EngineProfileId>(() => {
    if (typeof window === 'undefined') return 'myai-auto';
    const p = new URLSearchParams(window.location.search).get('profile');
    return p === 'myai-auto' ||
      p === 'gemini' ||
      p === 'gpt' ||
      p === 'claude' ||
      p === 'kimi' ||
      p === 'qoder'
      ? p
      : 'myai-auto';
  });
  const [explicitModel, setExplicitModel] = useState<GeminiModelId>('auto');
  const [activeSpecialist, setActiveSpecialist] = useState<SpecialistSlashId>(() => {
    if (typeof window === 'undefined') return 'myra';
    const a = new URLSearchParams(window.location.search).get('agent');
    return isValidSpecialist(a) ? a : 'myra';
  });
  const [myraEnabled, setMyraEnabled] = useState<boolean>(config.myraDefault);
  const [webSearch, setWebSearch] = useState<boolean>(false);
  const [mapsSearch, setMapsSearch] = useState<boolean>(false);
  const [deepResearch, setDeepResearch] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('collab');
  });
  const [syncQueueOpen, setSyncQueueOpen] = useState(false);
  const [syncSnapshot, setSyncSnapshot] = useState<SyncQueueSnapshot>(() =>
    syncQueueManager.getSnapshot(),
  );
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const activeFolder =
    folders.find((f) => f.id === activeSession?.folderId) ?? folders[0];

  const handleSyncRemoteFiles = useCallback(
    (remoteFiles: WorkspaceFile[], activeRemotePath?: string) => {
      if (!activeSession) return;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                updatedAt: Date.now(),
                files: remoteFiles,
                activeFilePath:
                  remoteFiles.some((f) => f.path === s.activeFilePath)
                    ? s.activeFilePath
                    : activeRemotePath ?? remoteFiles[0]?.path ?? null,
              }
            : s,
        ),
      );
    },
    [activeSession?.id],
  );

  const handleApplyMergedContent = useCallback(
    (filePath: string, mergedContent: string) => {
      if (!activeSession) return;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                files: s.files.map((f) =>
                  f.path === filePath
                    ? { ...f, content: mergedContent, updatedAt: Date.now() }
                    : f,
                ),
              }
            : s,
        ),
      );
    },
    [activeSession?.id],
  );

  const collab = useCollabWorkspace({
    user,
    authReady,
    workspaceId: activeSession?.id ?? 'default-workspace',
    workspaceTitle: activeSession?.title ?? 'Shared Workspace',
    workspaceFiles: activeSession?.files ?? [],
    activeFilePath: activeSession?.activeFilePath ?? null,
    onSyncRemoteFiles: handleSyncRemoteFiles,
    onApplyMergedContent: handleApplyMergedContent,
  });

  // Switch to Code & Files tab automatically once a shared collab link connects
  useEffect(() => {
    if (collab.isCollabActive && new URLSearchParams(window.location.search).has('collab')) {
      setWorkbenchTab('code');
      setCollabOpen(false);
    }
  }, [collab.isCollabActive]);

  // Auto-collapse overlay drawer when crossing down into mobile/tablet viewports
  useEffect(() => {
    let wasDesktop = window.innerWidth >= 1024;
    const onResize = () => {
      const isDesktop = window.innerWidth >= 1024;
      if (wasDesktop && !isDesktop) {
        setSidebarOpen(false);
      }
      wasDesktop = isDesktop;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Sync browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      setView(resolveViewFromLocation());
      setSuiteTab(resolveSuiteTabFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Listen for Google Maps Demo Key quota-exceeded notifications
  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Sync theme class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', config.theme === 'dark');
  }, [config.theme]);

  // Persist workspace state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.folders, JSON.stringify(folders));
      localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
      localStorage.setItem(
        STORAGE_KEYS.activeSessionId,
        JSON.stringify(activeSession?.id ?? ''),
      );
      localStorage.setItem(STORAGE_KEYS.memory, JSON.stringify(memoryNotes));
      localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(config));
    } catch {
      // Ignore storage quota errors
    }
  }, [folders, sessions, activeSession?.id, memoryNotes, config]);

  // Keep reactive offline-first sync queue snapshot synced
  useEffect(() => {
    return syncQueueManager.subscribe(setSyncSnapshot);
  }, []);

  // Hydrate workspaces from Firestore on Google Sign-In (guarding unsynced offline items)
  const hydratedUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      hydratedUidRef.current = null;
      return;
    }
    if (hydratedUidRef.current === user.uid) return;
    hydratedUidRef.current = user.uid;

    void loadWorkspacesFromCloud(user.uid)
      .then((cloudSessions) => {
        if (cloudSessions.length === 0) return;
        const pendingIds = syncQueueManager.getPendingWorkspaceIds(user.uid);
        setSessions((prev) => {
          const seen = new Set(prev.map((s) => s.id));
          const merged = [...prev];
          for (const cs of cloudSessions) {
            if (!seen.has(cs.id) && !pendingIds.has(cs.id)) {
              merged.push(cs);
            }
          }
          return merged;
        });
      })
      .catch(() => {
        // Offline or rule guard handled non-destructively
      });
  }, [user]);

  // Debounced offline-first queue sync of active session to Firestore
  useEffect(() => {
    if (!user || !activeSession || isStreaming) return;
    const timer = window.setTimeout(() => {
      syncQueueManager.enqueue({
        kind: 'workspace:upsert',
        uid: user.uid,
        label: `Save workspace "${activeSession.title}"`,
        payload: { session: activeSession },
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [user, activeSession, isStreaming]);

  // Global Ctrl+K / Cmd+K shortcut when inside studio
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (view !== 'studio') {
          window.history.pushState({}, '', '/app');
          setView('studio');
        }
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view]);

  const updateSessionById = useCallback(
    (sessionId: string, updater: (prev: WorkspaceSession) => WorkspaceSession) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? updater(s) : s)),
      );
    },
    [],
  );

  function handleLaunchStudio(opts?: {
    prompt?: string;
    tier?: EngineTierId;
    specialist?: SpecialistSlashId;
    mode?: AgentMode;
  }) {
    if (opts?.tier) setActiveTier(opts.tier);
    if (opts?.specialist) setActiveSpecialist(opts.specialist);
    if (opts?.mode) setAgentMode(opts.mode);
    if (opts?.prompt) setDraftSeed(opts.prompt);

    window.history.pushState({}, '', '/app');
    setView('studio');
    window.scrollTo({ top: 0 });
  }

  function handleOpenSuite(tab: MediaSuiteTab = 'image') {
    setSuiteTab(tab);
    window.history.pushState({}, '', `/suite?tab=${tab}`);
    setView('suite');
    window.scrollTo({ top: 0 });
  }

  function handleOpenGame() {
    window.history.pushState({}, '', '/game');
    setView('game');
    window.scrollTo({ top: 0 });
  }

  function handleGoHome() {
    window.history.pushState({}, '', '/');
    setView('home');
    window.scrollTo({ top: 0 });
  }

  function handleToggleMapsSearch() {
    setMapsSearch((prev) => {
      const next = !prev;
      if (next) {
        setWebSearch(false);
        if (!userLocation && typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              setUserLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              }),
            () => {
              // Optional location denied cleanly
            },
            { timeout: 6000 },
          );
        }
      }
      return next;
    });
  }

  function handleToggleWebSearch() {
    setWebSearch((prev) => {
      const next = !prev;
      if (next) setMapsSearch(false);
      return next;
    });
  }

  function handleCreateSession(folderId = activeFolder.id) {
    const next = createStarterSession(folderId);
    next.title = 'New Workspace';
    setSessions((prev) => [next, ...prev]);
    setActiveSessionId(next.id);
  }

  function handleSelectFolder(folderId: string) {
    const match = sessions.find((s) => s.folderId === folderId);
    if (match) {
      setActiveSessionId(match.id);
    } else {
      handleCreateSession(folderId);
    }
  }

  function handleCreateFolder(name: string) {
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
    const nextFolder: WorkFolder = {
      id,
      name,
      description: 'Custom work folder',
    };
    setFolders((prev) => [...prev, nextFolder]);
    handleCreateSession(id);
  }

  function handleDeleteSession(sessionId: string) {
    if (user) {
      syncQueueManager.enqueue({
        kind: 'workspace:delete',
        uid: user.uid,
        label: `Delete workspace ${sessionId.slice(0, 14)}`,
        payload: { sessionId },
      });
    }
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionId);
      if (remaining.length === 0) {
        const fresh = createStarterSession(activeFolder.id);
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === sessionId) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  }

  function handleDeleteAllSessions() {
    const fresh = createStarterSession(activeFolder.id);
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
  }

  function handleExportWorkspace() {
    const payload = {
      exportedAt: new Date().toISOString(),
      platform: 'MyAI Studio',
      folders,
      sessions,
      memoryNotes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `myai-studio-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleUpdateFileContent(filePath: string, nextContent: string) {
    if (!activeSession) return;
    const existingFile = activeSession.files.find((f) => f.path === filePath);
    const language = existingFile?.language ?? 'txt';

    updateSessionById(activeSession.id, (s) => ({
      ...s,
      updatedAt: Date.now(),
      files: s.files.map((f) =>
        f.path === filePath
          ? {
              ...f,
              previousContent: f.previousContent ?? f.content,
              content: nextContent,
              updatedAt: Date.now(),
            }
          : f,
      ),
    }));

    if (collab.isCollabActive) {
      collab.pushLocalFileEdit(filePath, language, nextContent);
    }
  }

  function handleCreateFile(filePath: string, initialContentOverride?: string) {
    if (!activeSession) return;
    const ext = filePath.split('.').pop()?.toLowerCase() ?? 'txt';
    const existing = activeSession.files.find((f) => f.path === filePath);
    if (existing) {
      updateSessionById(activeSession.id, (s) => ({
        ...s,
        activeFilePath: filePath,
      }));
      return;
    }
    const lower = filePath.toLowerCase();
    const initialContent =
      initialContentOverride !== undefined
        ? initialContentOverride
        : lower.endsWith('.csv')
          ? createStarterSpreadsheetContent('csv').content
          : lower.endsWith('.xlsx.json') || lower.endsWith('.excel.json')
            ? createStarterSpreadsheetContent('xlsx').content
            : `// ${filePath}\n`;
    const newFile: WorkspaceFile = {
      path: filePath,
      language: ext,
      content: initialContent,
      previousContent: '',
      updatedAt: Date.now(),
    };
    updateSessionById(activeSession.id, (s) => ({
      ...s,
      updatedAt: Date.now(),
      files: [...s.files, newFile],
      activeFilePath: filePath,
    }));
    if (collab.isCollabActive) {
      collab.pushLocalFileEdit(filePath, ext, initialContent);
    }
  }

  function handleRevertFile(filePath: string) {
    if (!activeSession) return;
    const target = activeSession.files.find((f) => f.path === filePath);
    updateSessionById(activeSession.id, (s) => ({
      ...s,
      updatedAt: Date.now(),
      files: s.files.map((f) =>
        f.path === filePath && f.previousContent !== undefined
          ? { ...f, content: f.previousContent, updatedAt: Date.now() }
          : f,
      ),
    }));
    if (collab.isCollabActive && target && target.previousContent !== undefined) {
      collab.pushLocalFileEdit(filePath, target.language, target.previousContent);
    }
  }

  function handleStopStreaming() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
  }

  async function executeAgentTurn(params: {
    sessionId: string;
    rawPrompt: string;
    attachedFiles: { name: string; content: string; size: number }[];
    historyOverride?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    const targetSession = sessions.find((s) => s.id === params.sessionId);
    if (!targetSession || isStreaming) return;

    const atMentions = extractAtMentions(params.rawPrompt);
    const effectiveMapsSearch = mapsSearch || atMentions.includes('maps');
    const effectiveWebSearch = !effectiveMapsSearch && (webSearch || atMentions.includes('web'));
    const effectiveDeepResearch = deepResearch || agentMode === 'research';

    const attachmentContext =
      params.attachedFiles.length > 0
        ? `\n\nAttached files:\n${params.attachedFiles
            .map((f) => `--- ${f.name} ---\n${f.content}`)
            .join('\n\n')}`
        : '';

    const fullPrompt = `${params.rawPrompt}${attachmentContext}`;
    const route = detectIntentAndRoute({
      prompt: params.rawPrompt,
      selectedTier: activeTier,
      activeSpecialist,
      agentMode,
      engineProfile: activeProfile,
      explicitModel,
      myraEnabled,
      webSearch: effectiveWebSearch,
      deepResearch: effectiveDeepResearch,
    });

    const userMessage: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      content: params.rawPrompt,
      createdAt: Date.now(),
      attachments: params.attachedFiles.map((f) => ({
        name: f.name,
        size: f.size,
      })),
    };

    const assistantId = `msg-a-${Date.now() + 1}`;
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now() + 1,
      tier: activeTier,
      resolvedTier: route.resolvedTier,
      routedModel: route.geminiModel,
      engineProfile: activeProfile,
      specialist: route.specialist,
      agentMode,
      myraEnabled,
      stages: createInitialStages(
        route,
        effectiveWebSearch || effectiveMapsSearch || effectiveDeepResearch,
      ),
    };

    const historyToSend =
      params.historyOverride ??
      targetSession.messages
        .filter((m) => !m.error && m.content)
        .map((m) => ({ role: m.role, content: m.content }));

    const nextTitle =
      targetSession.messages.length === 0
        ? params.rawPrompt.replace(/^\/[a-z0-9_-]+\s*/i, '').slice(0, 42) ||
          'Workspace Chat'
        : targetSession.title;

    updateSessionById(params.sessionId, (s) => ({
      ...s,
      title: nextTitle,
      updatedAt: Date.now(),
      messages: [...s.messages, userMessage, assistantPlaceholder],
    }));

    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulatedText = '';
    let doneReceived = false;

    const finalizeAssistantStages = (markErrorIfActive = false) => {
      updateSessionById(params.sessionId, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                stages: m.stages?.map((st) =>
                  st.status === 'active'
                    ? { ...st, status: markErrorIfActive ? 'error' : 'done' }
                    : st,
                ),
              }
            : m,
        ),
      }));
    };

    const commitExtractedFiles = (markdownText: string, metrics?: TokenMetrics, finalRoutedModel?: string) => {
      const extracted = extractArtifactsFromMarkdown(markdownText);
      updateSessionById(params.sessionId, (s) => {
        const mergedFiles = [...s.files];
        for (const nextFile of extracted) {
          const idx = mergedFiles.findIndex((f) => f.path === nextFile.path);
          if (idx >= 0) {
            mergedFiles[idx] = {
              ...nextFile,
              previousContent: mergedFiles[idx].content,
            };
          } else {
            mergedFiles.push({
              ...nextFile,
              previousContent: '',
            });
          }
        }
        return {
          ...s,
          updatedAt: Date.now(),
          files: mergedFiles,
          activeFilePath:
            extracted[0]?.path ??
            s.activeFilePath ??
            mergedFiles[0]?.path ??
            null,
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  metrics: metrics ?? m.metrics,
                  routedModel: finalRoutedModel ?? m.routedModel,
                }
              : m,
          ),
        };
      });

      if (extracted.length > 0) {
        if (collab.isCollabActive) {
          for (const nextFile of extracted) {
            collab.pushLocalFileEdit(
              nextFile.path,
              nextFile.language,
              nextFile.content,
            );
          }
        }
        const hasSpreadsheet = extracted.some((f) => isSpreadsheetFile(f));
        const hasHtmlOrOffice = extracted.some(
          (f) =>
            f.path.toLowerCase().endsWith('.html') ||
            Boolean(detectOfficeKindFromPath(f.path)),
        );
        setWorkbenchTab(
          hasSpreadsheet ? 'grid' : hasHtmlOrOffice ? 'preview' : 'code',
        );
      }
    };

    const processSseFrame = (frame: string) => {
      const eventLine = frame.split('\n').find((l) => l.startsWith('event: '));
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!eventLine || !dataLine) return;

      const eventName = eventLine.slice(7).trim();
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
      } catch {
        return;
      }

      if (eventName === 'route') {
        const routePayload = payload as {
          geminiModel?: string;
          failoverFrom?: string;
          failoverReason?: string;
          specialist?: SpecialistSlashId;
        };
        updateSessionById(params.sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  routedModel: routePayload.geminiModel ?? m.routedModel,
                  failoverFrom: routePayload.failoverFrom ?? m.failoverFrom,
                  failoverReason: routePayload.failoverReason ?? m.failoverReason,
                  specialist: routePayload.specialist ?? m.specialist,
                  stages: m.stages?.map((st) =>
                    st.key === 'execution' && routePayload.geminiModel
                      ? {
                          ...st,
                          detail: routePayload.failoverFrom
                            ? `Failover active: ${routePayload.failoverFrom} → ${routePayload.geminiModel}`
                            : `Streaming via ${routePayload.geminiModel}`,
                        }
                      : st,
                  ),
                }
              : m,
          ),
        }));
      } else if (eventName === 'stage') {
        const { key, status } = payload as {
          key: PipelineStageKey;
          status: StageStatus;
        };
        updateSessionById(params.sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  stages: m.stages?.map((st) =>
                    st.key === key ? { ...st, status } : st,
                  ),
                }
              : m,
          ),
        }));
      } else if (eventName === 'chunk') {
        accumulatedText += String(payload.text ?? '');
        const snapshot = accumulatedText;
        updateSessionById(params.sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, content: snapshot } : m,
          ),
        }));
      } else if (eventName === 'sources') {
        const sources = (payload.sources ?? []) as GroundingSource[];
        updateSessionById(params.sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, sources } : m,
          ),
        }));
      } else if (eventName === 'done') {
        doneReceived = true;
        commitExtractedFiles(
          accumulatedText,
          payload.metrics as TokenMetrics | undefined,
          payload.routedModel as string | undefined,
        );
      } else if (eventName === 'error') {
        updateSessionById(params.sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? { ...m, error: String(payload.message || 'Model execution error') }
              : m,
          ),
        }));
      }
    };

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: fullPrompt,
          tier: activeTier,
          explicitModel,
          engineProfile: activeProfile,
          specialist: activeSpecialist,
          agentMode,
          myraEnabled,
          webSearch: effectiveWebSearch,
          mapsSearch: effectiveMapsSearch,
          userLocation,
          deepResearch: effectiveDeepResearch,
          atMentions,
          language: config.language,
          approach: config.approach,
          memoryNotes,
          workspaceFiles: targetSession.files,
          history: historyToSend,
        }),
      });

      if (!response.ok || !response.body) {
        const errPayload = await response.json().catch(() => ({}));
        const errMsg =
          errPayload.error || `Server responded with status ${response.status}`;
        updateSessionById(params.sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  error: errMsg,
                  stages: m.stages?.map((st) =>
                    st.status === 'active' ? { ...st, status: 'error' } : st,
                  ),
                }
              : m,
          ),
        }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });

        const frames = sseBuffer.split('\n\n');
        sseBuffer = frames.pop() ?? '';
        for (const frame of frames) {
          processSseFrame(frame);
        }
      }

      // Flush remaining decoder bytes and any trailing SSE frame
      sseBuffer += decoder.decode();
      if (sseBuffer.trim()) {
        for (const frame of sseBuffer.split('\n\n')) {
          if (frame.trim()) processSseFrame(frame);
        }
      }

      if (!doneReceived && accumulatedText.trim()) {
        commitExtractedFiles(accumulatedText);
      }
      finalizeAssistantStages(false);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        if (accumulatedText.trim() && !doneReceived) {
          commitExtractedFiles(accumulatedText);
        }
        finalizeAssistantStages(false);
      } else {
        const message =
          err instanceof Error ? err.message : 'Streaming connection failed';
        updateSessionById(params.sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  error: message,
                  stages: m.stages?.map((st) =>
                    st.status === 'active' ? { ...st, status: 'error' } : st,
                  ),
                }
              : m,
          ),
        }));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }

  function handleSendMessage(
    rawPrompt: string,
    attachedFiles: { name: string; content: string; size: number }[],
  ) {
    if (!activeSession) return;
    executeAgentTurn({
      sessionId: activeSession.id,
      rawPrompt,
      attachedFiles,
    });
  }

  function handleRegenerateMessage(assistantMsgId: string) {
    if (!activeSession || isStreaming) return;
    const idx = activeSession.messages.findIndex((m) => m.id === assistantMsgId);
    if (idx <= 0) return;
    const prevUserMsg = [...activeSession.messages]
      .slice(0, idx)
      .reverse()
      .find((m) => m.role === 'user');
    if (!prevUserMsg) return;

    const priorHistory = activeSession.messages
      .slice(0, idx - 1)
      .filter((m) => !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    executeAgentTurn({
      sessionId: activeSession.id,
      rawPrompt: prevUserMsg.content,
      attachedFiles: [],
      historyOverride: priorHistory,
    });
  }

  function handleForkFromMessage(msgId: string) {
    if (!activeSession) return;
    const idx = activeSession.messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;

    const now = Date.now();
    const forked: WorkspaceSession = {
      id: `sess-${now}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${activeSession.title} (Branch)`,
      folderId: activeSession.folderId,
      createdAt: now,
      updatedAt: now,
      messages: activeSession.messages.slice(0, idx + 1),
      files: activeSession.files.map((f) => ({ ...f })),
      activeFilePath: activeSession.activeFilePath,
    };
    setSessions((prev) => [forked, ...prev]);
    setActiveSessionId(forked.id);
  }

  const quotaBanner = mapsQuotaExceeded ? (
    <div
      role="alert"
      className="sticky top-0 z-50 w-full px-4 py-2.5 bg-amber-500 text-zinc-950 text-xs font-medium flex items-center justify-between gap-3 shadow-md"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>
          Google Maps Demo Key quota exceeded for this period.{' '}
          <a
            href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
            target="_blank"
            rel="noreferrer"
            className="underline font-semibold"
          >
            Learn how to configure a project API key
          </a>
          .
        </span>
      </div>
      <button
        type="button"
        onClick={() => setMapsQuotaExceeded(false)}
        aria-label="Dismiss quota warning"
        className="p-1 rounded hover:bg-amber-600/30 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  ) : null;

  if (view === 'game') {
    return <MyraArenaGame onExitGame={() => handleLaunchStudio()} />;
  }

  if (view === 'suite') {
    return (
      <>
        {quotaBanner}
        <MediaSuiteView
          activeTab={suiteTab}
          onChangeTab={(nextTab) => handleOpenSuite(nextTab)}
          onGoHome={handleGoHome}
          onOpenStudio={() => handleLaunchStudio()}
          onOpenGame={handleOpenGame}
        />
      </>
    );
  }

  if (view === 'home') {
    return (
      <>
        {quotaBanner}
        <LandingPage
          theme={config.theme}
          onToggleTheme={() =>
            setConfig((prev) => ({
              ...prev,
              theme: prev.theme === 'dark' ? 'light' : 'dark',
            }))
          }
          onLaunchStudio={handleLaunchStudio}
          onOpenSuite={handleOpenSuite}
          onOpenGame={handleOpenGame}
        />
      </>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100">
      {quotaBanner}
      <div className="flex-1 min-h-0 flex">
        <Sidebar
          open={sidebarOpen}
          folders={folders}
          activeFolderId={activeFolder.id}
          sessions={sessions}
          activeSessionId={activeSession.id}
          activeFiles={activeSession.files}
          activeFilePath={activeSession.activeFilePath}
          onSelectFolder={handleSelectFolder}
          onCreateFolder={handleCreateFolder}
          onSelectSession={setActiveSessionId}
          onCreateSession={handleCreateSession}
          onDeleteSession={handleDeleteSession}
          onDeleteAllSessions={handleDeleteAllSessions}
          onSelectFile={(filePath) => {
            updateSessionById(activeSession.id, (s) => ({
              ...s,
              activeFilePath: filePath,
            }));
            const target = activeSession.files.find((f) => f.path === filePath);
            setWorkbenchTab(
              target && isSpreadsheetFile(target) ? 'grid' : 'code',
            );
            if (typeof window !== 'undefined' && window.innerWidth < 768) {
              setLayoutMode('workbench');
              setSidebarOpen(false);
            }
            if (collab.isCollabActive && target) {
              collab.updateCursorPresence(filePath, target.content, 0, 0, false);
            }
          }}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSuite={handleOpenSuite}
          onOpenGame={handleOpenGame}
          onCloseMobile={() => setSidebarOpen(false)}
        />

        <div className="flex-1 min-w-0 h-full flex flex-col">
          <TopBar
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((p) => !p)}
            onGoHome={handleGoHome}
            onOpenSuite={handleOpenSuite}
            onOpenGame={handleOpenGame}
            folderName={activeFolder.name}
            sessionTitle={
              collab.isCollabActive && collab.sessionMeta
                ? `${collab.sessionMeta.title} · Shared`
                : activeSession.title
            }
            layoutMode={layoutMode}
            onChangeLayout={setLayoutMode}
            theme={config.theme}
            onToggleTheme={() =>
              setConfig((prev) => ({
                ...prev,
                theme: prev.theme === 'dark' ? 'light' : 'dark',
              }))
            }
            onOpenPalette={() => setPaletteOpen(true)}
            onExportWorkspace={handleExportWorkspace}
            isCollabActive={collab.isCollabActive}
            collabSyncStatus={collab.syncStatus}
            collabOnlineCount={collab.activePeers.length + 1}
            onOpenCollab={() => setCollabOpen(true)}
            isOnline={syncSnapshot.isOnline}
            pendingSyncCount={syncSnapshot.pendingCount + syncSnapshot.failedCount}
            isSyncFlushing={syncSnapshot.isFlushing}
            onOpenSyncQueue={() => setSyncQueueOpen(true)}
          />

          {/* Compact mobile pane toggle */}
          <div className="md:hidden px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex gap-2 bg-white dark:bg-[#0D0D10]">
            <button
              type="button"
              onClick={() => setLayoutMode('chat')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                layoutMode !== 'workbench'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Agent Chat
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('workbench')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                layoutMode === 'workbench'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Workbench
            </button>
          </div>

          <main className="flex-1 min-h-0 flex">
            {layoutMode !== 'workbench' && (
              <div
                className={
                  layoutMode === 'split'
                    ? 'w-full md:w-[48%] lg:w-[46%] min-w-0 h-full flex'
                    : 'w-full min-w-0 h-full flex'
                }
              >
                <ChatPane
                  messages={activeSession.messages}
                  workspaceFiles={activeSession.files}
                  isStreaming={isStreaming}
                  agentMode={agentMode}
                  activeTier={activeTier}
                  activeProfile={activeProfile}
                  explicitModel={explicitModel}
                  activeSpecialist={activeSpecialist}
                  myraEnabled={myraEnabled}
                  webSearch={webSearch}
                  mapsSearch={mapsSearch}
                  deepResearch={deepResearch}
                  draftSeed={draftSeed}
                  onClearDraftSeed={() => setDraftSeed(null)}
                  onChangeAgentMode={setAgentMode}
                  onChangeTier={setActiveTier}
                  onChangeProfile={setActiveProfile}
                  onChangeExplicitModel={setExplicitModel}
                  onChangeSpecialist={setActiveSpecialist}
                  onOpenSkills={() => setSkillsOpen(true)}
                  onToggleMyra={() => setMyraEnabled((p) => !p)}
                  onToggleWebSearch={handleToggleWebSearch}
                  onToggleMapsSearch={handleToggleMapsSearch}
                  onToggleDeepResearch={() => setDeepResearch((p) => !p)}
                  onSendMessage={handleSendMessage}
                  onRegenerateMessage={handleRegenerateMessage}
                  onForkFromMessage={handleForkFromMessage}
                  onStopStreaming={handleStopStreaming}
                  onOpenArtifactInWorkbench={() => {
                    setLayoutMode('split');
                    setWorkbenchTab('preview');
                  }}
                />
              </div>
            )}

            {(layoutMode === 'split' || layoutMode === 'workbench') && (
              <div
                className={
                  layoutMode === 'split'
                    ? 'hidden md:flex flex-1 min-w-0 h-full'
                    : 'flex flex-1 min-w-0 h-full'
                }
              >
                <WorkbenchPane
                  files={activeSession.files}
                  activeFilePath={activeSession.activeFilePath}
                  activeTab={workbenchTab}
                  onChangeTab={setWorkbenchTab}
                  onSelectFile={(p) => {
                    updateSessionById(activeSession.id, (s) => ({
                      ...s,
                      activeFilePath: p,
                    }));
                    const target = activeSession.files.find((f) => f.path === p);
                    if (collab.isCollabActive && target) {
                      collab.updateCursorPresence(p, target.content, 0, 0, false);
                    }
                  }}
                  onUpdateFileContent={handleUpdateFileContent}
                  onCreateFile={handleCreateFile}
                  onRevertFile={handleRevertFile}
                  onOpenDiagnostics={() => setDiagnosticsOpen(true)}
                  onSendPromptToAgent={(prompt) => {
                    setLayoutMode('split');
                    handleSendMessage(prompt, []);
                  }}
                  isCollabActive={collab.isCollabActive}
                  collabSyncStatus={collab.syncStatus}
                  collabPeers={collab.activePeers}
                  collabFileMetas={collab.fileMetas}
                  onOpenCollab={() => setCollabOpen(true)}
                  onEditorCursorChange={collab.updateCursorPresence}
                />
              </div>
            )}
          </main>
        </div>

        <CommandPalette
          open={paletteOpen}
          activeTier={activeTier}
          activeSpecialist={activeSpecialist}
          onClose={() => setPaletteOpen(false)}
          onSelectTier={setActiveTier}
          onSelectSpecialist={setActiveSpecialist}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAudit={() => {
            setLayoutMode('split');
            setWorkbenchTab('audit');
          }}
          onExportJson={handleExportWorkspace}
        />

        <CollabModal
          open={collabOpen}
          isCollabActive={collab.isCollabActive}
          collabSessionId={collab.collabSessionId}
          pendingSessionId={collab.pendingSessionId}
          sessionMeta={collab.sessionMeta}
          members={collab.members}
          activePeers={collab.activePeers}
          ownedSessions={collab.ownedSessions}
          syncStatus={collab.syncStatus}
          collabError={collab.collabError}
          workspaceTitle={activeSession.title}
          fileCount={activeSession.files.length}
          onStartSession={collab.startCollabSession}
          onJoinSession={collab.joinExistingCollabSession}
          onLeaveSession={collab.leaveCollabSession}
          onEndSession={collab.endCollabSession}
          onChangeShareMode={collab.changeShareMode}
          onInviteMember={collab.inviteMemberByUid}
          onRevokeMember={collab.revokeMember}
          onClose={() => setCollabOpen(false)}
        />

        <SyncQueuePopover
          open={syncQueueOpen}
          isSignedIn={Boolean(user)}
          snapshot={syncSnapshot}
          onRetryNow={() => syncQueueManager.retryAllNow()}
          onClearFailed={() => syncQueueManager.clearFailed()}
          onClose={() => setSyncQueueOpen(false)}
        />

        <DiagnosticsModal
          open={diagnosticsOpen}
          sessions={sessions}
          onClose={() => setDiagnosticsOpen(false)}
        />

        <SettingsModal
          open={settingsOpen}
          config={config}
          memoryNotes={memoryNotes}
          onUpdateConfig={setConfig}
          onAddMemoryNote={(text) =>
            setMemoryNotes((prev) => [
              ...prev,
              { id: `mem-${Date.now()}`, text, createdAt: Date.now() },
            ])
          }
          onDeleteMemoryNote={(id) =>
            setMemoryNotes((prev) => prev.filter((n) => n.id !== id))
          }
          onClose={() => setSettingsOpen(false)}
        />

        <SkillsModal
          open={skillsOpen}
          activeSpecialist={activeSpecialist}
          activeProfile={activeProfile}
          onClose={() => setSkillsOpen(false)}
          onSelectSkill={(skillId) => setActiveSpecialist(skillId)}
          onRunSkillPrompt={(skillId, starterPrompt) => {
            setActiveSpecialist(skillId);
            setDraftSeed(starterPrompt);
          }}
          onSelectProfile={(profileId) => setActiveProfile(profileId)}
        />
      </div>
    </div>
  );
}

