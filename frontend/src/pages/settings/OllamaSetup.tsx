import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, CircleX, TriangleAlert, Download, Loader2, RefreshCw, ExternalLink, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { OllamaCheckLevel, OllamaInstallStatus, OllamaStatus } from "@/types/ollama";

const LEVEL_ICON: Record<OllamaCheckLevel, typeof CircleCheck> = {
  ok: CircleCheck,
  warn: TriangleAlert,
  error: CircleX,
};
const LEVEL_COLOR: Record<OllamaCheckLevel, string> = {
  ok: "text-success",
  warn: "text-warning",
  error: "text-danger",
};

/**
 * Local Ollama runtime panel for the AI Settings "Local" tab. Detects whether
 * Ollama + a model are present, runs a preflight system check, and offers a
 * guarded one-click install (with live progress). Calls `onReady(models)` once
 * a model is available so the parent can pre-fill the model field.
 */
export function OllamaSetup({
  onReady,
  onModels,
}: {
  onReady?: (models: string[]) => void;
  onModels?: (models: string[]) => void;
}) {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [job, setJob] = useState<OllamaInstallStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.getOllamaStatus();
      setStatus(s);
      onModels?.(s.models.map((m) => m.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read Ollama status");
    }
  }, [onModels]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const j = await api.getOllamaInstallStatus();
        setJob(j);
        if (j.state === "done" || j.state === "error") {
          stopPolling();
          setInstalling(false);
          await loadStatus();
          if (j.state === "done") onReady?.(j.models);
        }
      } catch {
        /* keep polling */
      }
    }, 1500);
  }, [loadStatus, onReady, stopPolling]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Resume progress if an install is already running (e.g. tab was revisited).
  useEffect(() => {
    if (status?.installState === "running" && !installing) {
      setInstalling(true);
      startPolling();
    }
  }, [status, installing, startPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const install = async () => {
    setError(null);
    try {
      const res = await api.startOllamaInstall();
      if (!res.started) {
        setError(res.reason || "Could not start the install.");
        return;
      }
      setInstalling(true);
      setJob({ state: "running", step: "Starting…", log: [], error: null, models: [], startedAt: null, finishedAt: null });
      startPolling();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the install.");
    }
  };

  if (!status) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking your local AI runtime…
      </div>
    );
  }

  // --- Installing: live progress ---
  if (installing || job?.state === "running") {
    const tail = (job?.log ?? []).slice(-12);
    return (
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <h3 className="text-sm font-semibold">{job?.step || "Setting up Ollama…"}</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">This can take several minutes while models download. You can leave this tab open.</p>
        {tail.length > 0 && (
          <pre className="mt-3 max-h-44 overflow-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            {tail.join("\n")}
          </pre>
        )}
      </div>
    );
  }

  // --- Ready: installed, running, has models ---
  if (status.ready) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-success" />
            <span className="text-sm font-medium">
              Ollama is ready · {status.models.length} model{status.models.length === 1 ? "" : "s"}
            </span>
          </div>
          <button onClick={loadStatus} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground" title="Recheck">
            <RefreshCw className="h-3.5 w-3.5" /> Recheck
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {status.models.map((m) => (
            <span key={m.name} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[11px]">
              <Cpu className="h-3 w-3 text-primary" /> {m.name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // --- Needs setup ---
  const needInstall = !status.installed;
  const buttonLabel = needInstall ? "Install Ollama & model" : "Download recommended model";
  const blocked = status.preflight.some((c) => c.level === "error");

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Set up local AI</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {needInstall
              ? "Ollama isn't installed yet. Run models locally with one click — no API key, fully private."
              : "Ollama is installed but has no model yet. Download a recommended one to get started."}
          </p>
        </div>
        <button onClick={loadStatus} className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground" title="Recheck">
          <RefreshCw className="h-3.5 w-3.5" /> Recheck
        </button>
      </div>

      {/* Preflight checklist */}
      <ul className="mt-4 space-y-2">
        {status.preflight.map((c) => {
          const Icon = LEVEL_ICON[c.level];
          return (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", LEVEL_COLOR[c.level])} />
              <span className="min-w-0">
                <span className="font-medium">{c.label}</span>
                <span className="text-muted-foreground"> — {c.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      {/* Action */}
      <div className="mt-4">
        {status.canAutoInstall ? (
          <>
            <button
              onClick={install}
              disabled={blocked}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {buttonLabel}
            </button>
            <p className="mt-2 text-xs text-muted-foreground">
              Installs {status.defaultModelNote}
              {status.installMethod === "brew" ? " Uses Homebrew." : ""}
            </p>
          </>
        ) : (
          <div className="text-sm">
            <p className="text-muted-foreground">
              Automatic install isn't available on this system. Install Ollama manually, then click Recheck.
            </p>
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:border-primary/40 hover:text-primary"
            >
              Get Ollama <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
