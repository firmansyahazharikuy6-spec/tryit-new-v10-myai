import type { CollabPresencePeer } from '../types/workspace';

const COLLAB_PALETTE = [
  '#6366F1', // Indigo
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#8B5CF6', // Violet
  '#F97316', // Orange
  '#14B8A6', // Teal
];

export function pickCollaboratorColor(uid: string): string {
  let hash = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    hash ^= uid.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return COLLAB_PALETTE[Math.abs(hash) % COLLAB_PALETTE.length];
}

export function toCollabFileDocId(filePath: string): string {
  const normalized = filePath.trim() || 'file.txt';
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hashHex = (hash >>> 0).toString(36);
  const slug = normalized
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const base = slug || 'file';
  return `${base}--${hashHex}`.slice(0, 120);
}

export function parseCollabSessionIdFromInput(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    if (raw.includes('collab=')) {
      const url = raw.startsWith('http')
        ? new URL(raw)
        : new URL(raw, 'https://myai.local');
      const id = url.searchParams.get('collab')?.trim() ?? '';
      return /^[a-zA-Z0-9_-]{4,120}$/.test(id) ? id : null;
    }
  } catch {
    // Fall through to raw regex check
  }

  return /^[a-zA-Z0-9_-]{4,120}$/.test(raw) ? raw : null;
}

export function offsetToLineCol(
  text: string,
  offset: number,
): { line: number; col: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const prefix = text.slice(0, clamped);
  const lines = prefix.split('\n');
  return {
    line: lines.length,
    col: (lines[lines.length - 1]?.length ?? 0) + 1,
  };
}

interface TextChangeSpan {
  start: number;
  endOld: number;
  insert: string;
}

function computeEditSpan(base: string, target: string): TextChangeSpan {
  let start = 0;
  const minLen = Math.min(base.length, target.length);
  while (start < minLen && base.charCodeAt(start) === target.charCodeAt(start)) {
    start++;
  }
  let baseEnd = base.length;
  let targetEnd = target.length;
  while (
    baseEnd > start &&
    targetEnd > start &&
    base.charCodeAt(baseEnd - 1) === target.charCodeAt(targetEnd - 1)
  ) {
    baseEnd--;
    targetEnd--;
  }
  return {
    start,
    endOld: baseEnd,
    insert: target.slice(start, targetEnd),
  };
}

function shiftCursorForEdit(
  cursorOffset: number,
  editStart: number,
  editEndOld: number,
  insertLength: number,
): number {
  if (cursorOffset <= editStart) {
    return cursorOffset;
  }
  if (cursorOffset >= editEndOld) {
    return Math.max(0, cursorOffset + (insertLength - (editEndOld - editStart)));
  }
  return editStart + insertLength;
}

export interface ReconcileTextResult {
  merged: string;
  cursorOffset: number;
  hadConflict: boolean;
  autoMerged: boolean;
}

/**
 * Deterministic 3-way text reconciliation for simultaneous file editing.
 * - Preserves disjoint span edits (both inline and multi-line)
 * - Shifts local caret position cleanly around incoming remote edits
 */
export function reconcileCollaborativeText(params: {
  base: string;
  remote: string;
  local: string;
  cursorOffset?: number;
}): ReconcileTextResult {
  const { base, remote, local } = params;
  const cursor = Math.max(0, Math.min(params.cursorOffset ?? local.length, local.length));

  if (remote === local) {
    return {
      merged: remote,
      cursorOffset: cursor,
      hadConflict: false,
      autoMerged: false,
    };
  }

  if (remote === base) {
    return {
      merged: local,
      cursorOffset: cursor,
      hadConflict: false,
      autoMerged: false,
    };
  }

  if (local === base) {
    const remoteSpan = computeEditSpan(base, remote);
    const nextCursor = shiftCursorForEdit(
      cursor,
      remoteSpan.start,
      remoteSpan.endOld,
      remoteSpan.insert.length,
    );
    return {
      merged: remote,
      cursorOffset: Math.min(nextCursor, remote.length),
      hadConflict: false,
      autoMerged: true,
    };
  }

  // Both remote and local changed relative to base -> try line-based 3-way merge
  const baseLines = base.split('\n');
  const remoteLines = remote.split('\n');
  const localLines = local.split('\n');

  if (
    baseLines.length === remoteLines.length &&
    baseLines.length === localLines.length &&
    baseLines.length > 1
  ) {
    let anyDisjoint = true;
    let lineConflict = false;
    const outLines: string[] = [];

    for (let i = 0; i < baseLines.length; i++) {
      const b = baseLines[i];
      const r = remoteLines[i];
      const l = localLines[i];
      if (l === b && r !== b) {
        outLines.push(r);
      } else if (r === b && l !== b) {
        outLines.push(l);
      } else if (l === r) {
        outLines.push(l);
      } else {
        // Inline merge attempt on the single modified line
        const inlineRes = reconcileSingleSpan(b, r, l, 0);
        outLines.push(inlineRes.merged);
        if (inlineRes.hadConflict) {
          lineConflict = true;
        }
      }
    }

    if (anyDisjoint) {
      const merged = outLines.join('\n');
      const localDelta = computeEditSpan(local, merged);
      const nextCursor = shiftCursorForEdit(
        cursor,
        localDelta.start,
        localDelta.endOld,
        localDelta.insert.length,
      );
      return {
        merged,
        cursorOffset: Math.max(0, Math.min(nextCursor, merged.length)),
        hadConflict: lineConflict,
        autoMerged: !lineConflict,
      };
    }
  }

  return reconcileSingleSpan(base, remote, local, cursor);
}

function reconcileSingleSpan(
  base: string,
  remote: string,
  local: string,
  cursor: number,
): ReconcileTextResult {
  const remoteSpan = computeEditSpan(base, remote);
  const localSpan = computeEditSpan(base, local);

  // Disjoint: remote edit occurs strictly before local edit
  if (remoteSpan.endOld <= localSpan.start) {
    const remoteDelta = remoteSpan.insert.length - (remoteSpan.endOld - remoteSpan.start);
    const merged =
      remote.slice(0, localSpan.start + remoteDelta) +
      localSpan.insert +
      remote.slice(localSpan.endOld + remoteDelta);
    const nextCursor = cursor + remoteDelta;
    return {
      merged,
      cursorOffset: Math.max(0, Math.min(nextCursor, merged.length)),
      hadConflict: false,
      autoMerged: true,
    };
  }

  // Disjoint: local edit occurs strictly before remote edit
  if (localSpan.endOld <= remoteSpan.start) {
    const localDelta = localSpan.insert.length - (localSpan.endOld - localSpan.start);
    const merged =
      local.slice(0, remoteSpan.start + localDelta) +
      remoteSpan.insert +
      local.slice(remoteSpan.endOld + localDelta);
    return {
      merged,
      cursorOffset: Math.max(0, Math.min(cursor, merged.length)),
      hadConflict: false,
      autoMerged: true,
    };
  }

  // Overlapping conflict on exact same span: preserve local typing continuity and report conflict
  return {
    merged: local,
    cursorOffset: Math.max(0, Math.min(cursor, local.length)),
    hadConflict: true,
    autoMerged: false,
  };
}

export function filterActivePresence(
  peers: CollabPresencePeer[],
  selfUid: string | null | undefined,
  nowMs = Date.now(),
  ttlMs = 45000,
): CollabPresencePeer[] {
  return peers.filter(
    (p) =>
      p.uid !== selfUid &&
      (nowMs - p.updatedAt <= ttlMs || p.updatedAt === 0),
  );
}
