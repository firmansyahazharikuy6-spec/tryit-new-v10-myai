import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import type { ProviderDiagnosticResult, WorkspaceSession } from '../types/workspace';

interface DiagnosticsModalProps {
  open: boolean;
  sessions: WorkspaceSession[];
  onClose: () => void;
}

export function DiagnosticsModal({
  open,
  sessions,
  onClose,
}: DiagnosticsModalProps) {
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderDiagnosticResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (probe: boolean) => {
    if (probe) setProbing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/providers/status${probe ? '?probe=1' : ''}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to inspect provider status.');
      } else {
        setProviders(data.providers ?? []);
        setCheckedAt(data.checkedAt ?? null);
      }
    } catch {
      setError('Could not reach /api/providers/status on server.');
    } finally {
      setLoading(false);
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchStatus(false);
    }
  }, [open, fetchStatus]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const totalTokens = sessions.reduce(
    (sum, s) =>
      sum +
      s.messages.reduce((mSum, m) => mSum + (m.metrics?.totalTokens ?? 0), 0),
    0,
  );
  const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Provider and MYRA diagnostics"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <BrandMark variant="myra" className="w-5 h-5 text-indigo-500" />
            <div>
              <h2 className="font-display text-sm font-semibold">
                MYRA Provider &amp; Token Diagnostics
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Checks real server-side provider health and workspace token consumption without modifying production config.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close diagnostics dialog"
            className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-5">
          <div className="grid grid-cols-3 gap-3 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 bg-zinc-50 dark:bg-zinc-900/40">
            <div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Sessions
              </div>
              <div className="text-lg font-display font-semibold tabular-nums mt-0.5">
                {sessions.length}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Messages
              </div>
              <div className="text-lg font-display font-semibold tabular-nums mt-0.5">
                {totalMessages}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Reported Tokens
              </div>
              <div className="text-lg font-display font-semibold tabular-nums mt-0.5">
                {totalTokens.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {checkedAt
                ? `Last checked: ${new Date(checkedAt).toLocaleTimeString()}`
                : 'Inspecting server runtime...'}
            </div>
            <button
              type="button"
              onClick={() => fetchStatus(true)}
              disabled={probing || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              {probing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Run Live Probe</span>
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-600 dark:text-red-300">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-8 flex items-center justify-center text-xs text-zinc-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Checking providers...</span>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              {providers.map((p) => (
                <div key={p.id} className="p-3.5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {p.name}
                      </span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        · {p.role}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                      {p.detail}
                    </p>
                    <p className="text-[11px] font-mono text-zinc-500 mt-1">
                      Models: {p.models.join(' · ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${
                        p.status === 'connected'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : p.status === 'ready'
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : p.status === 'error'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {p.status === 'connected' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {p.status === 'ready' && <Activity className="w-3.5 h-3.5" />}
                      {(p.status === 'error' || p.status === 'unconfigured') && (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      <span className="capitalize">{p.status}</span>
                    </span>
                    {p.latencyMs !== null && (
                      <div className="text-[11px] font-mono tabular-nums text-zinc-500 mt-0.5">
                        {p.latencyMs} ms
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
