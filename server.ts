import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  type LiveServerMessage,
} from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import { detectIntentAndRoute, parseSlashCommand } from './src/utils/routerEngine';
import {
  buildModelSafeThinkingLevel,
  buildResilientModelChain,
  classifyGeminiError,
  CORE_GEMINI_MODELS,
  isModelInCooldown,
  recordModelFailure,
  recordModelSuccess,
  sanitizeChatHistory,
  type CoreGeminiModel,
  type ModelHealthRecord,
} from './src/utils/modelStability';
import { SPECIALIST_AGENTS } from './src/data/catalog';
import { ENGINE_PROFILES } from './src/data/skills';
import type {
  AgentApproach,
  EngineProfileId,
  EngineTierId,
  GeminiModelId,
  GroundingSource,
  InterfaceLanguage,
  MemoryNote,
  ProviderDiagnosticResult,
  SpecialistSlashId,
  WorkspaceFile,
} from './src/types/workspace';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const modelHealthMap = new Map<CoreGeminiModel, ModelHealthRecord>();

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unwrapReadableErrorMessage(raw: string): string {
  let msg = raw.trim();
  for (let depth = 0; depth < 3; depth++) {
    if (!msg.startsWith('{')) break;
    try {
      const parsed = JSON.parse(msg) as { error?: { message?: string }; message?: string };
      const inner = parsed?.error?.message ?? parsed?.message;
      if (typeof inner === 'string' && inner.trim()) {
        msg = inner.trim();
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return msg;
}

function formatUpstreamError(err: unknown, paidHint = false): {
  status: number;
  message: string;
} {
  const raw = err instanceof Error ? err.message : 'Unexpected upstream error';
  const cleanMsg = unwrapReadableErrorMessage(raw);
  const lower = `${raw} ${cleanMsg}`.toLowerCase();
  if (
    lower.includes('403') ||
    lower.includes('permission_denied') ||
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    paidHint
  ) {
    return {
      status: lower.includes('429') || lower.includes('resource_exhausted') ? 429 : 403,
      message: `${cleanMsg}${
        paidHint
          ? ' (This model requires a billing-enabled GEMINI_API_KEY in Settings > Secrets.)'
          : ''
      }`,
    };
  }
  return { status: 502, message: cleanMsg };
}

function mapThinkingLevel(level: 'LOW' | 'MEDIUM' | 'HIGH'): ThinkingLevel {
  switch (level) {
    case 'LOW':
      return ThinkingLevel.LOW;
    case 'HIGH':
      return ThinkingLevel.HIGH;
    default:
      return ThinkingLevel.MEDIUM;
  }
}

function extractGroundingSources(groundingChunks: unknown): GroundingSource[] {
  const out: GroundingSource[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(groundingChunks)) return out;

  for (const chunk of groundingChunks as Array<{
    web?: { uri?: string; title?: string };
    maps?: {
      uri?: string;
      title?: string;
      placeAnswerSources?: {
        reviewSnippets?: Array<{ content?: string }>;
      };
    };
  }>) {
    if (chunk?.web?.uri && !seen.has(chunk.web.uri)) {
      seen.add(chunk.web.uri);
      out.push({
        kind: 'web',
        title: chunk.web.title || chunk.web.uri,
        url: chunk.web.uri,
      });
    }
    if (chunk?.maps?.uri && !seen.has(chunk.maps.uri)) {
      seen.add(chunk.maps.uri);
      const snippets = (chunk.maps.placeAnswerSources?.reviewSnippets ?? [])
        .map((r) => r?.content?.trim())
        .filter((s): s is string => Boolean(s))
        .slice(0, 3);
      out.push({
        kind: 'maps',
        title: chunk.maps.title || 'Google Maps Place',
        url: chunk.maps.uri,
        reviewSnippets: snippets.length > 0 ? snippets : undefined,
      });
    }
  }
  return out;
}

function buildSystemInstruction(params: {
  specialist: SpecialistSlashId;
  engineProfile: EngineProfileId;
  agentMode: 'build' | 'code' | 'ask' | 'research';
  myraEnabled: boolean;
  deepResearch: boolean;
  language: InterfaceLanguage;
  approach: AgentApproach;
  memoryNotes: MemoryNote[];
  workspaceFiles: WorkspaceFile[];
  atMentions: string[];
}): string {
  const specMeta =
    SPECIALIST_AGENTS.find((s) => s.id === params.specialist) ?? SPECIALIST_AGENTS[0];
  const profileMeta =
    ENGINE_PROFILES.find((p) => p.id === params.engineProfile) ?? ENGINE_PROFILES[0];

  const langDirective =
    params.language === 'id'
      ? 'Respond in clear, natural Indonesian (unless the user explicitly writes in English).'
      : 'Match the user language naturally (English or Indonesian).';

  const approachMap: Record<AgentApproach, string> = {
    balanced: 'Balance clarity, practical depth, and clean structure.',
    'coding-partner':
      'Act as a senior pair programmer: prioritize runnable code, edge cases, and clean file structure.',
    tutor: 'Explain concepts step-by-step with intuition and clear examples.',
    concise: 'Be ultra-concise, structured with bullet points, zero fluff.',
  };

  const modeMap: Record<'build' | 'code' | 'ask' | 'research', string> = {
    build:
      'Agent Mode = BUILD: Focus on shipping complete, cohesive, runnable UI/app or Office (.docx.json / .pptx.json / .xlsx.json) artifacts ready for instant preview.',
    code:
      'Agent Mode = CODE: Focus on clean modular engineering, explicit file names (```ts:path/file.ts), diffs, and edge-case correctness.',
    ask: 'Agent Mode = ASK: Answer directly and cleanly without unnecessary scaffolding unless requested.',
    research:
      'Agent Mode = RESEARCH: Synthesize multi-angle evidence, cite web sources, and compare trade-offs rigorously.',
  };

  const memoryHighlighted = params.atMentions.includes('memory');
  const memoryBlock =
    params.memoryNotes.length > 0
      ? `\n${memoryHighlighted ? 'Pinned @memory Context (HIGH PRIORITY)' : 'User Workspace Memory'}:\n${params.memoryNotes.map((m) => `- ${m.text}`).join('\n')}`
      : memoryHighlighted
        ? '\nPinned @memory Context: User explicitly referenced @memory, though no saved memory notes exist yet.'
        : '';

  const diagnosticsHighlighted = params.atMentions.includes('diagnostics');
  const diagnosticsBlock = diagnosticsHighlighted
    ? `\nRuntime @diagnostics Context:\n- Engine Profile: ${profileMeta.name} (${profileMeta.id})\n- Mode: ${params.agentMode}, MYRA Pipeline: ${params.myraEnabled ? 'ON' : 'OFF'}\n- Health Cache: ${
        modelHealthMap.size > 0
          ? Array.from(modelHealthMap.values())
              .map((r) => `${r.model}=${r.status}${r.lastLatencyMs ? `(${r.lastLatencyMs}ms)` : ''}`)
              .join(', ')
          : 'All core Gemini models ready (fresh pool)'
      }`
    : '';

  const referencedFiles = params.workspaceFiles.filter((f) =>
    params.atMentions.includes(f.path),
  );

  const filesBlock =
    referencedFiles.length > 0
      ? `\nPinned @Referenced Workspace Files (Full Contents):\n${referencedFiles
          .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 10000)}`)
          .join('\n\n')}`
      : params.workspaceFiles.length > 0
        ? `\nActive Workbench Files (context):\n${params.workspaceFiles
            .slice(0, 5)
            .map((f) => `- ${f.path} (${f.language}, ${f.content.length} chars)`)
            .join('\n')}`
        : '';

  const myraDirective = params.myraEnabled
    ? `You are MYRA, MyAI Studio's built-in agentic builder. Follow a structured workflow: briefly summarize your plan, produce complete runnable artifacts when building UI/code/Office documents, and keep prose lean and token-efficient. Whenever generating runnable web UI, output a complete standalone HTML file using <!-- file: index.html --> followed by a \`\`\`html code block or explicit named blocks like \`\`\`tsx:App.tsx so the live workbench renders it immediately.`
    : `You are MyAI Studio, a helpful multi-engine AI workspace. When generating code, web UI, or Office documents, label blocks with file comments like <!-- file: index.html --> or \`\`\`word:document.docx.json / \`\`\`ppt:presentation.pptx.json / \`\`\`excel:workbook.xlsx.json so the workbench can preview and export them.`;

  const researchDirective = params.deepResearch
    ? 'Deep Research Mode is ON: perform thorough multi-angle analysis, state trade-offs explicitly, and cite grounded sources.'
    : '';

  return [
    myraDirective,
    `Engine Profile (${profileMeta.name} - ${profileMeta.vendor}): ${profileMeta.systemDirective}`,
    modeMap[params.agentMode],
    `Active Specialist Niche (${specMeta.command} - ${specMeta.name} | Role: ${specMeta.role}): ${specMeta.directive} Stay strictly accurate to this niche, deliver concrete domain-specific details instead of generic boilerplate, and structure answers so they can be acted on immediately.`,
    `Approach: ${approachMap[params.approach]}`,
    langDirective,
    researchDirective,
    memoryBlock,
    diagnosticsBlock,
    filesBlock,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function sendSseEvent(res: Response, event: string, data: unknown) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  const httpServer = http.createServer(app);

  // Real-time Gemini Live Voice bridge via WebSocket (/api/live-ws)
  const wss = new WebSocketServer({ server: httpServer, path: '/api/live-ws' });
  wss.on('connection', async (clientWs, req) => {
    const ai = getGeminiClient();
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          error:
            'GEMINI_API_KEY is missing or unset. Add your key in Settings > Secrets.',
        }),
      );
      clientWs.close();
      return;
    }

    const urlObj = new URL(req.url || '/api/live-ws', `http://localhost:${PORT}`);
    const voiceName = urlObj.searchParams.get('voice') || 'Zephyr';

    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    try {
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            'You are MYAI Live Voice Assistant inside MyAI Studio. Be natural, warm, concise, and helpful in Indonesian or English matching the speaker.',
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== clientWs.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  inputTranscript: content.inputTranscription.text,
                }),
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  outputTranscript: content.outputTranscription.text,
                }),
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onerror: (err: unknown) => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(
                JSON.stringify({
                  error:
                    err instanceof Error ? err.message : 'Live session error',
                }),
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ closed: true }));
            }
          },
        },
      });

      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({ ready: true, model: 'gemini-3.8-live', voice: voiceName }));
      }
    } catch (err) {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(
          JSON.stringify({
            error:
              err instanceof Error
                ? err.message
                : 'Failed to connect to gemini-3.8-live',
          }),
        );
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession) return;
      try {
        const parsed = JSON.parse(raw.toString()) as {
          audio?: string;
          text?: string;
        };
        if (parsed.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (parsed.text) {
          liveSession.sendRealtimeInput({ text: parsed.text });
        }
      } catch {
        // Ignore malformed frame
      }
    });

    clientWs.on('close', () => {
      try {
        liveSession?.close();
      } catch {
        // Ignore close cleanup error
      }
    });
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    const hasGemini = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
    );
    res.json({
      ok: true,
      service: 'myai-studio',
      timestamp: new Date().toISOString(),
      geminiConfigured: hasGemini,
    });
  });

  app.get('/api/maps/config', (_req: Request, res: Response) => {
    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY?.trim() ||
      process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
      '';
    res.json({
      apiKey,
      mapId: 'DEMO_MAP_ID',
      attributionId: 'gmp_mcp_codeassist_v1_aistudio',
    });
  });

  app.get('/api/providers/status', async (req: Request, res: Response) => {
    const liveProbe = req.query.probe === '1';
    const ai = getGeminiClient();
    const results: ProviderDiagnosticResult[] = [];

    if (!ai) {
      results.push({
        id: 'gemini',
        name: 'Google Gemini (Server SDK)',
        role: 'Chat, Live Voice, Search & Maps Grounding, Image, Music & Video',
        status: 'unconfigured',
        latencyMs: null,
        detail:
          'GEMINI_API_KEY is not configured in environment secrets. Add it in Settings > Secrets to enable live AI generation.',
        models: [
          'gemini-4-hydrogen',
          'gemini-3.1-flash-lite',
          'gemini-3.8-live',
          'gemini-3.5-transcribe',
        ],
      });
    } else if (liveProbe) {
      const start = Date.now();
      const probeResults = await Promise.all(
        CORE_GEMINI_MODELS.map(async (modelId) => {
          const mStart = Date.now();
          try {
            await withTimeout(
              ai.models.generateContent({
                model: modelId,
                contents: 'Reply with OK',
                config: {
                  thinkingConfig: {
                    thinkingLevel: mapThinkingLevel(
                      buildModelSafeThinkingLevel(modelId, 'LOW'),
                    ),
                  },
                },
              }),
              7000,
              `Probe ${modelId}`,
            );
            const latency = Date.now() - mStart;
            recordModelSuccess(modelHealthMap, modelId, latency);
            return { modelId, ok: true, latency, note: 'stable' };
          } catch (err) {
            const classified = classifyGeminiError(err);
            recordModelFailure(modelHealthMap, modelId, classified);
            const label =
              classified.kind === 'quota_or_billing'
                ? 'failover-ready (free-tier quota -> Flash Lite)'
                : 'failover-ready (busy -> Flash Lite)';
            return {
              modelId,
              ok: false,
              latency: Date.now() - mStart,
              note: label,
            };
          }
        }),
      );

      const healthyCount = probeResults.filter((r) => r.ok).length;
      const primaryOk = probeResults.find((r) => r.ok);
      results.push({
        id: 'gemini',
        name: 'Google Gemini (Resilient Failover Core)',
        role: 'Chat, Office (.docx/.pptx/.xlsx), Search & Maps Grounding, Image, Music & Video',
        status: healthyCount > 0 ? 'connected' : 'error',
        latencyMs: primaryOk?.latency ?? Date.now() - start,
        detail:
          healthyCount > 0
            ? `${healthyCount}/${CORE_GEMINI_MODELS.length} direct models active; automatic failover keeps all model presets & skills stable.`
            : 'All core models failed live probe. Check GEMINI_API_KEY in Settings > Secrets.',
        models: probeResults.map((r) =>
          r.ok ? `${r.modelId} (${r.latency}ms)` : `${r.modelId} [${r.note}]`,
        ),
      });
    } else {
      results.push({
        id: 'gemini',
        name: 'Google Gemini (Resilient Failover Core)',
        role: 'Chat, Office (.docx/.pptx/.xlsx), Search & Maps Grounding, Image, Music & Video',
        status: 'ready',
        latencyMs: null,
        detail:
          'Server key present with automatic multi-model failover enabled. Click "Run Live Probe" to inspect per-model latency.',
        models: [
          'gemini-3.1-flash-lite',
          'gemini-4-hydrogen',
          'gemini-4-carbon (auto-failover)',
          'gemini-4-neon (auto-failover)',
          'gemini-nano-banana-2.1',
          'lyria-3-clip-preview',
          'gemini-omni-1.2-flash',
          'gemini-3.8-live',
          'gemini-3.5-transcribe',
        ],
      });
    }

    const externalGateways = [
      {
        id: 'openrouter',
        name: 'OpenRouter Gateway',
        envVar: 'OPENROUTER_API_KEY',
        role: 'Multi-lab model gateway (Qwen, DeepSeek, Claude, GPT, Llama)',
        models: ['Qwen3.8 27B', 'DeepSeek V4', 'Claude Opus 5', 'GPT-5.2'],
      },
      {
        id: 'groq',
        name: 'Groq LPU Inference',
        envVar: 'GROQ_API_KEY',
        role: 'Ultra-fast token generation & Whisper speech',
        models: ['Llama 3.3 70B', 'Qwen3.8 27B', 'Compound'],
      },
      {
        id: 'nvidia',
        name: 'NVIDIA NIM',
        envVar: 'NVIDIA_NIM_API_KEY',
        role: 'Hosted Nemotron, Qwen3 Coder & multimodal inference',
        models: ['Nemotron 3 Ultra', 'Qwen3 Coder 480B', 'DeepSeek V4 Pro'],
      },
    ];

    for (const gw of externalGateways) {
      const configured = Boolean(process.env[gw.envVar]?.trim());
      results.push({
        id: gw.id,
        name: gw.name,
        role: gw.role,
        status: configured ? 'ready' : 'unconfigured',
        latencyMs: null,
        detail: configured
          ? `${gw.envVar} detected on server.`
          : `Optional BYOK connector (${gw.envVar} not set; MyAI Studio routes through Gemini).`,
        models: gw.models,
      });
    }

    results.push({
      id: 'local',
      name: 'Local AI (Ollama / WebGPU)',
      role: 'On-device private inference (Qwen2.5 Coder, Llama 3.2)',
      status: 'ready',
      latencyMs: null,
      detail: 'Client-side WebGPU / localhost Ollama bridge metadata.',
      models: ['Qwen2.5 Coder 1.5B', 'Qwen3 0.6B', 'Llama 3.2 1B'],
    });

    res.json({
      checkedAt: new Date().toISOString(),
      providers: results,
    });
  });

  app.post('/api/ai/enhance', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error:
          'GEMINI_API_KEY is not configured. Check Settings > Secrets to enable prompt enhancement.',
      });
      return;
    }

    const rawPrompt = String(req.body?.prompt ?? '').trim();
    if (!rawPrompt) {
      res.status(400).json({ error: 'Prompt cannot be empty.' });
      return;
    }

    const chain = buildResilientModelChain('gemini-3.1-flash-lite', modelHealthMap);
    let lastErr: unknown = null;
    for (const candidateModel of chain) {
      const mStart = Date.now();
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model: candidateModel,
            contents: `Rewrite and sharpen this user prompt for an agentic AI product builder so it is clear, structured, and yields high-quality output. Preserve the original language and intent. Return ONLY the improved prompt text without quotes or preamble.\n\nOriginal prompt:\n${rawPrompt}`,
            config: {
              thinkingConfig: {
                thinkingLevel: mapThinkingLevel(
                  buildModelSafeThinkingLevel(candidateModel, 'LOW'),
                ),
              },
            },
          }),
          9000,
          `Enhance (${candidateModel})`,
        );
        recordModelSuccess(modelHealthMap, candidateModel, Date.now() - mStart);
        res.json({ enhanced: (response.text ?? rawPrompt).trim() });
        return;
      } catch (err) {
        lastErr = err;
        const classified = classifyGeminiError(err);
        recordModelFailure(modelHealthMap, candidateModel, classified);
        if (!classified.retryableWithFallback) break;
      }
    }
    const { status, message } = formatUpstreamError(lastErr);
    res.status(status).json({ error: message });
  });

  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error:
          'GEMINI_API_KEY is missing or unset. Please check your key in the Settings > Secrets panel.',
      });
      return;
    }

    const body = req.body ?? {};
    const rawPrompt = String(body.prompt ?? '').trim();
    if (!rawPrompt) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const selectedTier = (body.tier ?? 'auto') as EngineTierId;
    const explicitModel = (body.explicitModel ?? 'auto') as GeminiModelId;
    const engineProfile = (body.engineProfile ?? 'myai-auto') as EngineProfileId;
    const activeSpecialist = (body.specialist ?? 'myra') as SpecialistSlashId;
    const agentMode = (body.agentMode ?? 'build') as
      | 'build'
      | 'code'
      | 'ask'
      | 'research';
    const myraEnabled = Boolean(body.myraEnabled ?? true);
    const mapsSearch = Boolean(body.mapsSearch ?? false);
    const webSearch =
      !mapsSearch && (Boolean(body.webSearch ?? false) || agentMode === 'research');
    const deepResearch =
      Boolean(body.deepResearch ?? false) || agentMode === 'research';
    const userLocation = body.userLocation as
      | { latitude?: number; longitude?: number }
      | undefined;
    const atMentions = Array.isArray(body.atMentions)
      ? (body.atMentions as string[])
      : [];
    const language = (body.language ?? 'en') as InterfaceLanguage;
    const approach = (body.approach ?? 'balanced') as AgentApproach;
    const memoryNotes = Array.isArray(body.memoryNotes)
      ? (body.memoryNotes as MemoryNote[])
      : [];
    const workspaceFiles = Array.isArray(body.workspaceFiles)
      ? (body.workspaceFiles as WorkspaceFile[])
      : [];
    const history = Array.isArray(body.history)
      ? (body.history as Array<{ role: 'user' | 'assistant'; content: string }>)
      : [];

    const route = detectIntentAndRoute({
      prompt: rawPrompt,
      selectedTier,
      activeSpecialist,
      agentMode,
      engineProfile,
      explicitModel,
      myraEnabled,
      webSearch,
      deepResearch,
    });

    const { cleanPrompt } = parseSlashCommand(rawPrompt);
    const effectivePrompt = cleanPrompt || rawPrompt;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let clientClosed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
      }
    });

    const startTime = Date.now();
    const candidateModels = buildResilientModelChain(
      route.geminiModel,
      modelHealthMap,
    );

    let lastClassified = classifyGeminiError(new Error('unknown'));

    try {
      sendSseEvent(res, 'route', { ...route, engineProfile });
      sendSseEvent(res, 'stage', { key: 'analysis', status: 'done' });
      sendSseEvent(res, 'stage', { key: 'planning', status: 'active' });

      const systemInstruction = buildSystemInstruction({
        specialist: route.specialist,
        engineProfile,
        agentMode,
        myraEnabled,
        deepResearch,
        language,
        approach,
        memoryNotes,
        workspaceFiles,
        atMentions,
      });

      const contents = sanitizeChatHistory(history, effectivePrompt, 12);

      sendSseEvent(res, 'stage', { key: 'planning', status: 'done' });
      sendSseEvent(res, 'stage', { key: 'execution', status: 'active' });

      const sourcesByUrl = new Map<string, GroundingSource>();
      let promptTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;
      let succeededModel: CoreGeminiModel | null = null;
      let lastUpstreamErr: unknown = null;
      let failoverReason: string | undefined;

      // Filter out models currently in quota_blocked cooldown (unless it's our final flash-lite workhorse),
      // and finish with spaced Flash Lite recovery slots so transient 503/timeout spikes always recover cleanly.
      const activeCandidates = candidateModels.filter((m) => {
        if (m === 'gemini-3.1-flash-lite') return true;
        const rec = modelHealthMap.get(m);
        return !(rec?.status === 'quota_blocked' && isModelInCooldown(rec));
      });

      const attemptQueue: Array<{
        model: CoreGeminiModel;
        backoffMs: number;
        allowTools: boolean;
        forceLowThinking?: boolean;
      }> = [
        ...activeCandidates.map((model) => ({
          model,
          backoffMs: 0,
          allowTools: true,
        })),
        { model: 'gemini-3.1-flash-lite', backoffMs: 1100, allowTools: true, forceLowThinking: true },
        { model: 'gemini-3.1-flash-lite', backoffMs: 2200, allowTools: true, forceLowThinking: true },
      ];

      let addedToolFallback = false;
      let addedTransientFinalRetry = false;

      for (let i = 0; i < attemptQueue.length; i++) {
        if (clientClosed) break;
        const { model: candidate, backoffMs, allowTools, forceLowThinking } = attemptQueue[i];
        if (backoffMs > 0) {
          await sleepMs(backoffMs);
        }
        const modelStart = Date.now();
        let emittedChunks = false;

        const effectiveSystemInstruction = allowTools
          ? systemInstruction
          : `${systemInstruction}\n\nNote: Live Google Search/Maps grounding quota is unavailable for the active key. Do not claim real-time external lookup; answer directly and transparently using built-in knowledge.`;

        const requestedThinking = forceLowThinking
          ? 'LOW'
          : buildModelSafeThinkingLevel(candidate, route.thinkingLevel);

        const config: Record<string, unknown> = {
          systemInstruction: effectiveSystemInstruction,
          thinkingConfig: {
            thinkingLevel: mapThinkingLevel(requestedThinking),
          },
        };

        // googleMaps cannot be combined with googleSearch in the same request
        if (allowTools && mapsSearch) {
          config.tools = [{ googleMaps: {} }];
          if (
            userLocation &&
            typeof userLocation.latitude === 'number' &&
            typeof userLocation.longitude === 'number' &&
            Number.isFinite(userLocation.latitude) &&
            Number.isFinite(userLocation.longitude)
          ) {
            config.toolConfig = {
              retrievalConfig: {
                latLng: {
                  latitude: userLocation.latitude,
                  longitude: userLocation.longitude,
                },
              },
            };
          }
        } else if (allowTools && (webSearch || deepResearch)) {
          config.tools = [{ googleSearch: {} }];
        }

        const hasActiveTool = Boolean(config.tools);
        const connectTimeoutMs =
          candidate === 'gemini-3.1-flash-lite'
            ? hasActiveTool
              ? 22000
              : 20000
            : hasActiveTool
              ? 12000
              : 9000;
        const firstTokenTimeoutMs =
          candidate === 'gemini-3.1-flash-lite'
            ? hasActiveTool
              ? 24000
              : 22000
            : hasActiveTool
              ? 14000
              : 10000;

        try {
          const stream = await withTimeout(
            ai.models.generateContentStream({
              model: candidate,
              contents,
              config,
            }),
            connectTimeoutMs,
            `Stream connect (${candidate})`,
          );

          const iterator = stream[Symbol.asyncIterator]();
          const firstStep = await withTimeout(
            iterator.next(),
            firstTokenTimeoutMs,
            `First token (${candidate})`,
          );

          // First token succeeded! If we failed over or stripped grounding tools, notify UI cleanly.
          if (candidate !== route.geminiModel || !allowTools) {
            sendSseEvent(res, 'route', {
              ...route,
              engineProfile,
              geminiModel: candidate,
              failoverFrom: route.geminiModel,
              failoverReason:
                failoverReason ||
                `${route.geminiModel} unavailable; seamlessly routed to ${candidate}`,
            });
          }

          const processChunk = (
            chunk: Awaited<ReturnType<typeof iterator.next>>['value'],
          ) => {
            if (!chunk) return;
            if (chunk.text) {
              emittedChunks = true;
              sendSseEvent(res, 'chunk', { text: chunk.text });
            }

            const groundingChunks =
              chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
            for (const src of extractGroundingSources(groundingChunks)) {
              if (!sourcesByUrl.has(src.url)) {
                sourcesByUrl.set(src.url, src);
              }
            }

            if (chunk.usageMetadata) {
              promptTokens =
                chunk.usageMetadata.promptTokenCount ?? promptTokens;
              outputTokens =
                chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
              totalTokens =
                chunk.usageMetadata.totalTokenCount ??
                promptTokens + outputTokens;
            }
          };

            if (!firstStep.done) {
              processChunk(firstStep.value);
              while (!clientClosed) {
                const step = await withTimeout(
                  iterator.next(),
                  25000,
                  `Stream read (${candidate})`,
                );
                if (step.done) break;
                processChunk(step.value);
              }
            }

            recordModelSuccess(modelHealthMap, candidate, Date.now() - modelStart);
            succeededModel = candidate;
            break;
          } catch (err) {
            if (clientClosed) {
              if (!res.writableEnded) res.end();
              return;
            }
            lastUpstreamErr = err;
            const classified = classifyGeminiError(err);
            lastClassified = classified;
            recordModelFailure(modelHealthMap, candidate, classified);

            // If grounding tools (googleSearch/googleMaps) hit Free Tier quota, 400, or tool attempts failed, queue tool-free Flash Lite fallbacks
            const hasGroundingTool =
              allowTools && (mapsSearch || webSearch || deepResearch);
            if (
              !emittedChunks &&
              hasGroundingTool &&
              !addedToolFallback &&
              (classified.kind === 'quota_or_billing' ||
                classified.kind === 'bad_request' ||
                i === attemptQueue.length - 1)
            ) {
              addedToolFallback = true;
              attemptQueue.push(
                {
                  model: 'gemini-3.1-flash-lite',
                  backoffMs: 600,
                  allowTools: false,
                  forceLowThinking: true,
                },
                {
                  model: 'gemini-3.1-flash-lite',
                  backoffMs: 2400,
                  allowTools: false,
                  forceLowThinking: true,
                },
              );
              failoverReason =
                'Live Search/Maps grounding temporarily unavailable; answered cleanly via Flash Lite';
              continue;
            }

            if (
              !emittedChunks &&
              !addedTransientFinalRetry &&
              i === attemptQueue.length - 1 &&
              (classified.kind === 'unavailable' || classified.kind === 'timeout')
            ) {
              addedTransientFinalRetry = true;
              attemptQueue.push({
                model: 'gemini-3.1-flash-lite',
                backoffMs: 3200,
                allowTools: false,
                forceLowThinking: true,
              });
              failoverReason =
                'Upstream model experienced a brief spike; recovered cleanly via Flash Lite';
              continue;
            }

            failoverReason =
              classified.kind === 'quota_or_billing'
                ? `${route.geminiModel} requires a billing tier; auto-switched to ${candidate === route.geminiModel ? 'gemini-3.1-flash-lite' : candidate}`
                : `${route.geminiModel} experienced ${classified.kind}; auto-switched to ${candidate === route.geminiModel ? 'gemini-3.1-flash-lite' : candidate}`;

            // Only fail over cleanly if nothing was streamed yet and error is retryable
            if (
              !emittedChunks &&
              classified.retryableWithFallback &&
              i < attemptQueue.length - 1
            ) {
              continue;
            }
            throw err;
          }
        }

        if (clientClosed) {
          if (!res.writableEnded) res.end();
          return;
        }

        if (!succeededModel) {
          throw lastUpstreamErr ?? new Error('No healthy model could complete the request.');
        }

        sendSseEvent(res, 'stage', { key: 'execution', status: 'done' });
        sendSseEvent(res, 'stage', { key: 'verification', status: 'active' });

        if (sourcesByUrl.size > 0) {
          sendSseEvent(res, 'sources', {
            sources: Array.from(sourcesByUrl.values()),
          });
        }

        sendSseEvent(res, 'stage', { key: 'verification', status: 'done' });
        sendSseEvent(res, 'done', {
          routedModel: succeededModel,
          metrics: {
            promptTokens,
            outputTokens,
            totalTokens,
            latencyMs: Date.now() - startTime,
          },
        });
        if (!res.writableEnded) res.end();
      } catch (err) {
        const paidHint =
          (route.geminiModel === 'gemini-4-carbon' ||
            route.geminiModel === 'gemini-4-neon') &&
          lastClassified.kind === 'quota_or_billing';
        const { message } = formatUpstreamError(err, paidHint);
        sendSseEvent(res, 'stage', { key: 'execution', status: 'error' });
        sendSseEvent(res, 'error', { message });
        if (!res.writableEnded) res.end();
      }
    });

    // Image Creation & Editing (gemini-nano-banana-2.1 with flash-lite-image failover)
    app.post('/api/ai/image', async (req: Request, res: Response) => {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(400).json({
          error:
            'GEMINI_API_KEY is not configured. Check Settings > Secrets to use Image Studio.',
        });
        return;
      }

      const body = req.body ?? {};
      const prompt = String(body.prompt ?? '').trim();
      if (!prompt) {
        res.status(400).json({ error: 'Image prompt cannot be empty.' });
        return;
      }

      const aspectRatio = String(body.aspectRatio || '1:1');
      const imageSize = String(body.imageSize || '1K');
      const useSearch = Boolean(body.useSearch ?? false);
      const inputImageBase64 =
        typeof body.imageBase64 === 'string' && body.imageBase64.trim()
          ? body.imageBase64.trim()
          : null;
      const inputMimeType = String(body.mimeType || 'image/png');
      const imageAttempts: Array<{ model: string; allowSearch: boolean }> = [
        { model: 'gemini-nano-banana-2.1', allowSearch: useSearch },
        { model: 'gemini-3.1-flash-lite-image', allowSearch: false },
      ];

      let lastErr: unknown = null;
      for (const attempt of imageAttempts) {
        try {
          const parts: Array<Record<string, unknown>> = [];
          if (inputImageBase64) {
            parts.push({
              inlineData: {
                data: inputImageBase64,
                mimeType: inputMimeType,
              },
            });
          }
          parts.push({ text: prompt });

          const config: Record<string, unknown> = {
            imageConfig: {
              aspectRatio,
              imageSize,
            },
          };
          if (attempt.allowSearch) {
            config.tools = [
              {
                googleSearch: {
                  searchTypes: {
                    webSearch: {},
                    imageSearch: {},
                  },
                },
              },
            ];
          }

          const response = await withTimeout(
            ai.models.generateContent({
              model: attempt.model,
              contents: { parts } as never,
              config,
            }),
            25000,
            `Image generation (${attempt.model})`,
          );

          let imageDataUrl: string | null = null;
          let text = '';
          for (const part of response.candidates?.[0]?.content?.parts ?? []) {
            if (part.inlineData?.data && !imageDataUrl) {
              const mime = part.inlineData.mimeType || 'image/png';
              imageDataUrl = `data:${mime};base64,${part.inlineData.data}`;
            } else if (part.text) {
              text += part.text;
            }
          }

          if (!imageDataUrl) {
            lastErr = new Error(
              text ||
                'Model completed without returning an image payload. Try refining your prompt.',
            );
            continue;
          }

          res.json({ imageDataUrl, text: text.trim(), model: attempt.model });
          return;
        } catch (err) {
          lastErr = err;
          const classified = classifyGeminiError(err);
          if (!classified.retryableWithFallback) break;
        }
      }

      const { status, message } = formatUpstreamError(lastErr, true);
      res.status(status).json({ error: message });
    });

  // Music Generation (Lyria 3 Clip & Pro Preview)
  app.post('/api/ai/music', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error:
          'GEMINI_API_KEY is not configured. Check Settings > Secrets to generate music.',
      });
      return;
    }

    const body = req.body ?? {};
    const prompt = String(body.prompt ?? '').trim();
    if (!prompt) {
      res.status(400).json({ error: 'Music prompt cannot be empty.' });
      return;
    }

    const model =
      body.model === 'lyria-3-pro-preview'
        ? 'lyria-3-pro-preview'
        : 'lyria-3-clip-preview';
    const inputImageBase64 =
      typeof body.imageBase64 === 'string' && body.imageBase64.trim()
        ? body.imageBase64.trim()
        : null;
    const inputMimeType = String(body.mimeType || 'image/jpeg');

    try {
      const contents = inputImageBase64
        ? {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: inputImageBase64,
                  mimeType: inputMimeType,
                },
              },
            ],
          }
        : prompt;

      const stream = await ai.models.generateContentStream({
        model,
        contents: contents as never,
      });

      const audioChunks: Buffer[] = [];
      let lyrics = '';
      let mimeType = 'audio/mpeg';

      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (audioChunks.length === 0 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
          }
          if (part.text) {
            lyrics += part.text;
          }
        }
      }

      if (audioChunks.length === 0) {
        res.status(502).json({
          error: 'No audio data returned by Lyria stream.',
        });
        return;
      }

      const audioBase64 = Buffer.concat(audioChunks).toString('base64');
      res.json({
        audioDataUrl: `data:${mimeType};base64,${audioBase64}`,
        lyrics: lyrics.trim(),
        model,
      });
    } catch (err) {
      const { status, message } = formatUpstreamError(err, true);
      res.status(status).json({ error: message });
    }
  });

  // Text-to-Video & Image-to-Video (gemini-omni-1.2-flash via Interactions API)
  app.post('/api/ai/video', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error:
          'GEMINI_API_KEY is not configured. Check Settings > Secrets to generate video.',
      });
      return;
    }

    const body = req.body ?? {};
    const prompt = String(body.prompt ?? '').trim();
    if (!prompt) {
      res.status(400).json({ error: 'Video motion prompt cannot be empty.' });
      return;
    }

    const aspectRatio = body.aspectRatio === '9:16' ? '9:16' : '16:9';
    const duration =
      typeof body.duration === 'string' && /^\d+s$/.test(body.duration)
        ? body.duration
        : '8s';
    const resolution =
      body.resolution === '1080p' || body.resolution === '360p'
        ? body.resolution
        : '720p';
    const inputImageBase64 =
      typeof body.imageBase64 === 'string' && body.imageBase64.trim()
        ? body.imageBase64.trim()
        : null;
    const inputMimeType = String(body.mimeType || 'image/png');

    try {
      const inputPayload = inputImageBase64
        ? [
            {
              type: 'image' as const,
              mime_type: inputMimeType,
              data: inputImageBase64,
            },
            {
              type: 'text' as const,
              text: prompt,
            },
          ]
        : prompt;

      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: inputPayload as never,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: aspectRatio,
            duration,
            resolution,
          } as never,
        },
        { timeout: 300000 },
      );

      const videoPart = interaction.output_video;
      if (videoPart?.data) {
        const mime = videoPart.mime_type || 'video/mp4';
        res.json({
          videoDataUrl: `data:${mime};base64,${videoPart.data}`,
          model: 'gemini-omni-1.2-flash',
        });
        return;
      }

      if (videoPart?.uri) {
        res.json({
          videoUri: videoPart.uri,
          model: 'gemini-omni-1.2-flash',
        });
        return;
      }

      res.status(502).json({
        error:
          interaction.output_text ||
          'Interactions API completed without returning output_video.',
      });
    } catch (err) {
      const { status, message } = formatUpstreamError(err, true);
      res.status(status).json({ error: message });
    }
  });

  // Audio Transcription (gemini-3.5-transcribe)
  app.post('/api/ai/transcribe', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error:
          'GEMINI_API_KEY is not configured. Check Settings > Secrets to transcribe audio.',
      });
      return;
    }

    const body = req.body ?? {};
    const audioBase64 = String(body.audioBase64 ?? '').trim();
    const mimeType = String(body.mimeType || 'audio/webm');
    const prompt =
      String(body.prompt ?? '').trim() ||
      'Transcribe this audio cleanly with accurate punctuation and speaker paragraphs.';

    if (!audioBase64) {
      res.status(400).json({ error: 'Audio payload cannot be empty.' });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            { text: prompt },
          ],
        },
      });

      res.json({
        transcript: (response.text ?? '').trim(),
        model: 'gemini-3.5-transcribe',
      });
    } catch (err) {
      const { status, message } = formatUpstreamError(err, false);
      res.status(status).json({ error: message });
    }
  });

  // Google Maps Grounding Query (gemini-4-hydrogen + googleMaps tool)
  app.post('/api/ai/maps-explore', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error:
          'GEMINI_API_KEY is not configured. Check Settings > Secrets to query Google Maps Grounding.',
      });
      return;
    }

    const body = req.body ?? {};
    const prompt = String(body.prompt ?? '').trim();
    if (!prompt) {
      res.status(400).json({ error: 'Search query cannot be empty.' });
      return;
    }

    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    const config: Record<string, unknown> = {
      tools: [{ googleMaps: {} }],
    };
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: { latitude: lat, longitude: lng },
        },
      };
    }

    const mapsChain = buildResilientModelChain('gemini-3.1-flash-lite', modelHealthMap);
    let mapsLastErr: unknown = null;
    for (const candidateModel of mapsChain) {
      const mStart = Date.now();
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model: candidateModel,
            contents: prompt,
            config,
          }),
          14000,
          `Maps explore (${candidateModel})`,
        );
        recordModelSuccess(modelHealthMap, candidateModel, Date.now() - mStart);

        const groundingChunks =
          response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const places = extractGroundingSources(groundingChunks).filter(
          (s) => s.kind === 'maps' || s.url.includes('google.com/maps'),
        );

        res.json({
          text: (response.text ?? '').trim(),
          places,
          model: candidateModel,
        });
        return;
      } catch (err) {
        mapsLastErr = err;
        const classified = classifyGeminiError(err);
        recordModelFailure(modelHealthMap, candidateModel, classified);
        if (!classified.retryableWithFallback) break;
      }
    }

    // Graceful knowledge-based fallback with retry when Maps Grounding tool hits Free Tier 429 or transient 503
    const coordHint =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? ` near coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        : '';
    for (const delay of [0, 1200, 2600]) {
      if (delay > 0) await sleepMs(delay);
      try {
        const fallbackResp = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: `Live Google Maps Grounding quota is currently unavailable on this key. Provide helpful, clearly organized place recommendations and neighborhood tips for "${prompt}"${coordHint}, noting clearly that live Maps verification requires an active Maps Grounding quota.`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
          16000,
          'Maps explore fallback (gemini-3.1-flash-lite)',
        );
        res.json({
          text: (fallbackResp.text ?? '').trim(),
          places: [],
          model: 'gemini-3.1-flash-lite',
          groundingFallback: true,
        });
        return;
      } catch (fallbackErr) {
        mapsLastErr = fallbackErr;
      }
    }

    const { status, message } = formatUpstreamError(mapsLastErr, false);
    res.status(status).json({ error: message });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MyAI Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MyAI Studio server:', err);
  process.exit(1);
});
