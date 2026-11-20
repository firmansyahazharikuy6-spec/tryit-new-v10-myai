import type { WorkspaceSession } from '../types/workspace';

export type SyncOperationKind =
  | 'workspace:upsert'
  | 'workspace:delete'
  | 'collab:file-edit'
  | 'creation:create'
  | 'game:score';

export interface CollabFileEditPayload {
  sessionId: string;
  filePath: string;
  language: string;
  baseContent: string;
  localContent: string;
  displayName: string;
}

export interface CreationCreatePayload {
  kind: 'image' | 'music' | 'video' | 'transcript';
  title: string;
  prompt: string;
  model: string;
  summaryText?: string;
}

export interface GameScorePayload {
  playerName: string;
  score: number;
  wave: number;
  kills: number;
  durationSec: number;
}

export type QueuedSyncOp =
  | {
      id: string;
      kind: 'workspace:upsert';
      dedupeKey: string;
      uid: string;
      label: string;
      payload: { session: WorkspaceSession };
      attempts: number;
      nextRetryAt: number;
      createdAt: number;
      updatedAt: number;
      lastError?: string;
      failedPermanently?: boolean;
    }
  | {
      id: string;
      kind: 'workspace:delete';
      dedupeKey: string;
      uid: string;
      label: string;
      payload: { sessionId: string };
      attempts: number;
      nextRetryAt: number;
      createdAt: number;
      updatedAt: number;
      lastError?: string;
      failedPermanently?: boolean;
    }
  | {
      id: string;
      kind: 'collab:file-edit';
      dedupeKey: string;
      uid: string;
      label: string;
      payload: CollabFileEditPayload;
      attempts: number;
      nextRetryAt: number;
      createdAt: number;
      updatedAt: number;
      lastError?: string;
      failedPermanently?: boolean;
    }
  | {
      id: string;
      kind: 'creation:create';
      dedupeKey: string;
      uid: string;
      label: string;
      payload: CreationCreatePayload;
      attempts: number;
      nextRetryAt: number;
      createdAt: number;
      updatedAt: number;
      lastError?: string;
      failedPermanently?: boolean;
    }
  | {
      id: string;
      kind: 'game:score';
      dedupeKey: string;
      uid: string;
      label: string;
      payload: GameScorePayload;
      attempts: number;
      nextRetryAt: number;
      createdAt: number;
      updatedAt: number;
      lastError?: string;
      failedPermanently?: boolean;
    };

export type NewQueuedSyncOp =
  | {
      kind: 'workspace:upsert';
      uid: string;
      label: string;
      payload: { session: WorkspaceSession };
    }
  | {
      kind: 'workspace:delete';
      uid: string;
      label: string;
      payload: { sessionId: string };
    }
  | {
      kind: 'collab:file-edit';
      uid: string;
      label: string;
      payload: CollabFileEditPayload;
    }
  | {
      kind: 'creation:create';
      uid: string;
      label: string;
      payload: CreationCreatePayload;
    }
  | {
      kind: 'game:score';
      uid: string;
      label: string;
      payload: GameScorePayload;
    };

export const OFFLINE_QUEUE_STORAGE_KEY = 'myai_studio_offline_sync_queue_v1';
export const MAX_OFFLINE_QUEUE_ITEMS = 80;
export const MAX_RETRY_ATTEMPTS = 8;

export function buildDedupeKey(op: NewQueuedSyncOp): string {
  switch (op.kind) {
    case 'workspace:upsert':
      return `ws:${op.uid}:${op.payload.session.id}`;
    case 'workspace:delete':
      return `ws:${op.uid}:${op.payload.sessionId}`;
    case 'collab:file-edit':
      return `collab:${op.uid}:${op.payload.sessionId}:${op.payload.filePath}`;
    case 'creation:create':
      return `cr:${op.uid}:${op.payload.kind}:${op.payload.title}:${op.payload.prompt.slice(0, 40)}`;
    case 'game:score':
      return `gs:${op.uid}:${op.payload.score}:${op.payload.wave}:${op.payload.kills}`;
  }
}

export function computeBackoffDelayMs(
  attempts: number,
  baseMs = 1500,
  maxMs = 60000,
): number {
  const safeAttempts = Math.max(1, Math.min(attempts, 12));
  const raw = baseMs * Math.pow(2, safeAttempts - 1);
  return Math.min(maxMs, raw);
}

export function isRetryableSyncError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : JSON.stringify(err ?? '');
  const lower = msg.toLowerCase();

  if (
    lower.includes('permission-denied') ||
    lower.includes('permission_denied') ||
    lower.includes('missing or insufficient permissions') ||
    lower.includes('invalid-argument') ||
    lower.includes('invite-only')
  ) {
    return false;
  }

  return true;
}

export function enqueueSyncOperation(
  queue: QueuedSyncOp[],
  op: NewQueuedSyncOp,
  nowMs = Date.now(),
): QueuedSyncOp[] {
  const dedupeKey = buildDedupeKey(op);
  const existingIdx = queue.findIndex(
    (item) => item.dedupeKey === dedupeKey && !item.failedPermanently,
  );

  if (existingIdx >= 0) {
    const existing = queue[existingIdx];
    let updated: QueuedSyncOp;

    if (op.kind === 'collab:file-edit' && existing.kind === 'collab:file-edit') {
      // Preserve earliest unsynced baseContent so offline edits still 3-way merge cleanly
      updated = {
        ...existing,
        label: op.label,
        payload: {
          ...op.payload,
          baseContent: existing.payload.baseContent,
        },
        nextRetryAt: nowMs,
        updatedAt: nowMs,
        failedPermanently: false,
      };
    } else {
      updated = {
        id: existing.id,
        kind: op.kind,
        dedupeKey,
        uid: op.uid,
        label: op.label,
        payload: op.payload,
        attempts: existing.attempts,
        nextRetryAt: nowMs,
        createdAt: existing.createdAt,
        updatedAt: nowMs,
        lastError: existing.lastError,
        failedPermanently: false,
      } as QueuedSyncOp;
    }

    const next = [...queue];
    next[existingIdx] = updated;
    return next;
  }

  const created: QueuedSyncOp = {
    id: `sync-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
    kind: op.kind,
    dedupeKey,
    uid: op.uid,
    label: op.label,
    payload: op.payload,
    attempts: 0,
    nextRetryAt: nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
  } as QueuedSyncOp;

  const combined = [...queue, created];
  if (combined.length > MAX_OFFLINE_QUEUE_ITEMS) {
    return combined.slice(combined.length - MAX_OFFLINE_QUEUE_ITEMS);
  }
  return combined;
}

export function getDueOperations(
  queue: QueuedSyncOp[],
  uid: string | null,
  isOnline: boolean,
  nowMs = Date.now(),
): QueuedSyncOp[] {
  if (!uid || !isOnline) return [];
  return queue.filter(
    (item) =>
      item.uid === uid &&
      !item.failedPermanently &&
      item.attempts < MAX_RETRY_ATTEMPTS &&
      item.nextRetryAt <= nowMs,
  );
}

export function markOperationFailure(
  queue: QueuedSyncOp[],
  opId: string,
  errorMessage: string,
  retryable: boolean,
  nowMs = Date.now(),
): QueuedSyncOp[] {
  return queue.map((item) => {
    if (item.id !== opId) return item;
    const nextAttempts = item.attempts + 1;
    const permanent = !retryable || nextAttempts >= MAX_RETRY_ATTEMPTS;
    return {
      ...item,
      attempts: nextAttempts,
      nextRetryAt: permanent
        ? Number.MAX_SAFE_INTEGER
        : nowMs + computeBackoffDelayMs(nextAttempts),
      updatedAt: nowMs,
      lastError: errorMessage.slice(0, 300),
      failedPermanently: permanent,
    };
  });
}

export function resetRetryTimersForReconnect(
  queue: QueuedSyncOp[],
  uid: string | null,
  nowMs = Date.now(),
): QueuedSyncOp[] {
  return queue.map((item) => {
    if (uid && item.uid !== uid) return item;
    if (item.failedPermanently && item.attempts < MAX_RETRY_ATTEMPTS) {
      return item;
    }
    // Reset backoff timer and transient attempt cap when connectivity returns
    if (!item.failedPermanently || item.attempts >= MAX_RETRY_ATTEMPTS) {
      const wasPermissionDenied =
        item.lastError && !isRetryableSyncError(item.lastError);
      if (wasPermissionDenied) return item;
      return {
        ...item,
        attempts: 0,
        nextRetryAt: nowMs,
        failedPermanently: false,
      };
    }
    return item;
  });
}

export function removeOperation(
  queue: QueuedSyncOp[],
  opId: string,
): QueuedSyncOp[] {
  return queue.filter((item) => item.id !== opId);
}

export function clearFailedOperations(queue: QueuedSyncOp[]): QueuedSyncOp[] {
  return queue.filter((item) => !item.failedPermanently);
}

export function getPendingWorkspaceIds(
  queue: QueuedSyncOp[],
  uid: string | null,
): Set<string> {
  const ids = new Set<string>();
  if (!uid) return ids;
  for (const item of queue) {
    if (item.uid !== uid) continue;
    if (item.kind === 'workspace:upsert') {
      ids.add(item.payload.session.id);
    } else if (item.kind === 'workspace:delete') {
      ids.add(item.payload.sessionId);
    }
  }
  return ids;
}

export function parseQueueFromStorage(raw: string | null): QueuedSyncOp[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QueuedSyncOp =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.kind === 'string' &&
        typeof item.dedupeKey === 'string' &&
        typeof item.uid === 'string' &&
        item.payload !== null &&
        typeof item.payload === 'object',
    );
  } catch {
    return [];
  }
}

export function serializeQueueForStorage(queue: QueuedSyncOp[]): string {
  return JSON.stringify(queue.slice(-MAX_OFFLINE_QUEUE_ITEMS));
}
