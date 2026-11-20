import type {
  AgentMode,
  EngineProfileId,
  EngineTierId,
  GeminiModelId,
  PipelineStageState,
  SpecialistSlashId,
  WorkspaceFile,
} from '../types/workspace';

export interface ParsedSlashPrompt {
  specialist: SpecialistSlashId | null;
  cleanPrompt: string;
}

export interface RouteDecision {
  requestedTier: EngineTierId;
  resolvedTier: Exclude<EngineTierId, 'auto'>;
  geminiModel:
    | 'gemini-4-hydrogen'
    | 'gemini-3.1-flash-lite'
    | 'gemini-4-carbon'
    | 'gemini-4-neon';
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  specialist: SpecialistSlashId;
  reason: string;
}

const VALID_SPECIALISTS: ReadonlySet<SpecialistSlashId> = new Set([
  'myra',
  'architect',
  'coder',
  'debugger',
  'researcher',
  'designer',
  'analyst',
  'optimizer',
  'security',
  'docs',
  'tester',
  'deployer',
  'word',
  'ppt',
  'excel',
  'deep-research',
  'grounding',
  'thinking',
  'canvas',
  'data-analyst',
  'prompt-ops',
  'artifacts',
  'xml-planner',
  'office-suite',
  'long-context',
  'kimi-explorer',
  'repowiki',
  'quest',
  'inline-diff',
]);

export function isValidSpecialist(id: string | null | undefined): id is SpecialistSlashId {
  return Boolean(id && VALID_SPECIALISTS.has(id as SpecialistSlashId));
}

export function parseSlashCommand(rawInput: string): ParsedSlashPrompt {
  const trimmed = rawInput.trim();
  const match = /^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) {
    return { specialist: null, cleanPrompt: trimmed };
  }
  const cmd = match[1].toLowerCase() as SpecialistSlashId;
  if (!VALID_SPECIALISTS.has(cmd)) {
    return { specialist: null, cleanPrompt: trimmed };
  }
  return {
    specialist: cmd,
    cleanPrompt: (match[2] ?? '').trim(),
  };
}

export function detectIntentAndRoute(params: {
  prompt: string;
  selectedTier: EngineTierId;
  activeSpecialist: SpecialistSlashId;
  agentMode?: AgentMode;
  engineProfile?: EngineProfileId;
  explicitModel?: GeminiModelId;
  myraEnabled: boolean;
  webSearch: boolean;
  deepResearch: boolean;
}): RouteDecision {
  const { specialist: slashCmd, cleanPrompt } = parseSlashCommand(params.prompt);
  let specialist: SpecialistSlashId = slashCmd ?? params.activeSpecialist;
  const text = cleanPrompt.toLowerCase();

  // Auto-detect niche specialist when user hasn't picked a slash skill or left default /myra
  if (!slashCmd && params.activeSpecialist === 'myra') {
    const isShortGreeting =
      text.length > 0 &&
      text.length < 85 &&
      !params.webSearch &&
      /\b(hi|hello|halo|apa|siapa|ringkas|summarize|translate|terjemahkan|tes|test)\b/.test(
        text,
      ) &&
      !/\b(debug|bug|error|security|keamanan|deploy|arsitektur|architecture|ppt|pptx|excel|xlsx|word|docx|html|react|tailwind|sql)\b/.test(
        text,
      );

    if (/\b(powerpoint|pptx|ppt|slide|slides|presentasi|pitch\s*deck)\b/.test(text)) {
      specialist = 'ppt';
    } else if (/\b(excel|xlsx|spreadsheet|workbook|anggaran|neraca|rab|csv)\b/.test(text)) {
      specialist = 'excel';
    } else if (/\b(word|docx|proposal|surat|sop|laporan\s+proyek|makalah|kontrak)\b/.test(text)) {
      specialist = 'word';
    } else if (
      /\b(debug|bug|error\s*\d{3}|stack\s*trace|exception|crash|403|500|502|503|404|gagal|perbaiki\s+kode|kenapa\s+error)\b/.test(
        text,
      )
    ) {
      specialist = 'debugger';
    } else if (
      /\b(security|keamanan|xss|csrf|cors|firestore\.rules|vulnerability|celah|audit\s+keamanan|jwt|owasp)\b/.test(
        text,
      )
    ) {
      specialist = 'security';
    } else if (
      /\b(unit\s*test|node:test|playwright|e2e\s*test|qa\s*matrix|test\s*case|skenario\s*uji|pengujian)\b/.test(
        text,
      )
    ) {
      specialist = 'tester';
    } else if (
      /\b(deploy|cloud\s*run|cloudflare|docker|ci\/cd|nginx|ssl|production\s+checklist)\b/.test(
        text,
      )
    ) {
      specialist = 'deployer';
    } else if (/\b(repowiki|module\s+dependency|peta\s+repo|diagram\s+arsitektur)\b/.test(text)) {
      specialist = 'repowiki';
    } else if (
      /\b(arsitektur|architecture|system\s*design|database\s*schema|skema\s*database|microservices|api\s*contract)\b/.test(
        text,
      )
    ) {
      specialist = 'architect';
    } else if (
      /\b(dokumentasi|documentation|readme|changelog|api\s*docs|panduan\s+developer)\b/.test(
        text,
      )
    ) {
      specialist = 'docs';
    } else if (
      /\b(kpi|churn|ltv|cac|roi|funnel|pricing\s*strategy|strategi\s*harga|analisa\s+bisnis|metrik\s+produk)\b/.test(
        text,
      )
    ) {
      specialist = 'analyst';
    } else if (
      /\b(ui\/ux|wireframe|color\s*palette|palet\s*warna|typography|design\s*system|desain\s+tampilan)\b/.test(
        text,
      )
    ) {
      specialist = 'designer';
    } else if (
      /\b(code|build|html|react|tsx|typescript|css|api|component|app|landing|dashboard|function|kalkulator|buatkan\s+web|buatkan\s+aplikasi)\b/.test(
        text,
      )
    ) {
      specialist = 'coder';
    } else if (
      params.deepResearch ||
      params.agentMode === 'research' ||
      /\b(riset|deep\s*research|bandingkan|compare|tren\s+terbaru)\b/.test(text)
    ) {
      specialist = params.deepResearch ? 'deep-research' : 'researcher';
    } else if (!isShortGreeting && params.engineProfile && params.engineProfile !== 'myai-auto') {
      if (params.engineProfile === 'qoder') specialist = 'quest';
      else if (params.engineProfile === 'kimi') specialist = 'long-context';
      else if (params.engineProfile === 'claude') specialist = 'artifacts';
      else if (params.engineProfile === 'gpt') specialist = 'canvas';
    }
  }

  let resolvedTier: Exclude<EngineTierId, 'auto'>;
  let reason: string;

  if (params.selectedTier !== 'auto') {
    resolvedTier = params.selectedTier;
    reason = `Manual tier override (${params.selectedTier})`;
  } else if (
    specialist === 'word' ||
    specialist === 'ppt' ||
    specialist === 'excel' ||
    specialist === 'office-suite' ||
    specialist === 'data-analyst'
  ) {
    resolvedTier = 'general';
    reason = `Office / Structured deliverable routed via /${specialist}`;
  } else if (
    params.agentMode === 'code' ||
    specialist === 'coder' ||
    specialist === 'debugger' ||
    specialist === 'tester' ||
    specialist === 'artifacts' ||
    specialist === 'inline-diff' ||
    (params.agentMode === 'build' &&
      /\b(code|build|html|react|tsx|typescript|css|bug|fix|error|api|component|app|landing|dashboard|function|buatkan\s+web|buatkan\s+aplikasi)\b/.test(
        text,
      ))
  ) {
    resolvedTier = 'coding';
    reason = `Detected software engineering / build niche (/${specialist})`;
  } else if (
    params.deepResearch ||
    params.agentMode === 'research' ||
    specialist === 'architect' ||
    specialist === 'security' ||
    specialist === 'deployer' ||
    specialist === 'analyst' ||
    specialist === 'researcher' ||
    specialist === 'deep-research' ||
    specialist === 'long-context' ||
    specialist === 'repowiki' ||
    specialist === 'quest' ||
    /\b(architecture|deep|audit|security|compare|roadmap|strategy|analyze|analisa)\b/.test(
      text,
    )
  ) {
    resolvedTier = 'pro';
    reason = `Detected deep reasoning / strategy niche (/${specialist})`;
  } else if (
    text.length > 0 &&
    text.length < 85 &&
    !params.webSearch &&
    /\b(hi|hello|halo|apa|siapa|ringkas|summarize|translate|terjemahkan|tes|test)\b/.test(
      text,
    )
  ) {
    resolvedTier = 'flash';
    reason = 'Lightweight query routed to low-latency Flash tier';
  } else {
    resolvedTier = 'general';
    reason = `Balanced workspace routing via /${specialist}`;
  }

  // Use ultra-stable gemini-3.1-flash-lite as primary default under Auto routing
  // to avoid 503 stalls; users can explicitly choose Hydrogen/Carbon/Neon with failover.
  let geminiModel: RouteDecision['geminiModel'] = 'gemini-3.1-flash-lite';

  if (params.explicitModel && params.explicitModel !== 'auto') {
    geminiModel = params.explicitModel;
    reason = `Explicit model selected (${params.explicitModel})`;
  }

  let thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
  if (resolvedTier === 'flash' || resolvedTier === 'chats') {
    thinkingLevel = 'LOW';
  } else if (
    resolvedTier === 'pro' ||
    resolvedTier === 'max' ||
    resolvedTier === 'coding' ||
    geminiModel === 'gemini-4-carbon' ||
    geminiModel === 'gemini-4-neon' ||
    params.deepResearch
  ) {
    thinkingLevel = 'HIGH';
  }

  return {
    requestedTier: params.selectedTier,
    resolvedTier,
    geminiModel,
    thinkingLevel,
    specialist,
    reason: params.myraEnabled
      ? `MYRA smart routing: ${reason}`
      : `MyAI router: ${reason}`,
  };
}

export function createInitialStages(
  route: RouteDecision,
  webSearch: boolean,
): PipelineStageState[] {
  return [
    {
      key: 'analysis',
      label: 'Analysis',
      detail: `Intent routed to ${route.resolvedTier.toUpperCase()} (${route.specialist})`,
      status: 'active',
    },
    {
      key: 'planning',
      label: 'Planning',
      detail: webSearch
        ? 'Preparing search-grounded architecture plan'
        : 'Structuring lean response & artifact layout',
      status: 'pending',
    },
    {
      key: 'execution',
      label: 'Execution',
      detail: `Streaming via ${route.geminiModel}`,
      status: 'pending',
    },
    {
      key: 'verification',
      label: 'Verification',
      detail: 'Validating code blocks & workspace artifact integrity',
      status: 'pending',
    },
  ];
}

const LANG_DEFAULT_FILE: Record<string, string> = {
  html: 'index.html',
  htm: 'index.html',
  css: 'styles.css',
  js: 'app.js',
  javascript: 'app.js',
  ts: 'index.ts',
  typescript: 'index.ts',
  tsx: 'App.tsx',
  jsx: 'App.jsx',
  json: 'package.json',
  sql: 'schema.sql',
  py: 'main.py',
  python: 'main.py',
  md: 'README.md',
  word: 'document.docx.json',
  docx: 'document.docx.json',
  ppt: 'presentation.pptx.json',
  pptx: 'presentation.pptx.json',
  excel: 'workbook.xlsx.json',
  xlsx: 'workbook.xlsx.json',
  csv: 'data.csv',
};

export function extractArtifactsFromMarkdown(markdown: string): WorkspaceFile[] {
  const filesMap = new Map<string, WorkspaceFile>();
  const now = Date.now();

  const blockRegex =
    /(?:(?:<!--\s*file:\s*([^\s>]+)\s*-->|\/\/\s*file:\s*([^\s\n]+)|#\s*file:\s*([^\s\n]+))\s*\n)?```([a-zA-Z0-9_.-]*)(?::([^\s\n]+))?\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  let untitledCounter = 1;

  while ((match = blockRegex.exec(markdown)) !== null) {
    const commentPath = (match[1] || match[2] || match[3] || '').trim();
    const rawLang = (match[4] || 'txt').toLowerCase();
    const inlinePath = (match[5] || '').trim();
    const content = match[6].trim();

    if (!content || rawLang === 'bash' || rawLang === 'sh' || rawLang === 'shell') {
      continue;
    }

    let filePath = inlinePath || commentPath;
    if (!filePath) {
      const firstLineMatch =
        /^(?:\/\/|#|<!--)\s*(?:file|path):\s*([^\s>-]+)\s*(?:-->)?\n([\s\S]*)$/.exec(
          content,
        );
      if (firstLineMatch) {
        filePath = firstLineMatch[1].trim();
      }
    }

    // Detect Office JSON artifacts even if tagged simply as ```json
    if (!filePath && (rawLang === 'json' || rawLang === '')) {
      const kindMatch = /"kind"\s*:\s*"(word|ppt|excel)"/i.exec(content);
      if (kindMatch) {
        const k = kindMatch[1].toLowerCase();
        filePath =
          k === 'word'
            ? 'document.docx.json'
            : k === 'ppt'
              ? 'presentation.pptx.json'
              : 'workbook.xlsx.json';
      }
    }

    if (!filePath) {
      const defaultName = LANG_DEFAULT_FILE[rawLang];
      if (defaultName && !filesMap.has(defaultName)) {
        filePath = defaultName;
      } else {
        const ext =
          rawLang === 'typescript'
            ? 'ts'
            : rawLang === 'javascript'
              ? 'js'
              : rawLang || 'txt';
        filePath = `artifact-${untitledCounter++}.${ext}`;
      }
    }

    filesMap.set(filePath, {
      path: filePath,
      language: rawLang || 'text',
      content,
      updatedAt: now,
    });
  }

  return Array.from(filesMap.values());
}

const SANDBOX_CONSOLE_BRIDGE = `<script>
(function(){
  function send(level, args) {
    try {
      var msg = Array.prototype.slice.call(args).map(function(a) {
        if (typeof a === 'object') { try { return JSON.stringify(a); } catch(e) { return String(a); } }
        return String(a);
      }).join(' ');
      window.parent.postMessage({ type: 'myai-sandbox-log', level: level, message: msg }, '*');
    } catch(e) {}
  }
  var origLog = console.log, origWarn = console.warn, origErr = console.error;
  console.log = function(){ send('log', arguments); origLog.apply(console, arguments); };
  console.warn = function(){ send('warn', arguments); origWarn.apply(console, arguments); };
  console.error = function(){ send('error', arguments); origErr.apply(console, arguments); };
  window.addEventListener('error', function(e){
    send('error', [e.message + (e.lineno ? ' (line ' + e.lineno + ')' : '')]);
  });
})();
</script>`;

export function buildPreviewDocument(files: WorkspaceFile[]): string {
  if (files.length === 0) {
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" />${SANDBOX_CONSOLE_BRIDGE}<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#09090b;color:#a1a1aa;}</style></head>
<body><p>No previewable HTML artifact in this workspace yet.</p></body>
</html>`;
  }

  const htmlFile =
    files.find((f) => f.path.toLowerCase().endsWith('.html')) ??
    files.find((f) => f.language === 'html' || f.language === 'htm');

  const cssFiles = files.filter(
    (f) => f.path.toLowerCase().endsWith('.css') || f.language === 'css',
  );
  const jsFiles = files.filter(
    (f) =>
      (f.path.toLowerCase().endsWith('.js') ||
        f.language === 'js' ||
        f.language === 'javascript') &&
      !f.path.toLowerCase().endsWith('.config.js'),
  );

  if (htmlFile) {
    let doc = htmlFile.content;
    const cssInject = cssFiles
      .map((f) => `<style>\n${f.content}\n</style>`)
      .join('\n');
    const jsInject = jsFiles
      .map((f) => `<script>\n${f.content}\n</script>`)
      .join('\n');

    if (!/<html/i.test(doc)) {
      doc = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${SANDBOX_CONSOLE_BRIDGE}
  ${cssInject}
</head>
<body>
${doc}
${jsInject}
</body>
</html>`;
    } else {
      if (/<head>/i.test(doc)) {
        doc = doc.replace(/<head>/i, `<head>\n${SANDBOX_CONSOLE_BRIDGE}`);
      } else {
        doc = `${SANDBOX_CONSOLE_BRIDGE}\n${doc}`;
      }
      if (cssInject && /<\/head>/i.test(doc)) {
        doc = doc.replace(/<\/head>/i, `${cssInject}\n</head>`);
      }
      if (jsInject && /<\/body>/i.test(doc)) {
        doc = doc.replace(/<\/body>/i, `${jsInject}\n</body>`);
      }
    }
    return doc;
  }

  const primary = files[0];
  const escaped = primary.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${SANDBOX_CONSOLE_BRIDGE}
  <style>
    body { margin: 0; padding: 24px; font-family: ui-monospace, SFMono-Regular, monospace; background: #09090b; color: #e4e4e7; }
    .hdr { font-family: system-ui, sans-serif; font-size: 13px; color: #a1a1aa; margin-bottom: 12px; display: flex; justify-content: space-between; border-bottom: 1px solid #27272a; padding-bottom: 10px; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 12.5px; line-height: 1.6; color: #f4f4f5; }
  </style>
</head>
<body>
  <div class="hdr"><span>${primary.path}</span><span>${primary.language.toUpperCase()}</span></div>
  <pre>${escaped}</pre>
</body>
</html>`;
}
