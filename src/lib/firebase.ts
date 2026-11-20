import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  CollabFileDoc,
  CollabMemberRecord,
  CollabPresencePeer,
  CollabSessionMeta,
  CollabShareMode,
  EngineTierId,
  WorkspaceFile,
  WorkspaceSession,
} from '../types/workspace';
import {
  pickCollaboratorColor,
  reconcileCollaborativeText,
  toCollabFileDocId,
} from '../utils/collabSync';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

// Run startup connectivity probe once in browser
if (typeof window !== 'undefined') {
  void testConnection();
}

function safeFirestoreId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  return cleaned || `id-${Date.now()}`;
}

export async function ensureUserProfile(params: {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string | null;
  preferredTier?: EngineTierId;
}): Promise<void> {
  const uid = safeFirestoreId(params.uid);
  const profilePath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;

  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        uid,
        displayName: (params.displayName || 'MyAI Builder').slice(0, 100),
        ...(params.photoURL ? { photoURL: params.photoURL.slice(0, 512) } : {}),
        preferredTier: params.preferredTier ?? 'auto',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: false },
    );
  } catch {
    // Profile already exists or update
    try {
      await setDoc(
        doc(db, 'users', uid),
        {
          displayName: (params.displayName || 'MyAI Builder').slice(0, 100),
          ...(params.photoURL ? { photoURL: params.photoURL.slice(0, 512) } : {}),
          preferredTier: params.preferredTier ?? 'auto',
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, profilePath);
    }
  }

  if (params.email && params.email.length >= 3) {
    try {
      await setDoc(doc(db, 'users', uid, 'private', 'info'), {
        uid,
        email: params.email.slice(0, 254),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      try {
        await setDoc(
          doc(db, 'users', uid, 'private', 'info'),
          {
            email: params.email.slice(0, 254),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, privatePath);
      }
    }
  }
}

export async function syncWorkspaceToCloud(
  uid: string,
  session: WorkspaceSession,
): Promise<void> {
  const docId = safeFirestoreId(session.id);
  const targetPath = `workspaces/${docId}`;
  const boundedMessages = session.messages.slice(-50).map((m) => ({
    id: m.id.slice(0, 80),
    role: m.role,
    content: m.content.slice(0, 8000),
    createdAt: m.createdAt,
    ...(m.routedModel ? { routedModel: m.routedModel.slice(0, 64) } : {}),
  }));
  const boundedFiles = session.files.slice(0, 20).map((f) => ({
    path: f.path.slice(0, 160),
    language: f.language.slice(0, 24),
    content: f.content.slice(0, 24000),
    updatedAt: f.updatedAt,
  }));

  try {
    await setDoc(doc(db, 'workspaces', docId), {
      ownerId: uid,
      title: (session.title || 'Workspace').slice(0, 120),
      folderId: (session.folderId || 'launch').slice(0, 64),
      ...(session.activeFilePath
        ? { activeFilePath: session.activeFilePath.slice(0, 160) }
        : {}),
      messages: boundedMessages,
      files: boundedFiles,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, targetPath);
  }
}

export async function loadWorkspacesFromCloud(
  uid: string,
): Promise<WorkspaceSession[]> {
  const path = 'workspaces';
  try {
    const q = query(
      collection(db, path),
      where('ownerId', '==', uid),
      orderBy('updatedAt', 'desc'),
      limit(15),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: String(data.title || 'Cloud Workspace'),
        folderId: String(data.folderId || 'launch'),
        createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
        updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
        messages: Array.isArray(data.messages) ? data.messages : [],
        files: Array.isArray(data.files) ? data.files : [],
        activeFilePath:
          typeof data.activeFilePath === 'string' ? data.activeFilePath : null,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function deleteWorkspaceFromCloud(
  sessionId: string,
): Promise<void> {
  const docId = safeFirestoreId(sessionId);
  const targetPath = `workspaces/${docId}`;
  try {
    await deleteDoc(doc(db, 'workspaces', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, targetPath);
  }
}

export interface CreationRecord {
  id: string;
  kind: 'image' | 'music' | 'video' | 'transcript';
  title: string;
  prompt: string;
  model: string;
  summaryText?: string;
  createdAt: number;
}

export async function saveCreationRecord(
  uid: string,
  item: Omit<CreationRecord, 'id' | 'createdAt'>,
): Promise<void> {
  const id = `cr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const targetPath = `creations/${id}`;
  try {
    await setDoc(doc(db, 'creations', id), {
      ownerId: uid,
      kind: item.kind,
      title: item.title.slice(0, 120),
      prompt: item.prompt.slice(0, 2000),
      model: item.model.slice(0, 80),
      ...(item.summaryText
        ? { summaryText: item.summaryText.slice(0, 8000) }
        : {}),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, targetPath);
  }
}

export async function loadCreationRecords(
  uid: string,
): Promise<CreationRecord[]> {
  const path = 'creations';
  try {
    const q = query(
      collection(db, path),
      where('ownerId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(25),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        kind: (data.kind || 'image') as CreationRecord['kind'],
        title: String(data.title || 'Creation'),
        prompt: String(data.prompt || ''),
        model: String(data.model || ''),
        summaryText:
          typeof data.summaryText === 'string' ? data.summaryText : undefined,
        createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export interface GameScoreRecord {
  id: string;
  playerName: string;
  score: number;
  wave: number;
  kills: number;
  durationSec: number;
  createdAt: number;
}

export async function saveGameScore(
  uid: string,
  run: Omit<GameScoreRecord, 'id' | 'createdAt'>,
): Promise<void> {
  const id = `score-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const targetPath = `leaderboard/${id}`;
  try {
    await setDoc(doc(db, 'leaderboard', id), {
      ownerId: uid,
      playerName: (run.playerName || 'Pilot').slice(0, 60),
      score: Math.max(0, Math.min(10000000, Math.round(run.score))),
      wave: Math.max(1, Math.min(999, Math.round(run.wave))),
      kills: Math.max(0, Math.min(99999, Math.round(run.kills))),
      durationSec: Math.max(0, Math.min(86400, Math.round(run.durationSec))),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, targetPath);
  }
}

export async function loadPersonalBestScores(
  uid: string,
): Promise<GameScoreRecord[]> {
  const path = 'leaderboard';
  try {
    const q = query(
      collection(db, path),
      where('ownerId', '==', uid),
      orderBy('score', 'desc'),
      limit(5),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        playerName: String(data.playerName || 'Pilot'),
        score: Number(data.score || 0),
        wave: Number(data.wave || 1),
        kills: Number(data.kills || 0),
        durationSec: Number(data.durationSec || 0),
        createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createCollabSession(params: {
  uid: string;
  displayName: string;
  title: string;
  sourceWorkspaceId: string;
  shareMode: CollabShareMode;
  files: WorkspaceFile[];
}): Promise<string> {
  const sessionId = `collab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ownerName = (params.displayName || 'MyAI Builder').slice(0, 100);
  const title = (params.title || 'Shared Workspace').slice(0, 120);
  const sourceWorkspaceId = safeFirestoreId(params.sourceWorkspaceId);
  const boundedFiles = params.files.slice(0, 30);

  try {
    await setDoc(doc(db, 'collabSessions', sessionId), {
      ownerId: params.uid,
      ownerName,
      title,
      sourceWorkspaceId,
      shareMode: params.shareMode,
      activeFileCount: boundedFiles.length,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const batch = writeBatch(db);
    batch.set(doc(db, 'collabSessions', sessionId, 'members', params.uid), {
      uid: params.uid,
      displayName: ownerName,
      role: 'owner',
      color: pickCollaboratorColor(params.uid),
      joinedAt: serverTimestamp(),
    });

    for (const file of boundedFiles) {
      const fileId = toCollabFileDocId(file.path);
      batch.set(doc(db, 'collabSessions', sessionId, 'files', fileId), {
        sessionId,
        path: file.path.slice(0, 160),
        language: (file.language || 'txt').slice(0, 24),
        content: file.content.slice(0, 50000),
        version: 1,
        lastEditorId: params.uid,
        lastEditorName: ownerName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return sessionId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `collabSessions/${sessionId}`);
  }
}

export async function joinCollabSession(params: {
  sessionId: string;
  uid: string;
  displayName: string;
}): Promise<CollabSessionMeta> {
  const sessionId = safeFirestoreId(params.sessionId);
  const sessionPath = `collabSessions/${sessionId}`;

  try {
    const snap = await getDoc(doc(db, 'collabSessions', sessionId));
    if (!snap.exists()) {
      throw new Error('Collaborative session not found or has ended.');
    }
    const data = snap.data();
    const meta: CollabSessionMeta = {
      id: snap.id,
      ownerId: String(data.ownerId || ''),
      ownerName: String(data.ownerName || 'Owner'),
      title: String(data.title || 'Shared Workspace'),
      sourceWorkspaceId: String(data.sourceWorkspaceId || ''),
      shareMode: (data.shareMode === 'invite' ? 'invite' : 'open') as CollabShareMode,
      activeFileCount: Number(data.activeFileCount || 0),
      createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
      updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
    };

    const memberRef = doc(db, 'collabSessions', sessionId, 'members', params.uid);
    const memberSnap = await getDoc(memberRef);

    if (!memberSnap.exists()) {
      if (meta.ownerId === params.uid || meta.shareMode === 'open') {
        await setDoc(memberRef, {
          uid: params.uid,
          displayName: (params.displayName || 'Collaborator').slice(0, 100),
          role: meta.ownerId === params.uid ? 'owner' : 'editor',
          color: pickCollaboratorColor(params.uid),
          joinedAt: serverTimestamp(),
        });
      } else {
        throw new Error('This collaborative session is invite-only.');
      }
    }

    return meta;
  } catch (err) {
    if (err instanceof Error && (err.message.includes('not found') || err.message.includes('invite-only'))) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, sessionPath);
  }
}

export async function listOwnedCollabSessions(
  uid: string,
): Promise<CollabSessionMeta[]> {
  const path = 'collabSessions';
  try {
    const q = query(
      collection(db, path),
      where('ownerId', '==', uid),
      orderBy('updatedAt', 'desc'),
      limit(10),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ownerId: String(data.ownerId || ''),
        ownerName: String(data.ownerName || 'Owner'),
        title: String(data.title || 'Shared Workspace'),
        sourceWorkspaceId: String(data.sourceWorkspaceId || ''),
        shareMode: (data.shareMode === 'invite' ? 'invite' : 'open') as CollabShareMode,
        activeFileCount: Number(data.activeFileCount || 0),
        createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
        updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function updateCollabShareMode(
  sessionId: string,
  shareMode: CollabShareMode,
): Promise<void> {
  const safeId = safeFirestoreId(sessionId);
  try {
    await updateDoc(doc(db, 'collabSessions', safeId), {
      shareMode,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `collabSessions/${safeId}`);
  }
}

export async function addCollabMemberByUid(params: {
  sessionId: string;
  memberUid: string;
  displayName?: string;
}): Promise<void> {
  const safeSession = safeFirestoreId(params.sessionId);
  const safeMember = safeFirestoreId(params.memberUid);
  const targetPath = `collabSessions/${safeSession}/members/${safeMember}`;
  try {
    await setDoc(doc(db, 'collabSessions', safeSession, 'members', safeMember), {
      uid: safeMember,
      displayName: (params.displayName?.trim() || `Builder ${safeMember.slice(0, 6)}`).slice(0, 100),
      role: 'editor',
      color: pickCollaboratorColor(safeMember),
      joinedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, targetPath);
  }
}

export async function removeCollabMember(
  sessionId: string,
  memberUid: string,
): Promise<void> {
  const safeSession = safeFirestoreId(sessionId);
  const safeMember = safeFirestoreId(memberUid);
  try {
    await deleteDoc(doc(db, 'collabSessions', safeSession, 'members', safeMember));
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.DELETE,
      `collabSessions/${safeSession}/members/${safeMember}`,
    );
  }
}

export async function deleteCollabSession(sessionId: string): Promise<void> {
  const safeId = safeFirestoreId(sessionId);
  try {
    await deleteDoc(doc(db, 'collabSessions', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `collabSessions/${safeId}`);
  }
}

export function subscribeCollabSession(params: {
  sessionId: string;
  onSession: (meta: CollabSessionMeta | null) => void;
  onFiles: (files: CollabFileDoc[]) => void;
  onMembers: (members: CollabMemberRecord[]) => void;
  onPresence: (peers: CollabPresencePeer[]) => void;
  onError: (message: string) => void;
}): () => void {
  const safeId = safeFirestoreId(params.sessionId);

  const unsubSession = onSnapshot(
    doc(db, 'collabSessions', safeId),
    (snap) => {
      if (!snap.exists()) {
        params.onSession(null);
        return;
      }
      const data = snap.data();
      params.onSession({
        id: snap.id,
        ownerId: String(data.ownerId || ''),
        ownerName: String(data.ownerName || 'Owner'),
        title: String(data.title || 'Shared Workspace'),
        sourceWorkspaceId: String(data.sourceWorkspaceId || ''),
        shareMode: (data.shareMode === 'invite' ? 'invite' : 'open') as CollabShareMode,
        activeFileCount: Number(data.activeFileCount || 0),
        createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
        updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
      });
    },
    (err) => params.onError(err.message),
  );

  const unsubFiles = onSnapshot(
    collection(db, 'collabSessions', safeId, 'files'),
    (snap) => {
      const nextFiles: CollabFileDoc[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            sessionId: String(data.sessionId || safeId),
            path: String(data.path || 'untitled.txt'),
            language: String(data.language || 'txt'),
            content: String(data.content ?? ''),
            version: Number(data.version || 1),
            lastEditorId: String(data.lastEditorId || ''),
            lastEditorName: String(data.lastEditorName || 'Collaborator'),
            createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
            updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
          };
        })
        .sort((a, b) => a.path.localeCompare(b.path));
      params.onFiles(nextFiles);
    },
    (err) => params.onError(err.message),
  );

  const unsubMembers = onSnapshot(
    collection(db, 'collabSessions', safeId, 'members'),
    (snap) => {
      const nextMembers: CollabMemberRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: String(data.uid || d.id),
          displayName: String(data.displayName || 'Collaborator'),
          role: data.role === 'owner' ? 'owner' : 'editor',
          color: String(data.color || '#6366F1'),
          joinedAt: data.joinedAt?.toMillis?.() ?? Date.now(),
        };
      });
      params.onMembers(nextMembers);
    },
    (err) => params.onError(err.message),
  );

  const unsubPresence = onSnapshot(
    collection(db, 'collabSessions', safeId, 'presence'),
    (snap) => {
      const nextPeers: CollabPresencePeer[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: String(data.uid || d.id),
          displayName: String(data.displayName || 'Collaborator'),
          color: String(data.color || '#6366F1'),
          activeFilePath: String(data.activeFilePath || ''),
          cursorLine: Number(data.cursorLine || 1),
          cursorCol: Number(data.cursorCol || 1),
          selectionStart: Number(data.selectionStart || 0),
          selectionEnd: Number(data.selectionEnd || 0),
          isTyping: Boolean(data.isTyping),
          updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
        };
      });
      params.onPresence(nextPeers);
    },
    (err) => params.onError(err.message),
  );

  return () => {
    unsubSession();
    unsubFiles();
    unsubMembers();
    unsubPresence();
  };
}

export async function commitCollabFileEdit(params: {
  sessionId: string;
  filePath: string;
  language: string;
  baseContent: string;
  localContent: string;
  uid: string;
  displayName: string;
}): Promise<{
  content: string;
  version: number;
  autoMerged: boolean;
  hadConflict: boolean;
}> {
  const safeSession = safeFirestoreId(params.sessionId);
  const fileId = toCollabFileDocId(params.filePath);
  const fileRef = doc(db, 'collabSessions', safeSession, 'files', fileId);
  const editorName = (params.displayName || 'Collaborator').slice(0, 100);
  const boundedLanguage = (params.language || 'txt').slice(0, 24);
  const safePath = params.filePath.slice(0, 160);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(fileRef);
      if (!snap.exists()) {
        const initialContent = params.localContent.slice(0, 50000);
        tx.set(fileRef, {
          sessionId: safeSession,
          path: safePath,
          language: boundedLanguage,
          content: initialContent,
          version: 1,
          lastEditorId: params.uid,
          lastEditorName: editorName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return {
          content: initialContent,
          version: 1,
          autoMerged: false,
          hadConflict: false,
        };
      }

      const data = snap.data();
      const serverContent = String(data.content ?? '');
      const serverVersion = Number(data.version || 1);

      const reconciled = reconcileCollaborativeText({
        base: params.baseContent,
        remote: serverContent,
        local: params.localContent,
      });

      const finalContent = reconciled.merged.slice(0, 50000);
      const nextVersion = serverVersion + 1;

      tx.update(fileRef, {
        content: finalContent,
        language: boundedLanguage,
        version: nextVersion,
        lastEditorId: params.uid,
        lastEditorName: editorName,
        updatedAt: serverTimestamp(),
      });

      return {
        content: finalContent,
        version: nextVersion,
        autoMerged: reconciled.autoMerged,
        hadConflict: reconciled.hadConflict,
      };
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `collabSessions/${safeSession}/files/${fileId}`,
    );
  }
}

export async function upsertCollabPresence(params: {
  sessionId: string;
  uid: string;
  displayName: string;
  activeFilePath: string;
  cursorLine: number;
  cursorCol: number;
  selectionStart: number;
  selectionEnd: number;
  isTyping: boolean;
}): Promise<void> {
  const safeSession = safeFirestoreId(params.sessionId);
  const safeUid = safeFirestoreId(params.uid);
  const ref = doc(db, 'collabSessions', safeSession, 'presence', safeUid);
  try {
    await setDoc(ref, {
      uid: params.uid,
      displayName: (params.displayName || 'Collaborator').slice(0, 100),
      color: pickCollaboratorColor(params.uid),
      activeFilePath: params.activeFilePath.slice(0, 160),
      cursorLine: Math.max(1, Math.min(100000, Math.round(params.cursorLine))),
      cursorCol: Math.max(1, Math.min(10000, Math.round(params.cursorCol))),
      selectionStart: Math.max(0, Math.min(100000, Math.round(params.selectionStart))),
      selectionEnd: Math.max(0, Math.min(100000, Math.round(params.selectionEnd))),
      isTyping: params.isTyping,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `collabSessions/${safeSession}/presence/${safeUid}`,
    );
  }
}

export async function clearCollabPresence(
  sessionId: string,
  uid: string,
): Promise<void> {
  const safeSession = safeFirestoreId(sessionId);
  const safeUid = safeFirestoreId(uid);
  try {
    await deleteDoc(doc(db, 'collabSessions', safeSession, 'presence', safeUid));
  } catch {
    // Best-effort cleanup on leave/unmount
  }
}

