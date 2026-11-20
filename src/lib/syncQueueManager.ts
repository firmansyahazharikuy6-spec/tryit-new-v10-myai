import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  commitCollabFileEdit,
  deleteWorkspaceFromCloud,
  saveCreationRecord,
  saveGameScore,
  syncWorkspaceToCloud,
} from './firebase';
import {
  clearFailedOperations,
  enqueueSyncOperation,
  getDueOperations,
  getPendingWorkspaceIds,
  isRetryableSyncError,
  markOperationFailure,
  OFFLINE_QUEUE_STORAGE_KEY,
  parseQueueFromStorage,
  removeOperation,
  resetRetryTimersForReconnect,
  serializeQueueForStorage,
  type NewQueuedSyncOp,
  type QueuedSyncOp,
} from '../utils/offlineSyncQueue';

export interface SyncQueueSnapshot {
  isOnline: boolean;
  isFlushing: boolean;
  activeUid: string | null;
  items: QueuedSyncOp[];
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

type CollabFlushCallback = (result: {
  sessionId: string;
  filePath: string;
  content: string;
  version: number;
  autoMerged: boolean;
}) => void;

type QueueListener = (snapshot: SyncQueueSnapshot) => void;

class OfflineSyncQueueManager {
  private queue: QueuedSyncOp[] = [];
  private isOnline =
    typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isFlushing = false;
  private activeUid: string | null = null;
  private lastSyncedAt: number | null = null;
  private lastError: string | null = null;
  private retryTimer: number | null = null;
  private listeners = new Set<QueueListener>();
  private collabCallbacks = new Set<CollabFlushCallback>();
  private initialized = false;

  constructor() {
    this.init();
  }

  private init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    try {
      this.queue = parseQueueFromStorage(
        window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY),
      );
    } catch {
      this.queue = [];
    }

    this.activeUid = auth.currentUser?.uid ?? null;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.queue = resetRetryTimersForReconnect(this.queue, this.activeUid);
      this.persistQueue();
      this.emit();
      void this.flush();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      if (this.retryTimer !== null) {
        window.clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      this.emit();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isOnline) {
        void this.flush();
      }
    });

    onAuthStateChanged(auth, (user) => {
      this.activeUid = user?.uid ?? null;
      this.emit();
      if (user && this.isOnline) {
        void this.flush();
      }
    });
  }

  private persistQueue() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        OFFLINE_QUEUE_STORAGE_KEY,
        serializeQueueForStorage(this.queue),
      );
    } catch {
      // Non-fatal storage quota guard
    }
  }

  public getSnapshot(): SyncQueueSnapshot {
    const scoped = this.activeUid
      ? this.queue.filter((item) => item.uid === this.activeUid)
      : [];
    const failedCount = scoped.filter((i) => i.failedPermanently).length;
    const pendingCount = scoped.length - failedCount;
    return {
      isOnline: this.isOnline,
      isFlushing: this.isFlushing,
      activeUid: this.activeUid,
      items: scoped,
      pendingCount,
      failedCount,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    };
  }

  private emit() {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public onCollabFileFlushed(cb: CollabFlushCallback): () => void {
    this.collabCallbacks.add(cb);
    return () => {
      this.collabCallbacks.delete(cb);
    };
  }

  public getPendingWorkspaceIds(uid: string | null): Set<string> {
    return getPendingWorkspaceIds(this.queue, uid);
  }

  public enqueue(
    op: NewQueuedSyncOp,
    options?: { immediate?: boolean },
  ): void {
    this.queue = enqueueSyncOperation(this.queue, op, Date.now());
    this.persistQueue();
    this.emit();

    if (options?.immediate !== false && this.isOnline) {
      void this.flush();
    } else {
      this.scheduleNextRetry();
    }
  }

  public clearFailed(): void {
    this.queue = clearFailedOperations(this.queue);
    this.lastError = null;
    this.persistQueue();
    this.emit();
  }

  public async retryAllNow(): Promise<void> {
    this.isOnline =
      typeof navigator !== 'undefined' ? navigator.onLine : this.isOnline;
    this.queue = resetRetryTimersForReconnect(this.queue, this.activeUid);
    this.lastError = null;
    this.persistQueue();
    this.emit();
    await this.flush();
  }

  private scheduleNextRetry() {
    if (typeof window === 'undefined') return;
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (!this.isOnline || !this.activeUid) return;

    const pending = this.queue.filter(
      (i) => i.uid === this.activeUid && !i.failedPermanently,
    );
    if (pending.length === 0) return;

    const earliest = Math.min(...pending.map((i) => i.nextRetryAt));
    const delayMs = Math.max(250, Math.min(earliest - Date.now(), 60000));
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delayMs);
  }

  public async flush(): Promise<void> {
    if (this.isFlushing) return;
    const uid = this.activeUid ?? auth.currentUser?.uid ?? null;
    const online =
      typeof navigator !== 'undefined' ? navigator.onLine : this.isOnline;
    this.isOnline = online;

    const due = getDueOperations(this.queue, uid, online, Date.now());
    if (due.length === 0) {
      this.scheduleNextRetry();
      this.emit();
      return;
    }

    this.isFlushing = true;
    this.emit();

    try {
      for (const op of due) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          this.isOnline = false;
          break;
        }
        // Re-fetch latest version of op in case coalesced during await
        const currentOp = this.queue.find((q) => q.id === op.id);
        if (!currentOp) continue;

        try {
          await this.executeOperation(currentOp);
          this.queue = removeOperation(this.queue, currentOp.id);
          this.lastSyncedAt = Date.now();
          this.lastError = null;
          this.persistQueue();
          this.emit();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const retryable = isRetryableSyncError(err);
          this.lastError = msg;
          this.queue = markOperationFailure(
            this.queue,
            currentOp.id,
            msg,
            retryable,
            Date.now(),
          );
          this.persistQueue();
          this.emit();
        }
      }
    } finally {
      this.isFlushing = false;
      this.emit();
      this.scheduleNextRetry();
    }
  }

  private async executeOperation(op: QueuedSyncOp): Promise<void> {
    switch (op.kind) {
      case 'workspace:upsert':
        await syncWorkspaceToCloud(op.uid, op.payload.session);
        return;
      case 'workspace:delete':
        await deleteWorkspaceFromCloud(op.payload.sessionId);
        return;
      case 'creation:create':
        await saveCreationRecord(op.uid, op.payload);
        return;
      case 'game:score':
        await saveGameScore(op.uid, op.payload);
        return;
      case 'collab:file-edit': {
        const res = await commitCollabFileEdit({
          sessionId: op.payload.sessionId,
          filePath: op.payload.filePath,
          language: op.payload.language,
          baseContent: op.payload.baseContent,
          localContent: op.payload.localContent,
          uid: op.uid,
          displayName: op.payload.displayName,
        });
        for (const cb of this.collabCallbacks) {
          cb({
            sessionId: op.payload.sessionId,
            filePath: op.payload.filePath,
            content: res.content,
            version: res.version,
            autoMerged: res.autoMerged,
          });
        }
        return;
      }
    }
  }
}

export const syncQueueManager = new OfflineSyncQueueManager();
