import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, ExternalLink, KeyRound, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { BrokerMark, type Broker } from "@/lib/brokers";
import { api } from "@/lib/api";

interface Props {
  broker: Broker | null;
  /** Whether this broker currently reports a verified connection. */
  connected?: boolean;
  onClose: () => void;
  /** Called after a successful `form` connect so the grid can refresh status. */
  onConnected?: () => void;
}

/**
 * Per-broker connect dialog.
 *
 * `form` brokers (Alpaca today) post real credentials to the backend, which
 * verifies and stores them locally. `manual` brokers have a connector in the
 * codebase but no save endpoint, so the dialog collects the same fields and
 * produces a copyable config snippet plus the exact setup steps — it never
 * pretends to have saved something the backend would not read.
 */
export function BrokerConnectModal({ broker, connected, onClose, onConnected }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [profile, setProfile] = useState("paper");
  const [feed, setFeed] = useState("iex");
  const closeRef = useRef<HTMLButtonElement>(null);

  // Reset the form whenever a different broker is opened.
  useEffect(() => {
    setValues({});
    setCopied(false);
    setCopiedJson(false);
    setProfile("paper");
    setFeed("iex");
  }, [broker?.id]);

  useEffect(() => {
    if (!broker) return;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [broker, onClose]);

  // Snippet for `manual` brokers. Secrets the user typed are echoed back here
  // because this is their own machine and they are about to paste it into
  // their own config — but empty fields stay as placeholders.
  const snippet = useMemo(() => {
    if (!broker || broker.method !== "manual" || broker.fields.length === 0) return "";
    return broker.fields
      .map((f) => `${f.key}=${values[f.key]?.trim() || (f.placeholder ?? "")}`)
      .join("\n");
  }, [broker, values]);

  if (!broker) return null;

  const isForm = broker.method === "form";
  const missingRequired = isForm && broker.fields.some((f) => !values[f.key]?.trim());

  const connect = async () => {
    setSubmitting(true);
    try {
      const r = await api.connectAlpaca({
        api_key: values.api_key ?? "",
        secret_key: values.secret_key ?? "",
        profile,
        feed,
        save: true,
      });
      if (r.ok) {
        toast.success(`${broker.name} connected`);
        onConnected?.();
        onClose();
      } else {
        toast.error(r.error || "Could not verify — credentials were saved, check them.");
      }
    } catch (e) {
      toast.error(`Connection failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const copyConfigJson = async () => {
    if (!broker.configJson) return;
    try {
      await navigator.clipboard.writeText(broker.configJson);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="broker-modal-title"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <BrokerMark broker={broker} size={44} />
          <div className="min-w-0 flex-1">
            <h2 id="broker-modal-title" className="text-lg font-semibold leading-tight">
              {broker.name}
            </h2>
            <p className="text-xs text-muted-foreground">{broker.markets}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{broker.how}</p>

        {connected && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Already connected — entering new credentials replaces them.
          </div>
        )}

        {/* Fields */}
        {broker.fields.length > 0 && (
          <div className="mt-5 grid gap-4">
            {broker.fields.map((f) => (
              <label key={f.key} className="grid gap-1.5">
                <span className="text-sm font-medium">{f.label}</span>
                <div className="relative">
                  {f.secret && (
                    <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  )}
                  <input
                    type={f.secret ? "password" : "text"}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className={`w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition focus:border-primary/50 ${
                      f.secret ? "pl-9" : ""
                    }`}
                  />
                </div>
                {f.hint && <span className="text-xs text-muted-foreground">{f.hint}</span>}
              </label>
            ))}

            {/* Alpaca-only account/feed selectors */}
            {isForm && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">Account</span>
                  <select
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
                  >
                    <option value="paper">Paper (recommended)</option>
                    <option value="live-readonly">Live · read-only</option>
                    <option value="live">Live</option>
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">Data feed</span>
                  <select
                    value={feed}
                    onChange={(e) => setFeed(e.target.value)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
                  >
                    <option value="iex">IEX (free)</option>
                    <option value="sip">SIP (paid)</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Manual setup steps + copyable snippet */}
        {!isForm && (
          <div className="mt-5 grid gap-3">
            {broker.configJson && (
              <div className="rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {broker.configFile}
                  </span>
                  <button
                    type="button"
                    onClick={copyConfigJson}
                    className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    {copiedJson ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedJson ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="max-h-56 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/80">
                  {broker.configJson}
                </pre>
              </div>
            )}

            {snippet && (
              <div className="rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-xs font-medium text-muted-foreground">Config</span>
                  <button
                    type="button"
                    onClick={copySnippet}
                    className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed text-foreground/80">
                  {snippet}
                </pre>
              </div>
            )}

            {broker.steps && (
              <ol className="grid gap-1.5 text-sm text-muted-foreground">
                {broker.steps.map((s, i) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground/70">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {broker.docsUrl ? (
            <a
              href={broker.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {broker.docsLabel ?? "Documentation"}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span />
          )}

          {isForm ? (
            <button
              type="button"
              onClick={connect}
              disabled={submitting || missingRequired}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Connecting…" : "Connect & test"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:border-primary/40"
            >
              Done
            </button>
          )}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Credentials stay on this machine (<code className="font-mono">~/.coldview</code>) and go
          only to {broker.name}. Coldview runs no server in between.
        </p>
      </div>
    </div>,
    document.body,
  );
}
