export type EngineTierId =
  | 'auto'
  | 'general'
  | 'chats'
  | 'coding'
  | 'flash'
  | 'pro'
  | 'max';

export type GeminiModelId =
  | 'auto'
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-carbon'
  | 'gemini-4-neon';

export type EngineProfileId =
  | 'myai-auto'
  | 'gemini'
  | 'gpt'
  | 'claude'
  | 'kimi'
  | 'qoder';

export type MediaSuiteTab =
  | 'image'
  | 'music'
  | 'video'
  | 'voice'
  | 'maps'
  | '3d';

export type AgentMode = 'build' | 'code' | 'ask' | 'research';

export type SpecialistSlashId =
  | 'myra'
  | 'architect'
  | 'coder'
  | 'debugger'
  | 'researcher'
  | 'designer'
  | 'analyst'
  | 'optimizer'
  | 'security'
  | 'docs'
  | 'tester'
  | 'deployer'
  | 'word'
  | 'ppt'
  | 'excel'
  | 'deep-research'
  | 'grounding'
  | 'thinking'
  | 'canvas'
  | 'data-analyst'
  | 'prompt-ops'
  | 'artifacts'
  | 'xml-planner'
  | 'office-suite'
  | 'long-context'
  | 'kimi-explorer'
  | 'repowiki'
  | 'quest'
  | 'inline-diff';

export type SkillEcosystem =
  | 'Office'
  | 'Gemini'
  | 'GPT'
  | 'Claude'
  | 'Kimi'
  | 'Qoder'
  | 'MYRA';

export interface AgentSkillMeta {
  id: SpecialistSlashId;
  command: string;
  name: string;
  ecosystem: SkillEcosystem;
  role: string;
  outputKind: 'docx' | 'pptx' | 'xlsx' | 'code' | 'research' | 'plan';
  directive: string;
  starterPrompt: string;
}

export type PipelineStageKey =
  | 'analysis'
  | 'planning'
  | 'execution'
  | 'verification';

export type StageStatus = 'pending' | 'active' | 'done' | 'error';

export interface PipelineStageState {
  key: PipelineStageKey;
  label: string;
  detail: string;
  status: StageStatus;
}

export interface WorkspaceFile {
  path: string;
  language: string;
  content: string;
  previousContent?: string;
  updatedAt: number;
}

export interface SandboxLogEntry {
  id: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: number;
}

export interface GroundingSource {
  title: string;
  url: string;
  kind?: 'web' | 'maps';
  reviewSnippets?: string[];
}

export interface TokenMetrics {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  tier?: EngineTierId;
  resolvedTier?: Exclude<EngineTierId, 'auto'>;
  routedModel?: string;
  failoverFrom?: string;
  failoverReason?: string;
  engineProfile?: EngineProfileId;
  specialist?: SpecialistSlashId;
  agentMode?: AgentMode;
  myraEnabled?: boolean;
  stages?: PipelineStageState[];
  sources?: GroundingSource[];
  metrics?: TokenMetrics;
  attachments?: { name: string; size: number }[];
  error?: string;
}

export interface WorkFolder {
  id: string;
  name: string;
  description: string;
}

export interface WorkspaceSession {
  id: string;
  title: string;
  folderId: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  files: WorkspaceFile[];
  activeFilePath: string | null;
}

export interface MemoryNote {
  id: string;
  text: string;
  createdAt: number;
}

export type InterfaceLanguage = 'en' | 'id';
export type AgentApproach = 'balanced' | 'coding-partner' | 'tutor' | 'concise';
export type ThemeMode = 'dark' | 'light';
export type LayoutMode = 'split' | 'chat' | 'workbench';
export type WorkbenchTab = 'preview' | 'code' | 'grid' | 'audit';

export interface PersonalizationConfig {
  language: InterfaceLanguage;
  approach: AgentApproach;
  theme: ThemeMode;
  myraDefault: boolean;
}

export interface ProviderDiagnosticResult {
  id: string;
  name: string;
  role: string;
  status: 'connected' | 'ready' | 'unconfigured' | 'error';
  latencyMs: number | null;
  detail: string;
  models: string[];
}

export type CollabShareMode = 'open' | 'invite';

export type CollabSyncStatus =
  | 'offline'
  | 'connecting'
  | 'synced'
  | 'saving'
  | 'merged'
  | 'error';

export interface CollabSessionMeta {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  sourceWorkspaceId: string;
  shareMode: CollabShareMode;
  activeFileCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CollabMemberRecord {
  uid: string;
  displayName: string;
  role: 'owner' | 'editor';
  color: string;
  joinedAt: number;
}

export interface CollabFileDoc {
  id: string;
  sessionId: string;
  path: string;
  language: string;
  content: string;
  version: number;
  lastEditorId: string;
  lastEditorName: string;
  createdAt: number;
  updatedAt: number;
}

export interface CollabPresencePeer {
  uid: string;
  displayName: string;
  color: string;
  activeFilePath: string;
  cursorLine: number;
  cursorCol: number;
  selectionStart: number;
  selectionEnd: number;
  isTyping: boolean;
  updatedAt: number;
}

