export type CoreGeminiModel =
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-hydrogen'
  | 'gemini-4-carbon'
  | 'gemini-4-neon';

export type ModelHealthState = 'healthy' | 'degraded' | 'quota_blocked';

export interface ModelHealthRecord {
  model: CoreGeminiModel;
  status: ModelHealthState;
  cooldownUntil: number;
  consecutiveFailures: number;
  lastError?: string;
  lastLatencyMs?: number;
  updatedAt: number;
}

export interface ClassifiedGeminiError {
  kind:
    | 'quota_or_billing'
    | 'unavailable'
    | 'timeout'
    | 'not_found'
    | 'auth'
    | 'bad_request'
    | 'unknown';
  retryableWithFallback: boolean;
  sameModelRetry: boolean;
  userMessage: string;
}

export const CORE_GEMINI_MODELS: CoreGeminiModel[] = [
  'gemini-3.1-flash-lite',
  'gemini-4-hydrogen',
  'gemini-4-carbon',
  'gemini-4-neon',
];

export const FREE_TIER_SAFE_MODELS: CoreGeminiModel[] = [
  'gemini-3.1-flash-lite',
  'gemini-4-hydrogen',
];

export const PAID_TIER_MODELS: ReadonlySet<CoreGeminiModel> = new Set([
  'gemini-4-carbon',
  'gemini-4-neon',
]);

export function classifyGeminiError(err: unknown): ClassifiedGeminiError {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const lower = raw.toLowerCase();

  if (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key')
  ) {
    return {
      kind: 'auth',
      retryableWithFallback: false,
      sameModelRetry: false,
      userMessage:
        'GEMINI_API_KEY appears invalid. Please verify it in Settings > Secrets.',
    };
  }

  if (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota exceeded') ||
    lower.includes('free_tier') ||
    lower.includes('freetier') ||
    lower.includes('billing') ||
    (lower.includes('403') && lower.includes('permission_denied'))
  ) {
    return {
      kind: 'quota_or_billing',
      retryableWithFallback: true,
      sameModelRetry: false,
      userMessage: raw,
    };
  }

  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('aborted')
  ) {
    return {
      kind: 'timeout',
      retryableWithFallback: true,
      sameModelRetry: false,
      userMessage: raw,
    };
  }

  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('504') ||
    lower.includes('overloaded') ||
    lower.includes('econnreset')
  ) {
    return {
      kind: 'unavailable',
      retryableWithFallback: true,
      sameModelRetry: true,
      userMessage: raw,
    };
  }

  if (lower.includes('404') || lower.includes('not_found')) {
    return {
      kind: 'not_found',
      retryableWithFallback: true,
      sameModelRetry: false,
      userMessage: raw,
    };
  }

  if (lower.includes('400') || lower.includes('invalid_argument')) {
    return {
      kind: 'bad_request',
      retryableWithFallback: true,
      sameModelRetry: false,
      userMessage: raw,
    };
  }

  return {
    kind: 'unknown',
    retryableWithFallback: true,
    sameModelRetry: false,
    userMessage: raw,
  };
}

export function isModelInCooldown(
  record: ModelHealthRecord | undefined,
  now = Date.now(),
): boolean {
  if (!record) return false;
  return record.status !== 'healthy' && record.cooldownUntil > now;
}

export function recordModelSuccess(
  healthMap: Map<CoreGeminiModel, ModelHealthRecord>,
  model: CoreGeminiModel,
  latencyMs: number,
  now = Date.now(),
): ModelHealthRecord {
  const next: ModelHealthRecord = {
    model,
    status: 'healthy',
    cooldownUntil: 0,
    consecutiveFailures: 0,
    lastLatencyMs: latencyMs,
    updatedAt: now,
  };
  healthMap.set(model, next);
  return next;
}

export function recordModelFailure(
  healthMap: Map<CoreGeminiModel, ModelHealthRecord>,
  model: CoreGeminiModel,
  classified: ClassifiedGeminiError,
  now = Date.now(),
): ModelHealthRecord {
  const prev = healthMap.get(model);
  const consecutiveFailures = (prev?.consecutiveFailures ?? 0) + 1;
  const isQuota = classified.kind === 'quota_or_billing' || classified.kind === 'not_found';
  const cooldownMs = isQuota
    ? 5 * 60 * 1000 // 5 minutes cooldown for free-tier quota blocks
    : Math.min(90_000, 15_000 * consecutiveFailures); // 15s -> 30s -> 45s... max 90s for transient 503/timeouts

  const next: ModelHealthRecord = {
    model,
    status: isQuota ? 'quota_blocked' : 'degraded',
    cooldownUntil: now + cooldownMs,
    consecutiveFailures,
    lastError: classified.userMessage.slice(0, 240),
    lastLatencyMs: prev?.lastLatencyMs,
    updatedAt: now,
  };
  healthMap.set(model, next);
  return next;
}

/**
 * Builds an ordered list of real Gemini models to attempt for a request.
 * Healthy models not in cooldown are placed first; the primary model is tried
 * first unless it is currently in cooldown (in which case healthy fallback
 * models run immediately without wasting latency, while still keeping the
 * primary as a final safety retry if all backups also fail).
 */
export function buildResilientModelChain(
  primaryModel: CoreGeminiModel,
  healthMap?: Map<CoreGeminiModel, ModelHealthRecord>,
  now = Date.now(),
): CoreGeminiModel[] {
  const baseOrder: CoreGeminiModel[] = [
    primaryModel,
    ...FREE_TIER_SAFE_MODELS,
  ];
  const uniqueOrder = Array.from(new Set(baseOrder));

  if (!healthMap || healthMap.size === 0) {
    return uniqueOrder;
  }

  const healthy: CoreGeminiModel[] = [];
  const coolingDown: CoreGeminiModel[] = [];

  for (const model of uniqueOrder) {
    const rec = healthMap.get(model);
    if (isModelInCooldown(rec, now)) {
      coolingDown.push(model);
    } else {
      healthy.push(model);
    }
  }

  // Always prefer healthy free-tier-safe models before retrying cooling-down models
  return [...healthy, ...coolingDown];
}

export function buildModelSafeThinkingLevel(
  model: CoreGeminiModel,
  requested: 'LOW' | 'MEDIUM' | 'HIGH',
): 'LOW' | 'MEDIUM' | 'HIGH' {
  // All 4 core Gemini models support LOW, MEDIUM, and HIGH.
  // Keep Flash Lite snappy at LOW/MEDIUM unless HIGH was explicitly requested.
  if (model === 'gemini-3.1-flash-lite' && requested === 'HIGH') {
    return 'MEDIUM';
  }
  return requested;
}

export interface GeminiChatContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

/**
 * Normalizes chat history + current user prompt into valid alternating
 * Gemini `user` -> `model` -> `user` turns so consecutive user messages
 * (e.g. after a failed/aborted assistant turn) or leading model messages
 * never cause 400 INVALID_ARGUMENT upstream.
 */
export function sanitizeChatHistory(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentPrompt: string,
  maxHistoryTurns = 12,
): GeminiChatContent[] {
  const trimmedPrompt = currentPrompt.trim();
  const normalized: GeminiChatContent[] = [];

  for (const item of history.slice(-maxHistoryTurns)) {
    const text = typeof item.content === 'string' ? item.content.trim() : '';
    if (!text) continue;
    const role: 'user' | 'model' = item.role === 'assistant' ? 'model' : 'user';
    if (normalized.length === 0 && role === 'model') {
      // Gemini multi-turn contents must begin with a user turn
      continue;
    }
    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === role) {
      prev.parts[0].text = `${prev.parts[0].text}\n\n${text}`;
    } else {
      normalized.push({ role, parts: [{ text }] });
    }
  }

  if (trimmedPrompt) {
    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === 'user') {
      prev.parts[0].text = `${prev.parts[0].text}\n\n${trimmedPrompt}`;
    } else {
      normalized.push({ role: 'user', parts: [{ text: trimmedPrompt }] });
    }
  }

  return normalized;
}

