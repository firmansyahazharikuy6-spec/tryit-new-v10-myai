import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearFailedOperations,
  computeBackoffDelayMs,
  enqueueSyncOperation,
  getDueOperations,
  getPendingWorkspaceIds,
  isRetryableSyncError,
  markOperationFailure,
  parseQueueFromStorage,
  removeOperation,
  resetRetryTimersForReconnect,
  serializeQueueForStorage,
  type QueuedSyncOp,
} from './offlineSyncQueue';
import type { WorkspaceSession } from '../types/workspace';

function mockSession(id: string, title: string): WorkspaceSession {
  return {
    id,
    title,
    folderId: 'launch',
    createdAt: 1000,
    updatedAt: 2000,
    messages: [],
    files: [{ path: 'index.html', language: 'html', content: '<h1>hi</h1>', updatedAt: 2000 }],
    activeFilePath: 'index.html',
  };
}

test('enqueueSyncOperation coalesces workspace upserts and cancels superseded upserts on delete', () => {
  let queue: QueuedSyncOp[] = [];
  queue = enqueueSyncOperation(
    queue,
    {
      kind: 'workspace:upsert',
      uid: 'u1',
      label: 'Save ws-1',
      payload: { session: mockSession('ws-1', 'Draft 1') },
    },
    1000,
  );
  queue = enqueueSyncOperation(
    queue,
    {
      kind: 'workspace:upsert',
      uid: 'u1',
      label: 'Save ws-1 v2',
      payload: { session: mockSession('ws-1', 'Draft 2') },
    },
    2000,
  );

  assert.equal(queue.length, 1);
  assert.equal(queue[0].kind, 'workspace:upsert');
  if (queue[0].kind === 'workspace:upsert') {
    assert.equal(queue[0].payload.session.title, 'Draft 2');
  }

  // Delete uses same dedupeKey and supersedes pending upsert
  queue = enqueueSyncOperation(
    queue,
    {
      kind: 'workspace:delete',
      uid: 'u1',
      label: 'Delete ws-1',
      payload: { sessionId: 'ws-1' },
    },
    3000,
  );
  assert.equal(queue.length, 1);
  assert.equal(queue[0].kind, 'workspace:delete');
  assert.equal(getPendingWorkspaceIds(queue, 'u1').has('ws-1'), true);
});

test('enqueueSyncOperation preserves earliest baseContent when coalescing offline collab file edits', () => {
  let queue: QueuedSyncOp[] = [];
  queue = enqueueSyncOperation(
    queue,
    {
      kind: 'collab:file-edit',
      uid: 'u1',
      label: 'Edit index.html',
      payload: {
        sessionId: 'collab-1',
        filePath: 'index.html',
        language: 'html',
        baseContent: 'v1-base',
        localContent: 'v2-local',
        displayName: 'Alice',
      },
    },
    1000,
  );
  queue = enqueueSyncOperation(
    queue,
    {
      kind: 'collab:file-edit',
      uid: 'u1',
      label: 'Edit index.html',
      payload: {
        sessionId: 'collab-1',
        filePath: 'index.html',
        language: 'html',
        baseContent: 'v2-local',
        localContent: 'v3-local',
        displayName: 'Alice',
      },
    },
    1500,
  );

  assert.equal(queue.length, 1);
  assert.equal(queue[0].kind, 'collab:file-edit');
  if (queue[0].kind === 'collab:file-edit') {
    assert.equal(queue[0].payload.baseContent, 'v1-base');
    assert.equal(queue[0].payload.localContent, 'v3-local');
  }
});

test('exponential backoff, failure tracking, and reconnect timer reset behave cleanly', () => {
  assert.equal(computeBackoffDelayMs(1), 1500);
  assert.equal(computeBackoffDelayMs(2), 3000);
  assert.equal(computeBackoffDelayMs(3), 6000);
  assert.equal(computeBackoffDelayMs(10), 60000);

  assert.equal(isRetryableSyncError(new Error('Failed to fetch: network offline')), true);
  assert.equal(isRetryableSyncError(new Error('7 PERMISSION_DENIED: Missing permissions')), false);

  let queue = enqueueSyncOperation(
    [],
    {
      kind: 'game:score',
      uid: 'u1',
      label: 'Sync Arena Score',
      payload: { playerName: 'Pilot', score: 1200, wave: 3, kills: 15, durationSec: 95 },
    },
    10_000,
  );

  const opId = queue[0].id;
  assert.equal(getDueOperations(queue, 'u1', false, 10_000).length, 0);
  assert.equal(getDueOperations(queue, 'u1', true, 10_000).length, 1);

  queue = markOperationFailure(queue, opId, 'unavailable: offline', true, 10_000);
  assert.equal(queue[0].attempts, 1);
  assert.equal(queue[0].nextRetryAt, 11_500);
  assert.equal(getDueOperations(queue, 'u1', true, 11_000).length, 0);
  assert.equal(getDueOperations(queue, 'u1', true, 11_500).length, 1);

  // Reconnect resets transient timers immediately
  queue = resetRetryTimersForReconnect(queue, 'u1', 11_100);
  assert.equal(queue[0].attempts, 0);
  assert.equal(getDueOperations(queue, 'u1', true, 11_100).length, 1);

  // Permanent failure is kept inspectable until cleared or removed
  queue = markOperationFailure(queue, opId, 'PERMISSION_DENIED', false, 12_000);
  assert.equal(queue[0].failedPermanently, true);
  assert.equal(clearFailedOperations(queue).length, 0);
  assert.equal(removeOperation(queue, opId).length, 0);
});

test('serializeQueueForStorage and parseQueueFromStorage survive corrupted inputs safely', () => {
  const queue = enqueueSyncOperation(
    [],
    {
      kind: 'creation:create',
      uid: 'u1',
      label: 'Log image',
      payload: { kind: 'image', title: 'Cyber Core', prompt: 'neon ring', model: 'nano-banana' },
    },
    5000,
  );

  const raw = serializeQueueForStorage(queue);
  const restored = parseQueueFromStorage(raw);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, queue[0].id);

  assert.deepEqual(parseQueueFromStorage('{corrupt-json'), []);
  assert.deepEqual(parseQueueFromStorage(null), []);
});
