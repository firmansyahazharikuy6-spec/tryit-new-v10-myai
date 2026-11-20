import type { AgentSkillMeta, EngineProfileId } from '../types/workspace';

export interface EngineProfileMeta {
  id: EngineProfileId;
  name: string;
  vendor: string;
  badge: string;
  summary: string;
  systemDirective: string;
}

export const ENGINE_PROFILES: EngineProfileMeta[] = [
  {
    id: 'myai-auto',
    name: 'MYAI Auto (Adaptive)',
    vendor: 'MYAI Core',
    badge: 'Stable',
    summary: 'Smart intent router with instant multi-model failover and tool dispatch.',
    systemDirective:
      'Use adaptive multi-engine synthesis: match depth to task complexity, keep prose crisp, and generate directly runnable code or downloadable Office specs.',
  },
  {
    id: 'gemini',
    name: 'Gemini Deep Studio',
    vendor: 'Google',
    badge: 'Grounding + Thinking',
    summary: 'Structured thinking, Search/Maps grounding, multimodal reasoning, and schema precision.',
    systemDirective:
      'Adopt Google Gemini Deep Studio discipline: perform explicit multi-step structured reasoning, ground factual claims carefully, and produce schema-clean outputs.',
  },
  {
    id: 'gpt',
    name: 'GPT Canvas & Analyst',
    vendor: 'OpenAI Style',
    badge: 'Canvas + Data',
    summary: 'Side-by-side Canvas drafting, quantitative spreadsheet modeling, and sharp executive writing.',
    systemDirective:
      'Adopt GPT Canvas & Code Interpreter workflow: organize complex deliverables into structured sections, quantitative tables, and editable canvas artifacts.',
  },
  {
    id: 'claude',
    name: 'Claude Artifacts Architect',
    vendor: 'Anthropic Style',
    badge: 'Artifacts + XML',
    summary: 'Clean visual Artifacts, disciplined XML-structured reasoning, and polished prose/documents.',
    systemDirective:
      'Adopt Claude Artifacts engineering discipline: prioritize clean visual typography, self-contained HTML/UI or Office document artifacts, and thoughtful edge-case verification.',
  },
  {
    id: 'kimi',
    name: 'Kimi Long-Context Pro',
    vendor: 'Moonshot Style',
    badge: '200K Synthesis',
    summary: 'Exhaustive multi-document synthesis, deep research matrices, and slide/report production.',
    systemDirective:
      'Adopt Kimi Long-Context research discipline: cross-reference every detail across workspace files and conversation history, highlight contradictions, and structure dense reports clearly.',
  },
  {
    id: 'qoder',
    name: 'Qoder RepoWiki & Quest',
    vendor: 'Alibaba IDE Style',
    badge: 'Repo + Quest',
    summary: 'Repository architecture mapping, Quest spec-driven planning, and minimal diff patches.',
    systemDirective:
      'Adopt Qoder agentic IDE discipline: map architecture dependencies first, write a crisp Quest execution checklist, and deliver minimal, diff-clean file edits.',
  },
];

export const AGENT_SKILLS: AgentSkillMeta[] = [
  // Office Productivity Skills (Word, PPT, Excel)
  {
    id: 'word',
    command: '/word',
    name: 'Word Document Architect (.docx)',
    ecosystem: 'Office',
    role: 'Generates structured proposals, reports & SOPs ready for 1-click .docx export',
    outputKind: 'docx',
    starterPrompt:
      '/word Buatkan proposal proyek peluncuran platform EduTech AI lengkap dengan ringkasan eksekutif, timeline 4 fase, tabel RAB, dan kesimpulan.',
    directive: `You are an expert Word (.docx) Document Architect (matching Claude docx & GPT document skills).
Whenever creating a Word document project, ALWAYS include a single complete JSON block tagged \`\`\`word:document.docx.json (or a descriptive filename ending in .docx.json) matching this exact schema:
{
  "kind": "word",
  "title": "Document Title",
  "subtitle": "Executive Summary / Project Subtitle",
  "author": "MyAI Studio × MYRA",
  "date": "2026-11-20",
  "sections": [
    {
      "heading": "1. Ringkasan Eksekutif",
      "level": 1,
      "paragraphs": ["Clear, professional paragraphs..."],
      "bullets": ["Key bullet point..."],
      "callout": "Important highlight or executive takeaway",
      "table": {
        "headers": ["Komponen", "Detail", "Estimasi"],
        "rows": [["Item A", "Deskripsi", "Rp 5.000.000"]]
      }
    }
  ]
}
Keep JSON strictly valid (double quotes, no trailing commas, no comments inside JSON). Include rich, domain-accurate sections, tables, and bullet points.`,
  },
  {
    id: 'ppt',
    command: '/ppt',
    name: 'PowerPoint Deck Designer (.pptx)',
    ecosystem: 'Office',
    role: 'Builds 6-10 slide pitch decks, KPI cards & speaker notes ready for .pptx export',
    outputKind: 'pptx',
    starterPrompt:
      '/ppt Buat presentasi pitch deck 7 slide untuk startup SaaS AI Analitik Bisnis lengkap dengan metrik KPI, model bisnis, roadmap, dan speaker notes.',
    directive: `You are an expert PowerPoint (.pptx) Presentation Designer (matching Claude pptx & Kimi Slides skills).
Whenever creating a PowerPoint presentation project, ALWAYS include a single complete JSON block tagged \`\`\`ppt:presentation.pptx.json (or a descriptive filename ending in .pptx.json) matching this exact schema:
{
  "kind": "ppt",
  "title": "Deck Title",
  "subtitle": "Subtitle or Presenter Tagline",
  "theme": "indigo",
  "slides": [
    {
      "layout": "title",
      "title": "Main Presentation Title",
      "subtitle": "Clear value proposition subtitle",
      "notes": "Speaker notes for this slide"
    },
    {
      "layout": "metrics",
      "title": "Traction & KPI Snapshot",
      "metrics": [
        { "label": "ARR Growth", "value": "+142%", "delta": "YoY" },
        { "label": "Active Teams", "value": "1,280", "delta": "+38% MoM" }
      ],
      "bullets": ["Concise supporting insight..."],
      "notes": "Key talking points..."
    }
  ]
}
Supported layouts: "title", "bullets", "two-column", "metrics", "closing". Supported themes: "indigo", "dark", "emerald", "slate". Keep JSON strictly valid (no trailing commas). Generate 6-9 well-paced slides with crisp bullets and speaker notes.`,
  },
  {
    id: 'excel',
    command: '/excel',
    name: 'Excel Workbook Modeler (.xlsx)',
    ecosystem: 'Office',
    role: 'Creates multi-sheet spreadsheets with live =SUM/=AVERAGE formulas for .xlsx export',
    outputKind: 'xlsx',
    starterPrompt:
      '/excel Buatkan workbook Excel perencanaan anggaran proyek Q1-Q4 lengkap dengan sheet Ringkasan, Operasional, dan formula =SUM otomatis.',
    directive: `You are an expert Excel (.xlsx) Financial & Data Modeler (matching Claude xlsx & GPT Data Analyst skills).
Whenever creating an Excel spreadsheet project, ALWAYS include a single complete JSON block tagged \`\`\`excel:workbook.xlsx.json (or a descriptive filename ending in .xlsx.json) matching this exact schema:
{
  "kind": "excel",
  "title": "Workbook Title",
  "sheets": [
    {
      "name": "Anggaran",
      "columns": ["Kategori", "Q1", "Q2", "Q3", "Q4", "Total"],
      "rows": [
        ["Infrastruktur Cloud", 12000000, 14000000, 15000000, 16000000, "=SUM(B2:E2)"],
        ["Pengembangan Produk", 25000000, 25000000, 22000000, 20000000, "=SUM(B3:E3)"]
      ],
      "summaryRow": ["Total Keseluruhan", "=SUM(B2:B3)", "=SUM(C2:C3)", "=SUM(D2:D3)", "=SUM(E2:E3)", "=SUM(F2:F3)"],
      "notes": "Catatan asumsi & formula"
    }
  ]
}
Use real numeric values (numbers without quotes) and valid Excel formulas starting with "=" (such as "=SUM(B2:E2)", "=AVERAGE(B2:B5)", "=B2-C2"). Keep sheet names <= 31 characters and JSON strictly valid.`,
  },

  // Gemini Ecosystem Skills
  {
    id: 'deep-research',
    command: '/deep-research',
    name: 'Gemini Deep Research',
    ecosystem: 'Gemini',
    role: 'Multi-angle investigation with Search grounding, source synthesis & trade-off matrices',
    outputKind: 'research',
    starterPrompt:
      '/deep-research Bandingkan arsitektur AI Agent terbaik 2026 (Gemini, GPT, Claude, Kimi, Qoder) beserta matriks kelebihan dan risikonya.',
    directive:
      'Execute Gemini Deep Research: decompose the topic into sub-questions, compare primary trade-offs in structured Markdown tables, cite verified grounded sources when Search is active, and end with concrete recommendations.',
  },
  {
    id: 'grounding',
    command: '/grounding',
    name: 'Gemini Search & Maps Grounding',
    ecosystem: 'Gemini',
    role: 'Real-time web & location verification using Google Search & Maps grounding',
    outputKind: 'research',
    starterPrompt:
      '/grounding Cari tren teknologi AI workspace terbaru dan verifikasi sumber resminya.',
    directive:
      'Prioritize verified facts, current dates, and inline citations from grounded web or Google Maps results. Never fabricate URLs or metrics; clearly distinguish verified facts from analysis.',
  },
  {
    id: 'thinking',
    command: '/thinking',
    name: 'Gemini Structured Thinking & JSON',
    ecosystem: 'Gemini',
    role: 'Step-by-step causal reasoning paired with strict JSON schema contracts',
    outputKind: 'plan',
    starterPrompt:
      '/thinking Rancang skema JSON API dan alur validasi transaksi e-commerce anti-race-condition.',
    directive:
      'Reason step-by-step through invariants, failure modes, and edge cases first, then output a strict, well-typed JSON schema or TypeScript contract block.',
  },

  // GPT (OpenAI) Ecosystem Skills
  {
    id: 'canvas',
    command: '/canvas',
    name: 'GPT Canvas Co-Editor',
    ecosystem: 'GPT',
    role: 'Side-by-side collaborative drafting for code, essays & editable artifacts',
    outputKind: 'code',
    starterPrompt:
      '/canvas Tulis ulang halaman landing page produk SaaS dengan copywriting persuasif dan kode HTML siap edit di Workbench.',
    directive:
      'Operate in GPT Canvas Co-Editor mode: produce a polished, standalone editable artifact (e.g. ```html:canvas.html or ```md:draft.md) alongside crisp section-by-section editorial notes.',
  },
  {
    id: 'data-analyst',
    command: '/data-analyst',
    name: 'GPT Code Interpreter / Analyst',
    ecosystem: 'GPT',
    role: 'Quantitative cohort analysis, KPI formulas, CSV parsing & Excel workbook synthesis',
    outputKind: 'xlsx',
    starterPrompt:
      '/data-analyst Hitung proyeksi pertumbuhan MRR, churn rate, dan LTV/CAC dalam workbook Excel + ringkasan eksekutif.',
    directive:
      'Act as GPT Data Analyst: calculate explicit KPIs, break down formulas transparently, and when a spreadsheet deliverable is helpful, emit a valid ```excel:analysis.xlsx.json workbook with formulas.',
  },
  {
    id: 'prompt-ops',
    command: '/prompt-ops',
    name: 'GPT Custom Instructions & Memory',
    ecosystem: 'GPT',
    role: 'Designs system prompts, evaluation rubrics & workspace memory rules',
    outputKind: 'plan',
    starterPrompt:
      '/prompt-ops Buatkan system prompt & rubric evaluasi kualitas untuk customer support AI berbahasa Indonesia.',
    directive:
      'Design modular, testable system instructions, few-shot examples, boundary guardrails, and concise memory rules ready to save in Settings.',
  },

  // Claude (Anthropic) Ecosystem Skills
  {
    id: 'artifacts',
    command: '/artifacts',
    name: 'Claude Live Artifacts Studio',
    ecosystem: 'Claude',
    role: 'Instant self-contained HTML, interactive dashboard, SVG & React visual artifacts',
    outputKind: 'code',
    starterPrompt:
      '/artifacts Buat dashboard interaktif monitoring KPI penjualan lengkap dengan grafik SVG dan filter kuartal dalam satu index.html.',
    directive:
      'Act as Claude Artifacts Studio: craft visually refined, zero-dependency, self-contained HTML/CSS/JS artifacts using <!-- file: index.html --> so the Workbench Sandbox renders an interactive UI immediately.',
  },
  {
    id: 'xml-planner',
    command: '/xml-planner',
    name: 'Claude Structured Critique & XML',
    ecosystem: 'Claude',
    role: 'High-precision architectural planning with explicit constraints & self-critique',
    outputKind: 'plan',
    starterPrompt:
      '/xml-planner Evaluasi arsitektur autentikasi dan offline sync queue lalu identifikasi 5 edge-case paling kritis.',
    directive:
      'Structure complex reasoning cleanly using explicit sections (Context, Constraints, Plan, Edge-Case Verification) before giving final recommendations or code.',
  },
  {
    id: 'office-suite',
    command: '/office-suite',
    name: 'Claude Pro Office Suite',
    ecosystem: 'Claude',
    role: 'Executive deliverable builder combining Word memos, PPT decks & Excel trackers',
    outputKind: 'docx',
    starterPrompt:
      '/office-suite Siapkan paket dokumen peluncuran produk: proposal Word (.docx.json) dan ringkasan presentasi slide.',
    directive:
      'Act as Claude Document Suite: produce executive-grade Word (```word:memo.docx.json), PowerPoint (```ppt:briefing.pptx.json), or Excel (```excel:tracker.xlsx.json) deliverables tailored to the user goal.',
  },

  // Kimi (Moonshot) Ecosystem Skills
  {
    id: 'long-context',
    command: '/long-context',
    name: 'Kimi 200K+ Long-Context Synthesizer',
    ecosystem: 'Kimi',
    role: 'Cross-references large files, specs & logs to extract unified action matrices',
    outputKind: 'research',
    starterPrompt:
      '/long-context Analisa seluruh file di workspace aktif, petakan alur data utamanya, dan temukan potensi inkonsistensi.',
    directive:
      'Act as Kimi Long-Context Synthesizer: inspect every attached or @referenced workspace file exhaustively, cite exact file paths and symbols, surface contradictions, and produce a clear synthesis matrix.',
  },
  {
    id: 'kimi-explorer',
    command: '/kimi-explorer',
    name: 'Kimi Academic & Slides Explorer',
    ecosystem: 'Kimi',
    role: 'Turns dense research papers or topics into structured executive briefs & PPT decks',
    outputKind: 'pptx',
    starterPrompt:
      '/kimi-explorer Ubah topik adopsi Generative AI di UMKM Indonesia menjadi dek presentasi 7 slide yang terstruktur.',
    directive:
      'Act as Kimi Explorer: distill dense technical or market topics into structured evidence, clear bullet takeaways, and optionally a ```ppt:kimi-deck.pptx.json slide deck.',
  },

  // Qoder (Alibaba Agentic IDE) Ecosystem Skills
  {
    id: 'repowiki',
    command: '/repowiki',
    name: 'Qoder RepoWiki Indexer',
    ecosystem: 'Qoder',
    role: 'Generates architecture maps, module dependency graphs & onboarding wikis',
    outputKind: 'plan',
    starterPrompt:
      '/repowiki Petakan arsitektur aplikasi workspace saat ini menjadi dokumentasi RepoWiki yang ringkas.',
    directive:
      'Act as Qoder RepoWiki: document system boundaries, file responsibilities, state/data flow, and architectural invariants clearly in Markdown (` ```md:REPOWIKI.md `).',
  },
  {
    id: 'quest',
    command: '/quest',
    name: 'Qoder Quest Spec Agent',
    ecosystem: 'Qoder',
    role: 'Breaks ambitious tasks into numbered Quest specs, milestones & test gates',
    outputKind: 'plan',
    starterPrompt:
      '/quest Pecah target pembuatan modul invoice otomatis menjadi Quest Spec bertahap lengkap dengan test plan.',
    directive:
      'Act as Qoder Quest Mode: translate ambiguous product goals into an actionable Quest Specification with Goal, File Plan, Step-by-Step Tasks, and Verification Tests.',
  },
  {
    id: 'inline-diff',
    command: '/inline-diff',
    name: 'Qoder Diff-Aware Patcher',
    ecosystem: 'Qoder',
    role: 'Writes minimal, surgical TypeScript/React patches without breaking working code',
    outputKind: 'code',
    starterPrompt:
      '/inline-diff Refactor kode aktif agar lebih modular dan aman terhadap edge-case tanpa mengubah API publiknya.',
    directive:
      'Act as Qoder Inline Diff Engineer: prioritize minimal, surgical, type-safe changes with explicit file headers (` ```ts:path/file.ts `) and clear before/after impact notes.',
  },
];

export const SKILL_ECOSYSTEMS = [
  'All',
  'Office',
  'Gemini',
  'GPT',
  'Claude',
  'Kimi',
  'Qoder',
] as const;
