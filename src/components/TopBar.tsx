import {
  Box,
  Cloud,
  CloudOff,
  Command,
  Download,
  Gamepad2,
  Home,
  LogIn,
  LogOut,
  Moon,
  PanelLeft,
  Radio,
  RefreshCw,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type {
  CollabSyncStatus,
  LayoutMode,
  MediaSuiteTab,
  ThemeMode,
} from '../types/workspace';

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onGoHome: () => void;
  onOpenSuite: (tab?: MediaSuiteTab) => void;
  onOpenGame: () => void;
  folderName: string;
  sessionTitle: string;
  layoutMode: LayoutMode;
  onChangeLayout: (mode: LayoutMode) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  onExportWorkspace: () => void;
  isCollabActive: boolean;
  collabSyncStatus: CollabSyncStatus;
  collabOnlineCount: number;
  onOpenCollab: () => void;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncFlushing: boolean;
  onOpenSyncQueue: () => void;
}

export function TopBar({
  sidebarOpen,
  onToggleSidebar,
  onGoHome,
  onOpenSuite,
  onOpenGame,
  folderName,
  sessionTitle,
  layoutMode,
  onChangeLayout,
  theme,
  onToggleTheme,
  onOpenPalette,
  onExportWorkspace,
  isCollabActive,
  collabSyncStatus,
  collabOnlineCount,
  onOpenCollab,
  isOnline,
  pendingSyncCount,
  isSyncFlushing,
  onOpenSyncQueue,
}: TopBarProps) {
  const { user, authBusy, signInGoogle, signOutUser } = useAuth();

  return (
    <header className="h-[52px] shrink-0 px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-[#09090B]/90 backdrop-blur">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Hide workspace sidebar' : 'Show workspace sidebar'}
          aria-expanded={sidebarOpen}
          className="p-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors shrink-0 cursor-pointer"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onGoHome}
          aria-label="MyAI main website"
          className="p-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors shrink-0 cursor-pointer"
        >
          <Home className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-xs min-w-0">
          <span className="hidden lg:inline text-zinc-500 dark:text-zinc-400 whitespace-nowrap shrink-0">
            {folderName}
          </span>
          <span aria-hidden="true" className="hidden lg:inline text-zinc-400 dark:text-zinc-600">
            /
          </span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[130px] sm:max-w-[200px]">
            {sessionTitle}
          </span>
        </div>
      </div>

      <div
        role="group"
        aria-label="Workspace layout view"
        className="hidden md:flex items-center gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
      >
        {(
          [
            { id: 'chat', label: 'Chat' },
            { id: 'split', label: 'Split' },
            { id: 'workbench', label: 'Workbench' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChangeLayout(item.id)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              layoutMode === item.id
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onOpenSuite('image')}
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          <span>Media Suite</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenSuite('3d')}
          aria-label="Open 3D Core Showcase"
          className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Box className="w-3.5 h-3.5 text-sky-500" />
          <span>3D Core</span>
        </button>

        <button
          type="button"
          onClick={onOpenGame}
          aria-label="Launch 3D Arena Game"
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Gamepad2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>3D Game</span>
        </button>

        <button
          type="button"
          onClick={onOpenPalette}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Command className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Tools</span>
        </button>

        <button
          type="button"
          onClick={onOpenSyncQueue}
          aria-label="Open Offline Sync Queue"
          title={
            !isOnline
              ? `Offline mode (${pendingSyncCount} changes buffered locally)`
              : pendingSyncCount > 0
                ? `${pendingSyncCount} changes queued for Firestore retry`
                : 'Cloud sync status'
          }
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            !isOnline
              ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
              : pendingSyncCount > 0
                ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          {!isOnline ? (
            <CloudOff className="w-3.5 h-3.5 text-amber-500" />
          ) : isSyncFlushing ? (
            <RefreshCw className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
          ) : (
            <Cloud className="w-3.5 h-3.5 text-emerald-500" />
          )}
          <span className="hidden xl:inline tabular-nums">
            {!isOnline
              ? pendingSyncCount > 0
                ? `Offline (${pendingSyncCount})`
                : 'Offline'
              : pendingSyncCount > 0
                ? `Queued (${pendingSyncCount})`
                : 'Synced'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenCollab}
          aria-label="Open Real-Time Collaborative Workspace"
          title={
            isCollabActive
              ? `Collaborative session (${collabSyncStatus})`
              : 'Share & co-edit files in real time'
          }
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            isCollabActive
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25'
              : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          {isCollabActive ? (
            <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
          ) : (
            <Users className="w-3.5 h-3.5 text-indigo-500" />
          )}
          <span className="hidden sm:inline">
            {isCollabActive ? `Live (${collabOnlineCount})` : 'Collab'}
          </span>
        </button>

        {user ? (
          <button
            type="button"
            onClick={() => void signOutUser()}
            disabled={authBusy}
            title={`Signed in as ${user.displayName || user.email || 'Google User'}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="max-w-[78px] truncate">{user.displayName?.split(' ')[0] || 'Account'}</span>
            <LogOut className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void signInGoogle()}
            disabled={authBusy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5 text-indigo-500" />
            <span>Sign In</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors shrink-0 cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={onExportWorkspace}
          aria-label="Export workspace chats as JSON"
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
}
