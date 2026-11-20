import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  RefreshCw,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import type { SyncQueueSnapshot } from '../lib/syncQueueManager';

interface SyncQueuePopoverProps {
  open: boolean;
  isSignedIn: boolean;
  snapshot: SyncQueueSnapshot;
  onRetryNow: () => Promise<void>;
  onClearFailed: () => void;
  onClose: () => void;
}

export function SyncQueuePopover({
  open,
  isSignedIn,
  snapshot,
  onRetryNow,
  onClearFailed,
  onClose,
}: SyncQueuePopoverProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Offline Sync Queue"
      className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-16 bg-black/40 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111115] text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden text-xs">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {snapshot.isOnline ? (
              <Wifi className="w-4 h-4 text-emerald-500" />
            ) : (
              <CloudOff className="w-4 h-4 text-amber-500" />
            )}
            <div>
              <h2 className="font-display font-semibold text-sm">
                Offline-First Sync Queue
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {snapshot.isOnline
                  ? 'Connected · Auto-retrying queued writes'
                  : 'Offline · Edits buffered safely in localStorage'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sync queue dialog"
            className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
          {!isSignedIn ? (
            <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Your workspaces and file edits are saved locally in your browser even while offline. Sign in with Google in the top bar to enable automatic cloud backup and cross-device retry sync.
            </div>
          ) : snapshot.items.length === 0 ? (
            <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 flex items-center gap-3 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <div>
                <div className="font-medium">All changes synced to Firestore</div>
                {snapshot.lastSyncedAt && (
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Last synced at{' '}
                    {new Date(snapshot.lastSyncedAt).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {snapshot.items.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{item.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase shrink-0 ${
                        item.failedPermanently
                          ? 'bg-red-500/15 text-red-500'
                          : 'bg-amber-500/15 text-amber-500'
                      }`}
                    >
                      {item.failedPermanently
                        ? 'Failed'
                        : `Queued (retry #${item.attempts})`}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                    {item.kind} · updated{' '}
                    {new Date(item.updatedAt).toLocaleTimeString()}
                  </div>
                  {item.lastError && (
                    <div className="flex items-start gap-1.5 text-[11px] text-red-500 pt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="break-all">{item.lastError}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {isSignedIn && snapshot.items.length > 0 && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              {snapshot.failedCount > 0 ? (
                <button
                  type="button"
                  onClick={onClearFailed}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-red-500 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Failed</span>
                </button>
              ) : (
                <span className="text-[11px] text-zinc-500">
                  {snapshot.pendingCount} pending{' '}
                  {snapshot.pendingCount === 1 ? 'change' : 'changes'}
                </span>
              )}

              <button
                type="button"
                onClick={() => void onRetryNow()}
                disabled={!snapshot.isOnline || snapshot.isFlushing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${snapshot.isFlushing ? 'animate-spin' : ''}`}
                />
                <span>
                  {snapshot.isFlushing ? 'Syncing...' : 'Retry Sync Now'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
