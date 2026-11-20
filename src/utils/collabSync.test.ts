import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterActivePresence,
  offsetToLineCol,
  parseCollabSessionIdFromInput,
  pickCollaboratorColor,
  reconcileCollaborativeText,
  toCollabFileDocId,
} from './collabSync';

test('toCollabFileDocId produces valid collision-free Firestore IDs', () => {
  const idA = toCollabFileDocId('src/App.tsx');
  const idB = toCollabFileDocId('src-App.tsx');
  assert.match(idA, /^[a-zA-Z0-9_-]{1,120}$/);
  assert.match(idB, /^[a-zA-Z0-9_-]{1,120}$/);
  assert.notEqual(idA, idB);
  assert.equal(idA, toCollabFileDocId('src/App.tsx'));
});

test('parseCollabSessionIdFromInput handles raw IDs and invite URLs cleanly', () => {
  assert.equal(
    parseCollabSessionIdFromInput('collab-1732-abc9'),
    'collab-1732-abc9',
  );
  assert.equal(
    parseCollabSessionIdFromInput('https://myai.app/app?collab=collab-1732-abc9&tab=code'),
    'collab-1732-abc9',
  );
  assert.equal(parseCollabSessionIdFromInput('ab'), null);
  assert.equal(parseCollabSessionIdFromInput('../evil/path'), null);
});

test('reconcileCollaborativeText merges disjoint multi-line edits from two users', () => {
  const base = 'line 1\nline 2\nline 3\nline 4';
  const local = 'line 1 edited by A\nline 2\nline 3\nline 4';
  const remote = 'line 1\nline 2\nline 3\nline 4 edited by B';

  const result = reconcileCollaborativeText({
    base,
    remote,
    local,
    cursorOffset: 18,
  });

  assert.equal(
    result.merged,
    'line 1 edited by A\nline 2\nline 3\nline 4 edited by B',
  );
  assert.equal(result.autoMerged, true);
  assert.equal(result.hadConflict, false);
  assert.equal(result.cursorOffset, 18);
});

test('reconcileCollaborativeText merges disjoint same-line edits and shifts cursor', () => {
  const base = 'const alpha = 1;\nconst beta = 2;';
  // Remote edits alpha before local edit on beta
  const remote = 'const alpha = 100;\nconst beta = 2;';
  const local = 'const alpha = 1;\nconst beta = 200;';

  const result = reconcileCollaborativeText({
    base,
    remote,
    local,
    cursorOffset: local.length,
  });

  assert.equal(result.merged, 'const alpha = 100;\nconst beta = 200;');
  assert.equal(result.autoMerged, true);
  assert.equal(result.hadConflict, false);
  assert.equal(result.cursorOffset, result.merged.length);
});

test('reconcileCollaborativeText shifts cursor cleanly when accepting remote-only edit', () => {
  const base = 'hello world';
  const remote = 'hello awesome world';
  const result = reconcileCollaborativeText({
    base,
    remote,
    local: base,
    cursorOffset: 11,
  });
  assert.equal(result.merged, 'hello awesome world');
  assert.equal(result.cursorOffset, 19);
  assert.equal(result.autoMerged, true);
});

test('offsetToLineCol and filterActivePresence track cursors and TTL accurately', () => {
  const pos = offsetToLineCol('first line\nsecond line\nthird', 15);
  assert.deepEqual(pos, { line: 2, col: 5 });

  assert.match(pickCollaboratorColor('user-123'), /^#[0-9A-F]{6}$/i);

  const now = 100_000;
  const peers = filterActivePresence(
    [
      {
        uid: 'self-uid',
        displayName: 'Self',
        color: '#6366F1',
        activeFilePath: 'index.html',
        cursorLine: 1,
        cursorCol: 1,
        selectionStart: 0,
        selectionEnd: 0,
        isTyping: false,
        updatedAt: now - 1000,
      },
      {
        uid: 'peer-active',
        displayName: 'Peer A',
        color: '#10B981',
        activeFilePath: 'index.html',
        cursorLine: 3,
        cursorCol: 4,
        selectionStart: 20,
        selectionEnd: 20,
        isTyping: true,
        updatedAt: now - 5000,
      },
      {
        uid: 'peer-stale',
        displayName: 'Peer B',
        color: '#F59E0B',
        activeFilePath: 'styles.css',
        cursorLine: 1,
        cursorCol: 1,
        selectionStart: 0,
        selectionEnd: 0,
        isTyping: false,
        updatedAt: now - 60000,
      },
    ],
    'self-uid',
    now,
    45000,
  );
  assert.equal(peers.length, 1);
  assert.equal(peers[0].uid, 'peer-active');
});
