import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  Code2,
  Gamepad2,
  Globe,
  Layers,
  MapPin,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import {
  AGENT_MODES,
  ENGINE_TIERS,
  PROVIDER_ECOSYSTEM,
  SPECIALIST_AGENTS,
} from '../data/catalog';
import type {
  AgentMode,
  EngineTierId,
  MediaSuiteTab,
  SpecialistSlashId,
  ThemeMode,
} from '../types/workspace';

interface LandingPageProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onLaunchStudio: (opts?: {
    prompt?: string;
    tier?: EngineTierId;
    specialist?: SpecialistSlashId;
    mode?: AgentMode;
  }) => void;
  onOpenSuite: (tab?: MediaSuiteTab) => void;
  onOpenGame: () => void;
}

export function LandingPage({
  theme,
  onToggleTheme,
  onLaunchStudio,
  onOpenSuite,
  onOpenGame,
}: LandingPageProps) {
  const [heroPrompt, setHeroPrompt] = useState(
    'Build a SaaS analytics dashboard with live charts, billing table, and dark mode.',
  );
  const [heroMode, setHeroMode] = useState<AgentMode>('build');
  const [heroTier, setHeroTier] = useState<EngineTierId>('auto');
  const [selectedSpecialist, setSelectedSpecialist] =
    useState<SpecialistSlashId>('myra');

  // Validated inquiry / team access form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactNote, setContactNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitted, setFormSubmitted] = useState(false);

  const activeSpec =
    SPECIALIST_AGENTS.find((s) => s.id === selectedSpecialist) ??
    SPECIALIST_AGENTS[0];

  function handleHeroLaunch(e: React.FormEvent) {
    e.preventDefault();
    onLaunchStudio({
      prompt: heroPrompt.trim() || undefined,
      tier: heroTier,
      mode: heroMode,
      specialist: selectedSpecialist,
    });
  }

  function handleInquirySubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameTrim = contactName.trim();
    const emailTrim = contactEmail.trim();
    if (!nameTrim) {
      setFormError('Please enter your name or team name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setFormError('Please enter a valid work or personal email address.');
      return;
    }
    setFormError(null);
    setFormSubmitted(true);
  }

  return (
    <div
      id="top"
      className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-[#09090B] dark:text-zinc-100"
    >
      {/* Top Bar Contract: 3 clean zones separated by gap-8 */}
      <header className="sticky top-0 z-40 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/90 dark:bg-[#09090B]/90 backdrop-blur">
        <div className="max-w-6xl mx-auto h-14 px-5 sm:px-8 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="flex items-center gap-2.5 text-base font-display font-bold tracking-tight text-zinc-900 dark:text-white whitespace-nowrap shrink-0"
          >
            <BrandMark variant="myai" className="w-6 h-5" />
            <span>MyAI</span>
          </a>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600 dark:text-zinc-400"
          >
            <a
              href="#platform"
              className="hover:text-zinc-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Platform
            </a>
            <a
              href="#myra-agent"
              className="hover:text-zinc-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              MYRA Agent
            </a>
            <a
              href="#models"
              className="hover:text-zinc-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Models
            </a>
            <a
              href="#capabilities"
              className="hover:text-zinc-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <button
              type="button"
              onClick={() => onOpenSuite('image')}
              className="hover:text-zinc-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Media Lab
            </button>
            <button
              type="button"
              onClick={() => onOpenSuite('3d')}
              className="hover:text-zinc-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              3D Core
            </button>
            <button
              type="button"
              onClick={onOpenGame}
              className="hover:text-zinc-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              3D Game
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={
                theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
              }
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onLaunchStudio()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Open Studio</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-14 pb-20 lg:pt-20 lg:pb-24">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-4">
                  MyAI Ecosystem · Built-in MYRA Agent · Cloud &amp; Local Models
                </p>
                <h1 className="font-display text-[clamp(2.25rem,4.3vw,3.65rem)] font-bold leading-[1.08] tracking-tight text-zinc-900 dark:text-white text-balance">
                  One AI workspace to plan, code, verify, and ship real products.
                </h1>
                <p className="mt-5 text-base text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl">
                  MyAI connects multi-provider cloud inference and private local models inside a
                  three-pane engineering workspace. Switch on MYRA to plan in four verifiable
                  stages, edit multi-file diffs, and run live previews without leaving your flow.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onLaunchStudio()}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Launch MyAI Studio</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSuite('image')}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] text-zinc-800 dark:text-zinc-200 hover:border-indigo-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <span>Media &amp; Voice Lab</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenGame}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] text-zinc-800 dark:text-zinc-200 hover:border-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Gamepad2 className="w-4 h-4 text-emerald-500" />
                    <span>3D Arena</span>
                  </button>
                </div>
              </div>

              <div className="mt-10 pt-6 border-t border-zinc-200 dark:border-zinc-800/80 grid grid-cols-3 gap-6">
                <div>
                  <div className="font-display text-xl font-bold tabular-nums text-zinc-900 dark:text-white">
                    {SPECIALIST_AGENTS.length}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Slash specialist skills
                  </div>
                </div>
                <div>
                  <div className="font-display text-xl font-bold tabular-nums text-zinc-900 dark:text-white">
                    5
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Cloud &amp; local gateways
                  </div>
                </div>
                <div>
                  <div className="font-display text-xl font-bold tabular-nums text-zinc-900 dark:text-white">
                    4-Stage
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    MYRA execution loop
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Launcher Card */}
            <div className="lg:col-span-6 flex">
              <form
                onSubmit={handleHeroLaunch}
                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                      <BrandMark variant="myra" className="w-4 h-4 text-indigo-500" />
                      <span>MYRA Studio Launcher</span>
                    </div>
                    <span className="text-xs font-mono text-zinc-500">
                      Preview · Diff · Console
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                      Agent Mode
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                      {AGENT_MODES.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setHeroMode(m.id)}
                          className={`py-1.5 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            heroMode === m.id
                              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <label
                      htmlFor="hero-prompt-input"
                      className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2"
                    >
                      Prompt or Product Spec
                    </label>
                    <textarea
                      id="hero-prompt-input"
                      rows={4}
                      value={heroPrompt}
                      onChange={(e) => setHeroPrompt(e.target.value)}
                      placeholder="Describe what MYRA should build, debug, or research..."
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] px-3.5 py-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                    />
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                      Engine Tier
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ENGINE_TIERS.slice(0, 6).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setHeroTier(t.id)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            heroTier === t.id
                              ? 'bg-indigo-600 text-white'
                              : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200'
                          }`}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Launches directly into Split Workbench
                  </span>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Start Building</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* Platform Architecture: Asymmetric Bento */}
        <section
          id="platform"
          className="border-t border-zinc-200 dark:border-zinc-800/80 py-20"
        >
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <div className="max-w-2xl mb-12">
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-2">
                Platform Architecture
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white text-balance">
                Engineered like an IDE, fast like a chat workspace.
              </h2>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Built to move beyond single-column chat boxes by uniting Emergent-style build
                sandboxes, Qoder-grade multi-file diffing, and Qwen-clean artifact inspection.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114]">
                <div className="text-xs font-mono text-zinc-500 mb-2">
                  01. Multi-Engine Auto Routing
                </div>
                <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
                  Intent-aware dispatch across Flash, Coding, Pro, and Local tiers
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-2xl">
                  Every prompt is inspected for coding, deep reasoning, or low-latency intent before
                  execution. Leave routing on Auto or lock a tier manually—server-side orchestration
                  keeps API keys off the client while reporting token usage per turn.
                </p>
                <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <span>Auto intent detection</span>
                  <span aria-hidden="true">·</span>
                  <span>Streaming SSE responses</span>
                  <span aria-hidden="true">·</span>
                  <span>Google Search grounding</span>
                  <span aria-hidden="true">·</span>
                  <span>BYOK provider diagnostics</span>
                </div>
              </div>

              <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114]">
                <div className="text-xs font-mono text-zinc-500 mb-2">
                  02. MYRA Agent Loop
                </div>
                <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
                  Four verifiable stages
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Analysis, Planning, Execution, and Verification run visibly above every generated
                  artifact—plus non-destructive diagnostics across configured providers.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114]">
                <div className="text-xs font-mono text-zinc-500 mb-2">
                  03. Live Code, Diff &amp; Console
                </div>
                <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
                  Editable files &amp; runtime capture
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Inspect line-by-line diffs, edit code directly, preview desktop and mobile frames,
                  and send iframe console errors straight to <span className="font-mono">/debugger</span>.
                </p>
              </div>

              <div className="lg:col-span-2 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114]">
                <div className="text-xs font-mono text-zinc-500 mb-2">
                  04. Modern Agent Ergonomics
                </div>
                <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
                  @Context mentions, conversation branching, and on-device memory
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-2xl">
                  Pin specific project files with <span className="font-mono">@index.html</span> or{' '}
                  <span className="font-mono">@memory</span>, branch a conversation from any turn,
                  organize workspaces into folders, and export full JSON snapshots at any time.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* MYRA Agent & Slash Specialists */}
        <section
          id="myra-agent"
          className="border-t border-zinc-200 dark:border-zinc-800/80 py-20 bg-zinc-100/50 dark:bg-[#0D0D10]"
        >
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-5">
                <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-2">
                  <BrandMark variant="myra" className="w-4 h-4" />
                  <span>Built-In Agent</span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white text-balance">
                  Meet MYRA: {SPECIALIST_AGENTS.length} specialist workflows on one command.
                </h2>
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Type a slash command in the composer or pick a specialist below to focus MYRA on
                  system architecture, debugging, security auditing, UI design, or deployment.
                </p>

                <div className="mt-6 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                      {activeSpec.command}
                    </span>
                    <span className="text-xs text-zinc-500">{activeSpec.name}</span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                    {activeSpec.role}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {activeSpec.directive}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onLaunchStudio({ specialist: activeSpec.id })
                    }
                    className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span>Open Studio with {activeSpec.command}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="lg:col-span-7 grid sm:grid-cols-2 gap-2.5">
                {SPECIALIST_AGENTS.map((agent) => {
                  const selected = agent.id === selectedSpecialist;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setSelectedSpecialist(agent.id)}
                      className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-500/10'
                          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-zinc-400 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          {agent.command}
                        </span>
                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {agent.name}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                        {agent.role}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Provider Ecosystem */}
        <section
          id="models"
          className="border-t border-zinc-200 dark:border-zinc-800/80 py-20"
        >
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
              <div>
                <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-2">
                  Connected Gateways
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  Cloud intelligence meets local privacy.
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onLaunchStudio()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap cursor-pointer"
              >
                <span>Check live provider health in Studio</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-[#111114] divide-y divide-zinc-200 dark:divide-zinc-800">
              {PROVIDER_ECOSYSTEM.map((provider) => (
                <div
                  key={provider.name}
                  className="p-5 grid md:grid-cols-12 gap-4 items-center"
                >
                  <div className="md:col-span-3">
                    <div className="font-display text-sm font-semibold text-zinc-900 dark:text-white">
                      {provider.name}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {provider.category}
                    </div>
                  </div>
                  <div className="md:col-span-5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {provider.summary}
                  </div>
                  <div className="md:col-span-4 text-xs font-mono text-zinc-500 dark:text-zinc-400 md:text-right">
                    {provider.models.join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Capabilities Checklist */}
        <section
          id="capabilities"
          className="border-t border-zinc-200 dark:border-zinc-800/80 py-20 bg-zinc-100/50 dark:bg-[#0D0D10]"
        >
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <div className="max-w-2xl mb-10">
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-2">
                Full Agent Toolset
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Every workflow modern AI builders expect.
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  icon: Terminal,
                  title: 'Slash & @Context Commands',
                  desc: `Trigger ${SPECIALIST_AGENTS.length} specialist agents with / and pin workspace files or memory with @.`,
                  onClick: () => onLaunchStudio(),
                  action: 'Open Workbench',
                },
                {
                  icon: Sparkles,
                  title: 'Image, Music & Video Studio',
                  desc: 'Create & edit images (Nano Banana 2.1), compose Lyria 3 music, and render Omni 1.2 video.',
                  onClick: () => onOpenSuite('image'),
                  action: 'Open Media Lab',
                },
                {
                  icon: Layers,
                  title: 'Live Voice & Transcribe',
                  desc: 'Full-duplex Gemini 3.8 Live voice conversations over WebSocket plus audio transcription.',
                  onClick: () => onOpenSuite('voice'),
                  action: 'Open Voice Studio',
                },
                {
                  icon: MapPin,
                  title: 'Google Maps Explorer & Grounding',
                  desc: 'Interactive Maps SDK markers fused with Gemini 4 Hydrogen place discovery & review snippets.',
                  onClick: () => onOpenSuite('maps'),
                  action: 'Explore Maps',
                },
                {
                  icon: Box,
                  title: 'MYRA 3D Core Showcase',
                  desc: 'Interactive Three.js 10-part PBR assembly with exploded view, brushed metal finishes & PNG capture.',
                  onClick: () => onOpenSuite('3d'),
                  action: 'Inspect 3D Core',
                },
                {
                  icon: Gamepad2,
                  title: 'MYRA: Core Defense (3D Game)',
                  desc: 'Wave survival 3D arena with tactical dash, 3 distinct AI enemy classes, Web Audio SFX & leaderboard.',
                  onClick: onOpenGame,
                  action: 'Play 3D Arena',
                },
              ].map((cap) => {
                const Icon = cap.icon;
                return (
                  <div
                    key={cap.title}
                    className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] flex flex-col justify-between gap-4"
                  >
                    <div>
                      <Icon className="w-4 h-4 text-indigo-500 mb-3" />
                      <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">
                        {cap.title}
                      </h3>
                      <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {cap.desc}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={cap.onClick}
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline w-fit cursor-pointer"
                    >
                      <span>{cap.action}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 grid sm:grid-cols-3 gap-4 text-xs text-zinc-600 dark:text-zinc-400">
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] flex items-center gap-3">
                <Code2 className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>Line-by-line diffs, one-click revert, and sandbox console debugger</span>
              </div>
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] flex items-center gap-3">
                <Globe className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Explicit Gemini model routing + Google Search &amp; Maps grounding</span>
              </div>
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Firebase Auth &amp; Firestore cloud sync across workspace, media &amp; scores</span>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing & Team Contact */}
        <section
          id="pricing"
          className="border-t border-zinc-200 dark:border-zinc-800/80 py-20"
        >
          <div className="max-w-6xl mx-auto px-5 sm:px-8 grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-7">
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-2">
                Honest Billing
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Transparent plans. Pay providers directly.
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                No platform markup on tokens. Start in the studio immediately or connect your own
                provider keys.
              </p>

              <div className="mt-8 grid sm:grid-cols-3 gap-4">
                {[
                  {
                    audience: 'For quick exploration',
                    title: 'Studio Starter',
                    price: '$0',
                    items: [
                      'Full 3-pane workbench',
                      'Live HTML & diff preview',
                      'On-device memory & folders',
                    ],
                  },
                  {
                    audience: 'For solo builders',
                    title: 'BYOK Cloud',
                    price: 'Provider Cost',
                    items: [
                      'Server-side Gemini SDK',
                      'Optional OpenRouter & Groq',
                      'Google Search grounding',
                    ],
                  },
                  {
                    audience: 'For engineering teams',
                    title: 'Private & Local',
                    price: 'Self-Hosted',
                    items: [
                      'NVIDIA NIM & Ollama',
                      'Custom specialist presets',
                      'Full .json audit export',
                    ],
                  },
                ].map((plan) => (
                  <div
                    key={plan.title}
                    className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {plan.audience}
                      </div>
                      <h3 className="font-display text-base font-semibold mt-1">
                        {plan.title}
                      </h3>
                      <div className="font-display text-xl font-bold tabular-nums mt-2 text-indigo-600 dark:text-indigo-400">
                        {plan.price}
                      </div>
                      <ul className="mt-4 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                        {plan.items.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Validated Team / Deployment Request Form */}
            <div className="lg:col-span-5">
              <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114]">
                <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-white">
                  Request Team Setup or Custom Deployment
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Leave your details for multi-seat BYOK gateways or custom MYRA agent workflows.
                </p>

                {formSubmitted ? (
                  <div className="mt-6 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 space-y-2">
                    <div className="font-semibold">Request recorded</div>
                    <p>
                      Thank you, {contactName}. We recorded your workspace inquiry for{' '}
                      <span className="font-mono">{contactEmail}</span>.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setFormSubmitted(false);
                        setContactName('');
                        setContactEmail('');
                        setContactNote('');
                      }}
                      className="text-xs font-medium underline cursor-pointer"
                    >
                      Submit another note
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleInquirySubmit} noValidate className="mt-5 space-y-3.5">
                    <div>
                      <label
                        htmlFor="inquiry-name"
                        className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                      >
                        Name or Team
                      </label>
                      <input
                        id="inquiry-name"
                        type="text"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Firmansyah Studio"
                        className="w-full px-3 py-2 rounded-lg text-xs border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="inquiry-email"
                        className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                      >
                        Email Address
                      </label>
                      <input
                        id="inquiry-email"
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="team@example.com"
                        className="w-full px-3 py-2 rounded-lg text-xs border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="inquiry-note"
                        className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                      >
                        Primary Workflow (Optional)
                      </label>
                      <textarea
                        id="inquiry-note"
                        rows={2}
                        value={contactNote}
                        onChange={(e) => setContactNote(e.target.value)}
                        placeholder="Full-stack app builder, private Ollama routing..."
                        className="w-full px-3 py-2 rounded-lg text-xs border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                      />
                    </div>

                    {formError && (
                      <p role="alert" className="text-xs text-red-500">
                        {formError}
                      </p>
                    )}

                    <button
                      type="submit"
                      className="w-full py-2.5 px-4 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                    >
                      Request Workspace Setup
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800/80 py-10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2.5">
            <BrandMark variant="myai" className="w-5 h-4 text-zinc-900 dark:text-white" />
            <span className="font-medium text-zinc-900 dark:text-white">MyAI</span>
            <span aria-hidden="true">·</span>
            <span>One workspace for MyAI &amp; MYRA</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <a href="#platform" className="hover:text-zinc-900 dark:hover:text-white">
              Platform
            </a>
            <a href="#myra-agent" className="hover:text-zinc-900 dark:hover:text-white">
              MYRA
            </a>
            <a href="#models" className="hover:text-zinc-900 dark:hover:text-white">
              Models
            </a>
            <button
              type="button"
              onClick={() => onLaunchStudio()}
              className="hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              Open Studio
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
