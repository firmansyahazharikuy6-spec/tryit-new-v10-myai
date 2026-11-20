import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  AtSign,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  FileText,
  GitBranch,
  Globe,
  Layers,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Paperclip,
  Presentation,
  RefreshCw,
  Sparkles,
  Square,
  Volume2,
  Wand2,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import {
  AGENT_MODES,
  ENGINE_TIERS,
  QUICK_PROMPTS,
  SPECIALIST_AGENTS,
} from '../data/catalog';
import { AGENT_SKILLS, ENGINE_PROFILES } from '../data/skills';
import type {
  AgentMode,
  ChatMessage,
  EngineProfileId,
  EngineTierId,
  GeminiModelId,
  PipelineStageState,
  SpecialistSlashId,
  WorkspaceFile,
} from '../types/workspace';

interface ChatPaneProps {
  messages: ChatMessage[];
  workspaceFiles: WorkspaceFile[];
  isStreaming: boolean;
  agentMode: AgentMode;
  activeTier: EngineTierId;
  activeProfile: EngineProfileId;
  explicitModel: GeminiModelId;
  activeSpecialist: SpecialistSlashId;
  myraEnabled: boolean;
  webSearch: boolean;
  mapsSearch: boolean;
  deepResearch: boolean;
  draftSeed?: string | null;
  onClearDraftSeed?: () => void;
  onChangeAgentMode: (mode: AgentMode) => void;
  onChangeTier: (tier: EngineTierId) => void;
  onChangeProfile: (profile: EngineProfileId) => void;
  onChangeExplicitModel: (model: GeminiModelId) => void;
  onChangeSpecialist: (specialist: SpecialistSlashId) => void;
  onOpenSkills: () => void;
  onToggleMyra: () => void;
  onToggleWebSearch: () => void;
  onToggleMapsSearch: () => void;
  onToggleDeepResearch: () => void;
  onSendMessage: (
    prompt: string,
    attachedFiles: { name: string; content: string; size: number }[],
  ) => void;
  onRegenerateMessage: (assistantMsgId: string) => void;
  onForkFromMessage: (msgId: string) => void;
  onStopStreaming: () => void;
  onOpenArtifactInWorkbench: () => void;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    keyIdx += 1;

    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`code-${keyIdx}`}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-zinc-200/80 dark:bg-zinc-800/90 text-indigo-700 dark:text-indigo-300 font-mono text-[12px]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`strong-${keyIdx}`} className="font-semibold text-zinc-950 dark:text-zinc-50">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={`em-${keyIdx}`} className="italic text-zinc-700 dark:text-zinc-300">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(
          <a
            key={`link-${keyIdx}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-500"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderMessageBody(text: string) {
  const parts: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = [];
  const regex = /```([a-zA-Z0-9_-]*)(?::[^\n]+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({
      type: 'code',
      lang: match[1] || 'code',
      content: match[2],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {parts.map((part, idx) => {
        if (part.type === 'code') {
          return (
            <div
              key={idx}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-950 text-zinc-100 overflow-hidden"
            >
              <div className="px-3 py-1.5 flex items-center justify-between border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
                <span>{part.lang}</span>
              </div>
              <pre className="p-3 overflow-x-auto text-xs font-mono leading-5">
                <code>{part.content}</code>
              </pre>
            </div>
          );
        }

        const lines = part.content.split('\n');
        return (
          <div key={idx} className="space-y-1.5">
            {lines.map((line, lineIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lineIdx} className="h-1" />;
              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={lineIdx} className="font-display font-semibold text-sm pt-2">
                    {renderInlineMarkdown(trimmed.slice(4))}
                  </h4>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={lineIdx} className="font-display font-semibold text-base pt-2">
                    {renderInlineMarkdown(trimmed.slice(3))}
                  </h3>
                );
              }
              if (trimmed.startsWith('# ')) {
                return (
                  <h2 key={lineIdx} className="font-display font-bold text-base pt-2">
                    {renderInlineMarkdown(trimmed.slice(2))}
                  </h2>
                );
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lineIdx} className="flex gap-2 pl-1">
                    <span className="text-zinc-400 select-none">•</span>
                    <span>{renderInlineMarkdown(trimmed.slice(2))}</span>
                  </div>
                );
              }
              return (
                <p key={lineIdx} className="whitespace-pre-wrap">
                  {renderInlineMarkdown(line)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function PipelineTrace({ stages }: { stages: PipelineStageState[] }) {
  const [expanded, setExpanded] = useState(true);
  const allDone = stages.every((s) => s.status === 'done');

  return (
    <div className="mb-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <BrandMark variant="myra" className="w-3.5 h-3.5 text-indigo-500" />
          <span>{allDone ? 'MYRA Pipeline Complete' : 'MYRA Agent Executing'}</span>
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 pt-1 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {stages.map((stage) => (
            <div key={stage.key} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">
                {stage.status === 'done' && (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                )}
                {stage.status === 'active' && (
                  <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                )}
                {stage.status === 'error' && (
                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                )}
                {stage.status === 'pending' && (
                  <span className="inline-block w-3.5 h-3.5 text-center text-zinc-400">
                    ·
                  </span>
                )}
              </span>
              <div className="min-w-0">
                <div className="font-medium text-zinc-800 dark:text-zinc-200">
                  {stage.label}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  {stage.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const GEMINI_MODEL_OPTIONS: Array<{
  id: GeminiModelId;
  label: string;
  badge: string;
}> = [
  { id: 'auto', label: 'Auto (Stable)', badge: 'Router' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', badge: 'Ultra-Stable' },
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', badge: 'Failover Ready' },
  { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', badge: 'Auto-Failover' },
  { id: 'gemini-4-neon', label: 'Gemini 4 Neon', badge: 'Auto-Failover' },
];

export function ChatPane({
  messages,
  workspaceFiles,
  isStreaming,
  agentMode,
  activeTier,
  activeProfile,
  explicitModel,
  activeSpecialist,
  myraEnabled,
  webSearch,
  mapsSearch,
  deepResearch,
  draftSeed,
  onClearDraftSeed,
  onChangeAgentMode,
  onChangeTier,
  onChangeProfile,
  onChangeExplicitModel,
  onChangeSpecialist,
  onOpenSkills,
  onToggleMyra,
  onToggleWebSearch,
  onToggleMapsSearch,
  onToggleDeepResearch,
  onSendMessage,
  onRegenerateMessage,
  onForkFromMessage,
  onStopStreaming,
  onOpenArtifactInWorkbench,
}: ChatPaneProps) {
  const [input, setInput] = useState('');
  const [tierMenuOpen, setTierMenuOpen] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<
    { name: string; content: string; size: number }[]
  >([]);

  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (draftSeed) {
      setInput(draftSeed);
      onClearDraftSeed?.();
    }
  }, [draftSeed, onClearDraftSeed]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  // Slash command autocomplete (covers MYRA + Office + Gemini/GPT/Claude/Kimi/Qoder skills)
  const showSlashPopup = input.startsWith('/') && !input.includes(' ');
  const slashQuery = showSlashPopup ? input.slice(1).toLowerCase() : '';
  const matchingSpecialists = showSlashPopup
    ? SPECIALIST_AGENTS.filter(
        (a) =>
          a.id.includes(slashQuery) ||
          a.name.toLowerCase().includes(slashQuery) ||
          (a.ecosystem && a.ecosystem.toLowerCase().includes(slashQuery)),
      )
    : [];

  // @Context mention autocomplete (matches trailing @token)
  const atMatch = /(?:^|\s)@([a-zA-Z0-9._/-]*)$/.exec(input);
  const showAtPopup = Boolean(atMatch) && !showSlashPopup;
  const atQuery = (atMatch?.[1] ?? '').toLowerCase();
  const contextItems = [
    ...workspaceFiles.map((f) => ({
      token: `@${f.path}`,
      label: f.path,
      detail: `Workspace file (${f.language})`,
    })),
    { token: '@memory', label: 'memory', detail: 'Pinned on-device memory notes' },
    { token: '@web', label: 'web', detail: 'Enable search grounding for this turn' },
    { token: '@maps', label: 'maps', detail: 'Enable Google Maps grounding for this turn' },
    { token: '@diagnostics', label: 'diagnostics', detail: 'Provider & runtime context' },
  ].filter(
    (item) =>
      item.label.toLowerCase().includes(atQuery) ||
      item.detail.toLowerCase().includes(atQuery),
  );

  const activeTierMeta =
    ENGINE_TIERS.find((t) => t.id === activeTier) ?? ENGINE_TIERS[0];
  const activeAgentMeta =
    SPECIALIST_AGENTS.find((s) => s.id === activeSpecialist) ??
    SPECIALIST_AGENTS[0];

  function handleInsertAtMention(token: string) {
    setInput((prev) => prev.replace(/@([a-zA-Z0-9._/-]*)$/, `${token} `));
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (isStreaming) return;
    const trimmed = input.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    onSendMessage(trimmed || 'Analyze the attached file(s).', attachedFiles);
    setInput('');
    setAttachedFiles([]);
    setEnhanceError(null);
  }

  async function handleEnhance() {
    const trimmed = input.trim();
    if (!trimmed || enhancing) return;
    setEnhancing(true);
    setEnhanceError(null);
    try {
      const res = await fetch('/api/ai/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEnhanceError(data.error || 'Could not enhance prompt.');
      } else if (data.enhanced) {
        setInput(data.enhanced);
      }
    } catch {
      setEnhanceError('Network error while enhancing prompt.');
    } finally {
      setEnhancing(false);
    }
  }

  function handleVoiceDictation() {
    const SpeechRec =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!SpeechRec) {
      setVoiceNote('Speech recognition is not supported in this browser.');
      setTimeout(() => setVoiceNote(null), 3000);
      return;
    }

    if (listening) {
      setListening(false);
      return;
    }

    try {
      const recognition = new (SpeechRec as new () => {
        lang: string;
        interimResults: boolean;
        onresult: (ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
      })();
      recognition.lang = 'id-ID';
      recognition.interimResults = false;
      recognition.onresult = (ev) => {
        const transcript = ev.results?.[0]?.[0]?.transcript ?? '';
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => setListening(false);
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
    }
  }

  function handleReadAloud(text: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g, 'Code block omitted.').slice(0, 600));
    window.speechSynthesis.speak(utterance);
  }

  function handleCopyMessage(id: string, content: string) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 1500);
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const file of files.slice(0, 3)) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        setAttachedFiles((prev) => [
          ...prev,
          { name: file.name, content: text.slice(0, 12000), size: file.size },
        ]);
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  }

  return (
    <section
      aria-label="Agent workspace conversation"
      className="flex-1 min-w-0 h-full flex flex-col bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100"
    >
      {/* Agent Mode Bar */}
      <div className="h-11 shrink-0 px-4 sm:px-6 flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-[#09090B]">
        <div
          role="group"
          aria-label="Agent workflow mode"
          className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-200/70 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
        >
          {AGENT_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onChangeAgentMode(m.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                agentMode === m.id
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <span className="hidden sm:inline text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate">
          {activeAgentMeta.command} · {activeTierMeta.name}
        </span>
      </div>

      {/* Messages or Starter Canvas */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto pt-2 pb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-white">
                <BrandMark variant="myai" className="w-6 h-5" />
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                <span>MyAI Multi-Engine</span>
                <span aria-hidden="true"> · </span>
                <span>MYRA Agent</span>
                <span aria-hidden="true"> · </span>
                <span>Live Sandbox</span>
              </div>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white text-balance">
              Build products, diagnose systems, and ship from one workspace.
            </h1>
            <p className="mt-2.5 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl">
              Use <span className="font-mono text-indigo-600 dark:text-indigo-400">/</span> for
              specialist agents and{' '}
              <span className="font-mono text-indigo-600 dark:text-indigo-400">@</span> to pin
              files or memory directly into MYRA’s context.
            </p>

            <div className="mt-6 grid sm:grid-cols-2 gap-3">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setInput(item.prompt)}
                  className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[#111114] hover:border-indigo-400 dark:hover:border-indigo-500/60 text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    <span>{item.label}</span>
                    <Code2 className="w-3.5 h-3.5 text-zinc-400 group-hover:text-indigo-500 shrink-0" />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                    {item.prompt}
                  </p>
                </button>
              ))}
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Office Suite &amp; Multi-Lab Skills (Gemini · GPT · Claude · Kimi · Qoder)
                </span>
                <button
                  type="button"
                  onClick={onOpenSkills}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Browse all {SPECIALIST_AGENTS.length} skills →
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2 mb-3">
                {AGENT_SKILLS.slice(0, 3).map((officeSkill) => {
                  const OfficeIcon =
                    officeSkill.id === 'word'
                      ? FileText
                      : officeSkill.id === 'ppt'
                        ? Presentation
                        : FileSpreadsheet;
                  return (
                    <button
                      key={officeSkill.id}
                      type="button"
                      onClick={() => {
                        onChangeSpecialist(officeSkill.id);
                        setInput(officeSkill.starterPrompt);
                      }}
                      className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-indigo-500/60 text-left transition-colors cursor-pointer flex items-center gap-2.5"
                    >
                      <OfficeIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {officeSkill.command} ·{' '}
                          {officeSkill.id === 'word'
                            ? 'Word (.docx)'
                            : officeSkill.id === 'ppt'
                              ? 'PowerPoint (.pptx)'
                              : 'Excel (.xlsx)'}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          Live preview &amp; download
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {SPECIALIST_AGENTS.filter((a) =>
                  [
                    'myra',
                    'coder',
                    'deep-research',
                    'canvas',
                    'artifacts',
                    'long-context',
                    'repowiki',
                    'quest',
                  ].includes(a.id),
                ).map((agent) => {
                  const active = agent.id === activeSpecialist;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => {
                        onChangeSpecialist(agent.id);
                        const isExistingPreset =
                          !input.trim() ||
                          QUICK_PROMPTS.some((q) => q.prompt === input) ||
                          SPECIALIST_AGENTS.some(
                            (s) => s.starterPrompt === input || `${s.command} ` === input,
                          );
                        if (isExistingPreset) {
                          setInput(agent.starterPrompt || `${agent.command} `);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-200/70 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'
                      }`}
                    >
                      {agent.command}
                      {agent.ecosystem ? ` · ${agent.ecosystem}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <article
                  key={msg.id}
                  className={
                    isUser
                      ? 'ml-auto max-w-[85%] rounded-2xl px-4 py-3 bg-zinc-200/80 dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-100'
                      : 'space-y-2'
                  }
                >
                  {!isUser && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <BrandMark
                          variant={msg.myraEnabled ? 'myra' : 'myai'}
                          className="w-4 h-4 text-indigo-500"
                        />
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          {msg.myraEnabled ? 'MYRA Agent' : 'MyAI'}
                        </span>
                        {msg.specialist && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">/{msg.specialist}</span>
                          </>
                        )}
                        {msg.routedModel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              title={msg.failoverReason || `Executed on ${msg.routedModel}`}
                              className="font-mono text-[11px]"
                            >
                              {msg.failoverFrom
                                ? `${msg.failoverFrom} → ${msg.routedModel}`
                                : msg.routedModel}
                            </span>
                          </>
                        )}
                      </div>
                      {msg.metrics && (
                        <span className="font-mono text-[11px] tabular-nums">
                          {msg.metrics.totalTokens} tok · {msg.metrics.latencyMs}ms
                        </span>
                      )}
                    </div>
                  )}

                  {!isUser && msg.stages && msg.stages.length > 0 && (
                    <PipelineTrace stages={msg.stages} />
                  )}

                  {msg.error ? (
                    <div className="p-3.5 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium">Request could not complete</div>
                        <p className="mt-0.5 opacity-90">{msg.error}</p>
                      </div>
                    </div>
                  ) : (
                    renderMessageBody(msg.content)
                  )}

                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                      {msg.attachments.map((att) => (
                        <span key={att.name}>
                          Attached: {att.name} ({Math.ceil(att.size / 1024)} KB)
                        </span>
                      ))}
                    </div>
                  )}

                  {!isUser && msg.sources && msg.sources.length > 0 && (
                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                      <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        Grounded Sources ({msg.sources.some((s) => s.kind === 'maps') ? 'Google Maps & Web' : 'Google Search'})
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                        {msg.sources.map((src) => (
                          <div key={src.url} className="space-y-0.5">
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              {src.kind === 'maps' && <MapPin className="w-3 h-3 shrink-0" />}
                              <span className="truncate max-w-[220px]">{src.title}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                            {src.reviewSnippets && src.reviewSnippets.length > 0 && (
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-md italic">
                                “{src.reviewSnippets[0]}”
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isUser && !isStreaming && (msg.content || msg.error) && (
                    <div className="pt-1.5 flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                      {msg.content && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                            className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer"
                          >
                            {copiedMsgId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReadAloud(msg.content)}
                            className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>Listen</span>
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => onRegenerateMessage(msg.id)}
                        className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Regenerate</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onForkFromMessage(msg.id)}
                        className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>Branch</span>
                      </button>
                      {msg.content.includes('```') && (
                        <button
                          type="button"
                          onClick={onOpenArtifactInWorkbench}
                          className="inline-flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          <FileCode2 className="w-3.5 h-3.5" />
                          <span>Inspect in Workbench</span>
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 px-4 sm:px-6 pb-4 pt-2 border-t border-zinc-200/80 dark:border-zinc-800/70 bg-zinc-50/90 dark:bg-[#09090B]/95">
        <div className="max-w-2xl mx-auto relative">
          {showSlashPopup && matchingSpecialists.length > 0 && (
            <div
              role="listbox"
              aria-label="Slash command specialists"
              className="absolute bottom-full left-0 right-0 mb-2 max-h-56 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] shadow-xl p-1.5 z-20"
            >
              {matchingSpecialists.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    onChangeSpecialist(agent.id);
                    setInput(`${agent.command} `);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <strong className="font-mono text-indigo-600 dark:text-indigo-400 shrink-0">
                      {agent.command}
                    </strong>
                    {agent.ecosystem && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 shrink-0">
                        {agent.ecosystem}
                      </span>
                    )}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {agent.name}
                    </span>
                  </span>
                  <span className="text-zinc-500 truncate max-w-[220px]">{agent.role}</span>
                </button>
              ))}
            </div>
          )}

          {showAtPopup && contextItems.length > 0 && (
            <div
              role="listbox"
              aria-label="Pin @context items"
              className="absolute bottom-full left-0 right-0 mb-2 max-h-52 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] shadow-xl p-1.5 z-20"
            >
              {contextItems.map((item) => (
                <button
                  key={item.token}
                  type="button"
                  onClick={() => handleInsertAtMention(item.token)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <span className="font-mono text-indigo-600 dark:text-indigo-400 font-medium">
                    {item.token}
                  </span>
                  <span className="text-zinc-500 truncate">{item.detail}</span>
                </button>
              ))}
            </div>
          )}

          {attachedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachedFiles.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                >
                  <span>{f.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove attachment ${f.name}`}
                    onClick={() =>
                      setAttachedFiles((prev) =>
                        prev.filter((item) => item.name !== f.name),
                      )
                    }
                    className="text-zinc-500 hover:text-red-500 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {(enhanceError || voiceNote) && (
            <p className="mb-2 text-xs text-amber-500">{enhanceError || voiceNote}</p>
          )}

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#111114] focus-within:border-indigo-500 dark:focus-within:border-indigo-500/80 transition-colors"
          >
            <label htmlFor="workspace-composer" className="sr-only">
              Message MYRA or MyAI
            </label>
            <textarea
              id="workspace-composer"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={`Ask ${activeAgentMeta.name} (${activeAgentMeta.command}), type @ to pin files, or describe an app...`}
              className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />

            <div className="px-3 pb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.json,.ts,.tsx,.js,.jsx,.html,.css,.csv,.py"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach code or text file"
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setInput((p) => (p.endsWith('@') ? p : `${p}@`))}
                  aria-label="Insert @context mention"
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <AtSign className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleVoiceDictation}
                  aria-label={listening ? 'Stop voice dictation' : 'Voice dictation'}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    listening
                      ? 'bg-red-600 text-white'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={onToggleMyra}
                  aria-pressed={myraEnabled}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    myraEnabled
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  <BrandMark variant="myra" className="w-3.5 h-3.5" />
                  <span>MYRA</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleWebSearch}
                  aria-pressed={webSearch}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    webSearch
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Search</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleMapsSearch}
                  aria-pressed={mapsSearch}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mapsSearch
                      ? 'bg-emerald-600 text-white'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Maps</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleDeepResearch}
                  aria-pressed={deepResearch}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    deepResearch
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Research</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenSkills}
                  aria-label="Open Skills Hub"
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Skills</span>
                </button>

                <button
                  type="button"
                  onClick={handleEnhance}
                  disabled={!input.trim() || enhancing}
                  aria-label="Enhance prompt"
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {enhancing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">Enhance</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 relative flex-wrap justify-end">
                <label className="sr-only" htmlFor="engine-profile-select">
                  Engine Profile
                </label>
                <select
                  id="engine-profile-select"
                  value={activeProfile}
                  onChange={(e) => onChangeProfile(e.target.value as EngineProfileId)}
                  className="px-2 py-1 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 max-w-[168px]"
                >
                  {ENGINE_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="explicit-gemini-model">
                  Gemini Model
                </label>
                <select
                  id="explicit-gemini-model"
                  value={explicitModel}
                  onChange={(e) => onChangeExplicitModel(e.target.value as GeminiModelId)}
                  className="px-2 py-1 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 max-w-[140px]"
                >
                  {GEMINI_MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTierMenuOpen((prev) => !prev)}
                    aria-expanded={tierMenuOpen}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-500" />
                    <span>{activeTierMeta.name}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  </button>

                  {tierMenuOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141418] shadow-xl p-1.5 z-30">
                      {ENGINE_TIERS.map((tier) => (
                        <button
                          key={tier.id}
                          type="button"
                          onClick={() => {
                            onChangeTier(tier.id);
                            setTierMenuOpen(false);
                          }}
                          className={`w-full px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                            tier.id === activeTier
                              ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
                          }`}
                        >
                          <div className="font-medium flex items-center justify-between">
                            <span>{tier.name}</span>
                            <span className="font-mono text-[10px] text-zinc-500">
                              {tier.backendModel}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {tier.tagline}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={onStopStreaming}
                    aria-label="Stop generation"
                    className="p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors shrink-0 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim() && attachedFiles.length === 0}
                    aria-label="Send message"
                    className="p-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0 cursor-pointer"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
