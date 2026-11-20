import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  addCollabMemberByUid,
  clearCollabPresence,
  commitCollabFileEdit,
  createCollabSession,
  deleteCollabSession,
  joinCollabSession,
  listOwnedCollabSessions,
  removeCollabMember,
  subscribeCollabSession,
  updateCollabShareMode,
  upsertCollabPresence,
} from '../lib/firebase';
import { syncQueueManager } from '../lib/syncQueueManager';
import { isRetryableSyncError } from '../utils/offlineSyncQueue';
import type {
  CollabFileDoc,
  CollabMemberRecord,
  CollabPresencePeer,
  CollabSessionMeta,
  CollabShareMode,
  CollabSyncStatus,
  WorkspaceFile,
} from '../types/workspace';
import {
  filterActivePresence,
  offsetToLineCol,
  reconcileCollaborativeText,
} from '../utils/collabSync';

function resolveCollabIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('collab');
  return raw && /^[a-zA-Z0-9_-]{4,120}$/.test(raw) ? raw : null;
}

function setCollabUrlParam(sessionId: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (sessionId) {
    url.searchParams.set('collab', sessionId);
    if (!url.pathname.startsWith('/app')) {
      url.pathname = '/app';
    }
  } else {
    url.searchParams.delete('collab');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

export interface CollabFileMeta {
  version: number;
  lastEditorName: string;
  updatedAt: number;
}

export function useCollabWorkspace(params: {
  user: User | null;
  authReady: boolean;
  workspaceId: string;
  workspaceTitle: string;
  workspaceFiles: WorkspaceFile[];
  activeFilePath: string | null;
  onSyncRemoteFiles: (remoteFiles: WorkspaceFile[], activeRemotePath?: string) => void;
  onApplyMergedContent: (filePath: string, mergedContent: string) => void;
}) {
  const {
    user,
    authReady,
    workspaceId,
    workspaceTitle,
    workspaceFiles,
    activeFilePath,
    onSyncRemoteFiles,
    onApplyMergedContent,
  } = params;

  const [pendingSessionId, setPendingSessionId] = useState<string | null>(() =>
    resolveCollabIdFromUrl(),
  );
  const [collabSessionId, setCollabSessionId] = useState<string | null>(null);
  const [sessionMeta, setSessionMeta] = useState<CollabSessionMeta | null>(null);
  const [members, setMembers] = useState<CollabMemberRecord[]>([]);
  const [rawPeers, setRawPeers] = useState<CollabPresencePeer[]>([]);
  const [activePeers, setActivePeers] = useState<CollabPresencePeer[]>([]);
  const [fileMetas, setFileMetas] = useState<Record<string, CollabFileMeta>>({});
  const [syncStatus, setSyncStatus] = useState<CollabSyncStatus>('offline');
  const [collabError, setCollabError] = useState<string | null>(null);
  const [ownedSessions, setOwnedSessions] = useState<CollabSessionMeta[]>([]);

  const baseContentsRef = useRef<Record<string, string>>({});
  const dirtyFilesRef = useRef<Record<string, { content: string; language: string }>>({});
  const saveTimersRef = useRef<Record<string, number>>({});
  const presenceTimerRef = useRef<number | null>(null);
  const lastCursorRef = useRef<{
    filePath: string;
    cursorLine: number;
    cursorCol: number;
    selectionStart: number;
    selectionEnd: number;
    isTyping: boolean;
  }>({
    filePath: activeFilePath ?? '',
    cursorLine: 1,
    cursorCol: 1,
    selectionStart: 0,
    selectionEnd: 0,
    isTyping: false,
  });

  // Auto-join pending ?collab= session once user authenticates
  useEffect(() => {
    if (!authReady || !user || !pendingSessionId) return;
    let cancelled = false;
    setSyncStatus('connecting');
    setCollabError(null);

    void joinCollabSession({
      sessionId: pendingSessionId,
      uid: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || 'Collaborator',
    })
      .then((meta) => {
        if (cancelled) return;
        setSessionMeta(meta);
        setCollabSessionId(meta.id);
        setPendingSessionId(null);
        setCollabUrlParam(meta.id);
      })
      .catch((err) => {
        if (cancelled) return;
        setCollabError(err instanceof Error ? err.message : 'Unable to join collaborative session.');
        setSyncStatus('error');
        setPendingSessionId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user, pendingSessionId]);

  // Refresh user's owned collab sessions when signed in
  const refreshOwnedSessions = useCallback(async () => {
    if (!user) {
      setOwnedSessions([]);
      return;
    }
    try {
      const list = await listOwnedCollabSessions(user.uid);
      setOwnedSessions(list);
    } catch {
      // Non-fatal
    }
  }, [user]);

  useEffect(() => {
    void refreshOwnedSessions();
  }, [refreshOwnedSessions]);

  // Recompute TTL-filtered active peers periodically
  useEffect(() => {
    setActivePeers(filterActivePresence(rawPeers, user?.uid));
    if (!collabSessionId) return;
    const interval = window.setInterval(() => {
      setActivePeers(filterActivePresence(rawPeers, user?.uid));
    }, 5000);
    return () => window.clearInterval(interval);
  }, [rawPeers, user?.uid, collabSessionId]);

  // Attach real-time Firestore listeners when collabSessionId is active
  useEffect(() => {
    if (!user || !collabSessionId) {
      return;
    }

    setSyncStatus('connecting');
    baseContentsRef.current = {};
    dirtyFilesRef.current = {};

    const unsubscribe = subscribeCollabSession({
      sessionId: collabSessionId,
      onSession: (meta) => {
        if (!meta) {
          setCollabError('The collaborative session was ended by its host.');
          setCollabSessionId(null);
          setSessionMeta(null);
          setSyncStatus('offline');
          setCollabUrlParam(null);
          return;
        }
        setSessionMeta(meta);
        setSyncStatus((prev) => (prev === 'connecting' ? 'synced' : prev));
      },
      onFiles: (remoteDocs: CollabFileDoc[]) => {
        const nextMetas: Record<string, CollabFileMeta> = {};
        const nextFilesForWorkspace: WorkspaceFile[] = [];

        for (const docItem of remoteDocs) {
          nextMetas[docItem.path] = {
            version: docItem.version,
            lastEditorName: docItem.lastEditorName,
            updatedAt: docItem.updatedAt,
          };

          const dirty = dirtyFilesRef.current[docItem.path];
          if (dirty) {
            const base = baseContentsRef.current[docItem.path] ?? docItem.content;
            const reconciled = reconcileCollaborativeText({
              base,
              remote: docItem.content,
              local: dirty.content,
            });
            baseContentsRef.current[docItem.path] = docItem.content;
            dirtyFilesRef.current[docItem.path] = {
              content: reconciled.merged,
              language: docItem.language,
            };
            nextFilesForWorkspace.push({
              path: docItem.path,
              language: docItem.language,
              content: reconciled.merged,
              previousContent: docItem.content,
              updatedAt: docItem.updatedAt,
            });
          } else {
            const prevBase = baseContentsRef.current[docItem.path];
            baseContentsRef.current[docItem.path] = docItem.content;
            nextFilesForWorkspace.push({
              path: docItem.path,
              language: docItem.language,
              content: docItem.content,
              previousContent: prevBase ?? docItem.content,
              updatedAt: docItem.updatedAt,
            });
          }
        }

        setFileMetas(nextMetas);
        if (nextFilesForWorkspace.length > 0) {
          onSyncRemoteFiles(nextFilesForWorkspace, nextFilesForWorkspace[0].path);
        }
        setSyncStatus('synced');
      },
      onMembers: (nextMembers) => {
        setMembers(nextMembers);
      },
      onPresence: (nextPeers) => {
        setRawPeers(nextPeers);
      },
      onError: (msg) => {
        setCollabError(msg);
        setSyncStatus('error');
      },
    });

    // Initial & heartbeat presence push
    const sendHeartbeat = () => {
      const cur = lastCursorRef.current;
      void upsertCollabPresence({
        sessionId: collabSessionId,
        uid: user.uid,
        displayName: user.displayName || user.email?.split('@')[0] || 'Collaborator',
        activeFilePath: cur.filePath || activeFilePath || '',
        cursorLine: cur.cursorLine,
        cursorCol: cur.cursorCol,
        selectionStart: cur.selectionStart,
        selectionEnd: cur.selectionEnd,
        isTyping: cur.isTyping,
      }).catch(() => {});
    };

    sendHeartbeat();
    const hbInterval = window.setInterval(sendHeartbeat, 15000);

    const onBeforeUnload = () => {
      void clearCollabPresence(collabSessionId, user.uid);
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.clearInterval(hbInterval);
      window.removeEventListener('beforeunload', onBeforeUnload);
      Object.values(saveTimersRef.current).forEach((t) => clearTimeout(t));
      saveTimersRef.current = {};
      if (presenceTimerRef.current) clearTimeout(presenceTimerRef.current);
      unsubscribe();
      void clearCollabPresence(collabSessionId, user.uid);
    };
  }, [user, collabSessionId]);

  // Keep baseContentsRef & editor state aligned when offline-buffered collab edits flush after reconnect
  useEffect(() => {
    if (!collabSessionId) return;
    return syncQueueManager.onCollabFileFlushed((res) => {
      if (res.sessionId !== collabSessionId) return;
      baseContentsRef.current[res.filePath] = res.content;
      delete dirtyFilesRef.current[res.filePath];
      if (res.autoMerged) {
        onApplyMergedContent(res.filePath, res.content);
        setSyncStatus('merged');
        window.setTimeout(() => {
          setSyncStatus((curr) => (curr === 'merged' ? 'synced' : curr));
        }, 1800);
      } else {
        setSyncStatus('synced');
      }
    });
  }, [collabSessionId, onApplyMergedContent]);

  const startCollabSession = useCallback(
    async (shareMode: CollabShareMode = 'open') => {
      if (!user) {
        throw new Error('Sign in with Google to start a live collaborative session.');
      }
      setCollabError(null);
      setSyncStatus('connecting');
      const displayName =
        user.displayName || user.email?.split('@')[0] || 'MyAI Builder';

      const id = await createCollabSession({
        uid: user.uid,
        displayName,
        title: workspaceTitle,
        sourceWorkspaceId: workspaceId,
        shareMode,
        files: workspaceFiles,
      });

      for (const f of workspaceFiles) {
        baseContentsRef.current[f.path] = f.content;
      }

      setCollabSessionId(id);
      setCollabUrlParam(id);
      void refreshOwnedSessions();
      return id;
    },
    [user, workspaceId, workspaceTitle, workspaceFiles, refreshOwnedSessions],
  );

  const joinExistingCollabSession = useCallback(
    async (sessionId: string) => {
      if (!user) {
        setPendingSessionId(sessionId);
        throw new Error('Sign in with Google to join this collaborative session.');
      }
      setCollabError(null);
      setSyncStatus('connecting');
      const displayName =
        user.displayName || user.email?.split('@')[0] || 'Collaborator';
      const meta = await joinCollabSession({
        sessionId,
        uid: user.uid,
        displayName,
      });
      setSessionMeta(meta);
      setCollabSessionId(meta.id);
      setCollabUrlParam(meta.id);
      return meta;
    },
    [user],
  );

  const leaveCollabSession = useCallback(async () => {
    if (user && collabSessionId) {
      await clearCollabPresence(collabSessionId, user.uid);
    }
    setCollabSessionId(null);
    setSessionMeta(null);
    setMembers([]);
    setRawPeers([]);
    setActivePeers([]);
    setFileMetas({});
    setSyncStatus('offline');
    setCollabError(null);
    setCollabUrlParam(null);
  }, [user, collabSessionId]);

  const endCollabSession = useCallback(async () => {
    if (!collabSessionId) return;
    await deleteCollabSession(collabSessionId);
    await leaveCollabSession();
    void refreshOwnedSessions();
  }, [collabSessionId, leaveCollabSession, refreshOwnedSessions]);

  const changeShareMode = useCallback(
    async (mode: CollabShareMode) => {
      if (!collabSessionId) return;
      await updateCollabShareMode(collabSessionId, mode);
    },
    [collabSessionId],
  );

  const inviteMemberByUid = useCallback(
    async (memberUid: string, displayName?: string) => {
      if (!collabSessionId) return;
      await addCollabMemberByUid({
        sessionId: collabSessionId,
        memberUid,
        displayName,
      });
    },
    [collabSessionId],
  );

  const revokeMember = useCallback(
    async (memberUid: string) => {
      if (!collabSessionId) return;
      await removeCollabMember(collabSessionId, memberUid);
    },
    [collabSessionId],
  );

  const pushLocalFileEdit = useCallback(
    (filePath: string, language: string, nextContent: string) => {
      if (!user || !collabSessionId) return;
      dirtyFilesRef.current[filePath] = { content: nextContent, language };
      setSyncStatus('saving');

      if (saveTimersRef.current[filePath]) {
        clearTimeout(saveTimersRef.current[filePath]);
      }

      saveTimersRef.current[filePath] = window.setTimeout(async () => {
        delete saveTimersRef.current[filePath];
        const latestDirty = dirtyFilesRef.current[filePath];
        if (!latestDirty) return;

        const baseContent = baseContentsRef.current[filePath] ?? '';
        const displayName =
          user.displayName || user.email?.split('@')[0] || 'Collaborator';

        try {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error('offline: buffering collaborative edit');
          }
          const result = await commitCollabFileEdit({
            sessionId: collabSessionId,
            filePath,
            language: latestDirty.language,
            baseContent,
            localContent: latestDirty.content,
            uid: user.uid,
            displayName,
          });

          baseContentsRef.current[filePath] = result.content;
          if (dirtyFilesRef.current[filePath]?.content === latestDirty.content) {
            delete dirtyFilesRef.current[filePath];
          }
          if (result.content !== latestDirty.content) {
            onApplyMergedContent(filePath, result.content);
          }
          setSyncStatus(result.autoMerged ? 'merged' : 'synced');
          if (result.autoMerged) {
            window.setTimeout(() => {
              setSyncStatus((curr) => (curr === 'merged' ? 'synced' : curr));
            }, 1800);
          }
        } catch (err) {
          if (isRetryableSyncError(err)) {
            syncQueueManager.enqueue(
              {
                kind: 'collab:file-edit',
                uid: user.uid,
                label: `Sync ${filePath}`,
                payload: {
                  sessionId: collabSessionId,
                  filePath,
                  language: latestDirty.language,
                  baseContent,
                  localContent: latestDirty.content,
                  displayName,
                },
              },
              { immediate: typeof navigator !== 'undefined' && navigator.onLine },
            );
            setSyncStatus('saving');
          } else {
            setCollabError(
              err instanceof Error ? err.message : 'Failed to sync collaborative edit.',
            );
            setSyncStatus('error');
          }
        }
      }, 280);
    },
    [user, collabSessionId, onApplyMergedContent],
  );

  const updateCursorPresence = useCallback(
    (
      filePath: string,
      content: string,
      selectionStart: number,
      selectionEnd: number,
      isTyping: boolean,
    ) => {
      if (!user || !collabSessionId) return;
      const { line, col } = offsetToLineCol(content, selectionStart);
      lastCursorRef.current = {
        filePath,
        cursorLine: line,
        cursorCol: col,
        selectionStart,
        selectionEnd,
        isTyping,
      };

      if (presenceTimerRef.current) {
        clearTimeout(presenceTimerRef.current);
      }
      presenceTimerRef.current = window.setTimeout(() => {
        presenceTimerRef.current = null;
        const cur = lastCursorRef.current;
        void upsertCollabPresence({
          sessionId: collabSessionId,
          uid: user.uid,
          displayName: user.displayName || user.email?.split('@')[0] || 'Collaborator',
          activeFilePath: cur.filePath,
          cursorLine: cur.cursorLine,
          cursorCol: cur.cursorCol,
          selectionStart: cur.selectionStart,
          selectionEnd: cur.selectionEnd,
          isTyping: cur.isTyping,
        }).catch(() => {});
      }, 220);
    },
    [user, collabSessionId],
  );

  return {
    isCollabActive: Boolean(collabSessionId),
    collabSessionId,
    pendingSessionId,
    sessionMeta,
    members,
    activePeers,
    fileMetas,
    syncStatus,
    collabError,
    ownedSessions,
    startCollabSession,
    joinExistingCollabSession,
    leaveCollabSession,
    endCollabSession,
    changeShareMode,
    inviteMemberByUid,
    revokeMember,
    pushLocalFileEdit,
    updateCursorPresence,
    refreshOwnedSessions,
  };
}
