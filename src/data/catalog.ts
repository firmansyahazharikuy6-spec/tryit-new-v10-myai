import { AGENT_SKILLS } from './skills';
import type {
  EngineTierId,
  SkillEcosystem,
  SpecialistSlashId,
  WorkFolder,
  WorkspaceFile,
} from '../types/workspace';

export interface EngineTierMeta {
  id: EngineTierId;
  name: string;
  tagline: string;
  backendModel: string;
}

export interface SpecialistAgentMeta {
  id: SpecialistSlashId;
  command: string;
  name: string;
  role: string;
  directive: string;
  ecosystem?: SkillEcosystem;
  starterPrompt?: string;
}

export interface AuditComparisonItem {
  dimension: string;
  legacyV106: string;
  nextGenStudio: string;
  impact: string;
}

export const ENGINE_TIERS: EngineTierMeta[] = [
  {
    id: 'auto',
    name: 'Auto',
    tagline: 'MYAI routes every message with live health failover',
    backendModel: 'Stable Auto Router',
  },
  {
    id: 'general',
    name: 'General',
    tagline: 'Balanced reasoning and clarity for daily tasks',
    backendModel: 'gemini-3.1-flash-lite / hydrogen',
  },
  {
    id: 'chats',
    name: 'Chats',
    tagline: 'Natural conversational flow with ultra-fast latency',
    backendModel: 'gemini-3.1-flash-lite',
  },
  {
    id: 'coding',
    name: 'Coding',
    tagline: 'Full-stack code generation, diffs, and live artifacts',
    backendModel: 'hydrogen → flash-lite failover',
  },
  {
    id: 'flash',
    name: 'Flash',
    tagline: 'Lowest latency for instant iterations and summaries',
    backendModel: 'gemini-3.1-flash-lite',
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Deep structured analysis and multi-step planning',
    backendModel: 'hydrogen → flash-lite (High)',
  },
  {
    id: 'max',
    name: 'Max',
    tagline: 'Maximum synthesis depth for complex architecture',
    backendModel: 'hydrogen → flash-lite (High)',
  },
];

export const SPECIALIST_AGENTS: SpecialistAgentMeta[] = [
  {
    id: 'myra',
    command: '/myra',
    name: 'MYRA Core',
    role: 'Focused token-efficient product builder & diagnostic agent',
    directive:
      'Act as MYRA, the lean, focused built-in AI agent. Plan concisely, execute complete artifacts, and avoid filler prose.',
    starterPrompt:
      '/myra Rancang aplikasi dashboard produktivitas harian lengkap dengan timer fokus dan daftar tugas interaktif dalam index.html.',
  },
  {
    id: 'architect',
    command: '/architect',
    name: 'System Architect',
    role: 'Scalable backend, database schema, and API contracts',
    directive:
      'Design clean, production-ready system architecture, data models, API boundaries, and edge-case resilience.',
    starterPrompt:
      '/architect Rancang arsitektur backend multi-tenant realtime dengan offline sync queue dan API gateway tahan beban tinggi.',
  },
  {
    id: 'coder',
    command: '/coder',
    name: 'Full-Stack Builder',
    role: 'Generates runnable HTML, TypeScript, React, and CSS artifacts',
    directive:
      'Produce complete, clean, runnable code blocks with explicit file comments like <!-- file: index.html --> or ```tsx:App.tsx so the live workbench can render them.',
    starterPrompt:
      '/coder Buatkan web kalkulator ROI bisnis modern dengan slider interaktif dan ringkasan metrik di index.html.',
  },
  {
    id: 'debugger',
    command: '/debugger',
    name: 'Root-Cause Debugger',
    role: 'Diagnoses 403/500 errors, state bugs, and network traces',
    directive:
      'Inspect symptoms methodically, isolate root causes, and propose concrete, minimal, verified fixes.',
    starterPrompt:
      '/debugger @index.html Periksa kemungkinan bug state, race condition, atau celah UI dan berikan patch perbaikan langsung.',
  },
  {
    id: 'researcher',
    command: '/researcher',
    name: 'Deep Researcher',
    role: 'Multi-source market, technical, and competitive synthesis',
    directive:
      'Synthesize structured, evidence-backed findings with clear takeaways, trade-offs, and citations when web search is active.',
    starterPrompt:
      '/researcher @web Bandingkan tren arsitektur AI Agent Studio 2026 beserta kelebihan, kekurangan, dan strategi adopsinya.',
  },
  {
    id: 'designer',
    command: '/designer',
    name: 'UI/UX Designer',
    role: 'Modern Emergent/Qoder/Qwen layout systems & Tailwind specs',
    directive:
      'Craft crisp visual hierarchies, accessible contrast, clean spacing, and production HTML/Tailwind prototypes.',
    starterPrompt:
      '/designer Buat halaman profil studio kreatif berkarakter modern dengan grid portofolio dan palet warna tajam di index.html.',
  },
  {
    id: 'analyst',
    command: '/analyst',
    name: 'Product Analyst',
    role: 'KPI modeling, pricing strategy, and user funnel audits',
    directive:
      'Break down product metrics, bottlenecks, and retention drivers into structured tables and actionable steps.',
    starterPrompt:
      '/analyst Hitung model KPI retensi SaaS, CAC payback period, dan strategi optimasi konversi onboarding.',
  },
  {
    id: 'optimizer',
    command: '/optimizer',
    name: 'Token & Speed Optimizer',
    role: 'Cuts prompt bloat, reduces latency, and optimizes bundle size',
    directive:
      'Eliminate redundant tokens, optimize render paths, and streamline model routing for speed and cost.',
    starterPrompt:
      '/optimizer Optimalkan efisiensi token prompt, latensi streaming SSE, dan struktur kode agar respons jauh lebih cepat.',
  },
  {
    id: 'security',
    command: '/security',
    name: 'Security Auditor',
    role: 'Reviews auth, guest gates, CORS, secrets, and XSS hygiene',
    directive:
      'Audit auth tokens, rate limits, secret handling, and input sanitization without false positives.',
    starterPrompt:
      '/security @diagnostics Audit kebersihan API key, sanitasi input HTML/SSE, serta aturan autentikasi Firestore aplikasi ini.',
  },
  {
    id: 'docs',
    command: '/docs',
    name: 'Technical Writer',
    role: 'API docs, onboarding guides, and crisp changelogs',
    directive:
      'Write scannable, accurate technical documentation and step-by-step developer guides.',
    starterPrompt:
      '/docs Buat dokumentasi API developer lengkap dengan contoh request curl dan alur error handling di README.md.',
  },
  {
    id: 'tester',
    command: '/tester',
    name: 'QA & Test Engineer',
    role: 'Unit tests, integration checks, and edge-case matrices',
    directive:
      'Design deterministic test cases using node:test or Playwright journeys covering happy paths and failure states.',
    starterPrompt:
      '/tester Buat daftar uji edge-case dan skenario test otomatis menggunakan node:test untuk memverifikasi logika penting.',
  },
  {
    id: 'deployer',
    command: '/deployer',
    name: 'Launch Engineer',
    role: 'Cloudflare Pages, Cloud Run, CI/CD, and production readiness',
    directive:
      'Provide exact build scripts, environment checklists, and zero-downtime deployment steps.',
    starterPrompt:
      '/deployer Susun checklist siap-produksi, environment variables, dan langkah zero-downtime deploy aplikasi Full-Stack Node + Vite.',
  },
  ...AGENT_SKILLS.map((skill) => ({
    id: skill.id,
    command: skill.command,
    name: skill.name,
    role: skill.role,
    directive: skill.directive,
    ecosystem: skill.ecosystem,
    starterPrompt: skill.starterPrompt,
  })),
];

export const DEFAULT_FOLDERS: WorkFolder[] = [
  {
    id: 'launch',
    name: 'Launch',
    description: 'Production app builds, landing pages, and release checklists',
  },
  {
    id: 'learning',
    name: 'Learning',
    description: 'Research notes, architecture deep-dives, and experiments',
  },
];

export const STARTER_DEMO_FILES: WorkspaceFile[] = [
  {
    path: 'index.html',
    language: 'html',
    updatedAt: Date.now(),
    content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MYAI × MYRA — Launch Blueprint</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #09090b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      min-height: 100vh;
      padding: 28px 24px;
      line-height: 1.5;
    }
    .wrap { max-width: 820px; margin: 0 auto; }
    .hdr {
      display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
      border-bottom: 1px solid #27272a; padding-bottom: 18px; margin-bottom: 22px;
    }
    .kicker { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #818cf8; font-weight: 600; }
    h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin-top: 4px; }
    .tag { font-size: 12px; font-family: ui-monospace, monospace; color: #a1a1aa; white-space: nowrap; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .card { padding: 16px; border-radius: 12px; background: #111114; border: 1px solid #27272a; }
    .step { font-size: 11px; color: #a1a1aa; margin-bottom: 4px; }
    .card h2 { font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #fafafa; }
    .card p { font-size: 12.5px; color: #a1a1aa; }
    .cta {
      padding: 18px; border-radius: 12px; background: #111114; border: 1px solid #27272a;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px;
    }
    .cta h3 { font-size: 14px; font-weight: 600; }
    .cta p { font-size: 12.5px; color: #a1a1aa; margin-top: 3px; max-width: 440px; }
    .btn {
      padding: 9px 16px; border-radius: 8px; border: none; background: #4f46e5; color: #fff;
      font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap;
    }
    .btn:hover { background: #6366f1; }
    #status-msg { font-size: 12px; font-family: ui-monospace, monospace; color: #34d399; margin-top: 10px; min-height: 18px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <div>
        <p class="kicker">Emergent-Grade Sandbox</p>
        <h1>MYAI × MYRA Next-Gen Container</h1>
      </div>
      <span class="tag">Preview Sandbox</span>
    </div>

    <div class="grid">
      <div class="card">
        <p class="step">01. Multi-Engine Router</p>
        <h2>Smart Intent Dispatch</h2>
        <p>Automatically switches between Flash, Coding, and Deep Reasoning tiers per prompt.</p>
      </div>
      <div class="card">
        <p class="step">02. MYRA Agent Loop</p>
        <h2>4-Stage Execution</h2>
        <p>Analysis, Planning, Execution, and Verification with live code &amp; HTML artifact extraction.</p>
      </div>
      <div class="card">
        <p class="step">03. Live Workbench</p>
        <h2>Code + Instant Preview</h2>
        <p>Edit generated HTML, CSS, or TypeScript directly and watch the sandbox update in real time.</p>
      </div>
    </div>

    <div class="cta">
      <div>
        <h3>Ready to build with MYRA?</h3>
        <p>Ask MYRA in the left panel to replace this blueprint with a live app, or edit index.html directly.</p>
      </div>
      <button class="btn" onclick="document.getElementById('status-msg').textContent = 'Interactive sandbox verified!'">
        Test Sandbox
      </button>
    </div>
    <p id="status-msg"></p>
  </div>
</body>
</html>`,
  },
];

export const MYAI_AUDIT_ITEMS: AuditComparisonItem[] = [
  {
    dimension: 'Guest Bootstrap & Auth',
    legacyV106:
      'Throws 403 on /api/guest/models ("Verifikasi keamanan AI guest gagal atau kedaluwarsa") blocking model catalog discovery.',
    nextGenStudio:
      'Zero-friction server-side model routing + honest real-time /api/providers/status health check with clear fallback messaging.',
    impact: 'Eliminates dead-end 403 console errors on first visit',
  },
  {
    dimension: 'Workspace Architecture',
    legacyV106:
      'Single-column chat box ("Where should we start?") with collapsed sidebar and modal-only tools.',
    nextGenStudio:
      '3-pane Emergent/Qoder/Qwen studio: Persistent Rail + Agent Pipeline Chat + Live Code/Preview Workbench.',
    impact: 'Turns conversation directly into editable, previewable products',
  },
  {
    dimension: 'MYRA Agent Capability',
    legacyV106:
      'Positioned mainly as token-efficient chat routing + read-only provider diagnosis.',
    nextGenStudio:
      `Full 4-stage Agentic Loop (Analysis -> Planning -> Execution -> Verification), ${12 + AGENT_SKILLS.length} slash specialists & Office exporters, and auto-extracted multi-file artifacts.`,
    impact: 'Moves MYRA from Q&A assistant to an autonomous builder agent',
  },
  {
    dimension: 'Grounding & Verification',
    legacyV106:
      'Static feature cards ("150 capabilities", "Web search") decoupled from output inspection.',
    nextGenStudio:
      'Real Google Search & Maps grounding citations + live token usage telemetry + instant HTML/CSS & Office sandbox preview.',
    impact: 'Verifiable answers and immediately testable output',
  },
  {
    dimension: 'Provider & BYOK Scaling',
    legacyV106:
      'Mixes Cloudflare guest gate with client-facing provider branding (OpenRouter, NIM, Groq, Gemini, WebGPU).',
    nextGenStudio:
      'Unified server-side Gemini SDK orchestration with structured provider diagnostic readiness & clean token metering.',
    impact: 'Production-ready backend boundary with zero exposed keys',
  },
];

export const QUICK_PROMPTS = [
  {
    label: 'Build Web App (/coder)',
    prompt:
      '/coder Buatkan landing page modern SaaS untuk MYAI & MYRA lengkap dengan hero, 3 paket harga, dan FAQ interaktif dalam satu index.html menggunakan Tailwind CSS.',
  },
  {
    label: 'Debug & @Context (@index.html)',
    prompt:
      '/debugger @index.html @memory Audit struktur index.html aktif, perbaiki kontras & responsivitas UI, lalu hasilkan kode index.html yang diperbarui.',
  },
  {
    label: 'Buat Laporan Excel (/excel)',
    prompt:
      '/excel Buatkan laporan proyeksi keuangan Q1-Q4 2026 lengkap dengan formula SUM & AVERAGE, 2 worksheet, dan ringkasan KPI ke file workbook.xlsx.json.',
  },
  {
    label: 'Deep Research & Search (@web)',
    prompt:
      '/deep-research @web Bandingkan pola UX AI coding workspace terbaik (Emergent, Qoder, Cursor) dan berikan 5 fitur prioritas untuk MyAI Studio.',
  },
  {
    label: 'RepoWiki & Diagram (/repowiki)',
    prompt:
      '/repowiki @diagnostics Buat dokumentasi arsitektur MyAI Studio lengkap dengan diagram alur multi-model failover dan pipeline MYRA 4-tahap.',
  },
  {
    label: 'Maps Grounding Lokal (@maps)',
    prompt:
      '@maps Rekomendasikan 5 coworking space atau kafe kerja nyaman di Jakarta Selatan lengkap dengan keunggulan tiap tempatnya.',
  },
];

export const AGENT_MODES = [
  {
    id: 'build' as const,
    label: 'Build',
    description: 'End-to-end app & UI artifact generation with live sandbox preview',
  },
  {
    id: 'code' as const,
    label: 'Code',
    description: 'Multi-file engineering, line diffs, and architectural refactoring',
  },
  {
    id: 'ask' as const,
    label: 'Ask',
    description: 'Fast, direct conversational reasoning and explanations',
  },
  {
    id: 'research' as const,
    label: 'Research',
    description: 'Web-grounded multi-source synthesis with citations',
  },
];

export const PROVIDER_ECOSYSTEM = [
  {
    name: 'Google Gemini',
    category: 'Cloud + Voice + Search',
    summary:
      'Primary server-side reasoning, code generation, live search grounding, and real-time voice/TTS models.',
    models: ['Gemini 4 Hydrogen', 'Gemini 3.1 Flash Lite', 'Gemini 3.8 Live', 'Gemini Flash TTS'],
  },
  {
    name: 'OpenRouter Gateway',
    category: 'Multi-Lab Router',
    summary:
      'Single BYOK gateway bridging frontier proprietary and open-weight models across leading labs.',
    models: ['GPT-5.2', 'Claude Opus 5', 'DeepSeek V4 Pro', 'Qwen3.8 27B'],
  },
  {
    name: 'Groq LPU',
    category: 'Low-Latency Inference',
    summary:
      'High-speed token generation and speech-to-text inference for rapid iterative coding.',
    models: ['Llama 3.3 70B', 'Qwen3.8 27B', 'Compound', 'Whisper Large v3'],
  },
  {
    name: 'NVIDIA NIM',
    category: 'Enterprise Inference',
    summary:
      'Hosted Nemotron, Qwen3 Coder, and multimodal vision models billed directly at provider rates.',
    models: ['Nemotron 3 Ultra 550B', 'Qwen3 Coder 480B', 'DeepSeek V4', 'FLUX.1'],
  },
  {
    name: 'Local AI (WebGPU / Ollama)',
    category: 'On-Device Private',
    summary:
      'Run open weights locally in your browser or through Ollama with prompts never leaving your machine.',
    models: ['Qwen2.5 Coder 1.5B', 'Qwen3 0.6B', 'Llama 3.2 1B'],
  },
];

