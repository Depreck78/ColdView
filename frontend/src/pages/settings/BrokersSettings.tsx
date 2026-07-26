import { useCallback, useEffect, useState } from "react";
import { Building2, CircleCheck, CircleX, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { AlpacaConnectResult, AlpacaStatus } from "@/types/onboarding";
import { SettingsPage, fieldClass, labelClass, hintClass } from "./shared";

// Other connectors ship in the codebase but are configured outside this form
// for now (env / agent config); surfaced here so users know they exist.
const OTHER_BROKERS = [
  "Interactive Brokers", "Robinhood", "Tiger", "OKX", "Binance",
  "Futu", "Longbridge", "Dhan", "Shoonya",
];

export function BrokersSettings() {
  const [status, setStatus] = useState<AlpacaStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [broker, setBroker] = useState({ api_key: "", secret_key: "", profile: "paper", feed: "iex" });
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<AlpacaConnectResult | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      setStatus(await api.getAlpacaStatus());
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const connect = async () => {
    setConnecting(true);
    setResult(null);
    try {
      const r = await api.connectAlpaca({ ...broker, save: true });
      setResult(r);
      if (r.ok) {
        toast.success("Alpaca connected");
        setBroker((b) => ({ ...b, api_key: "", secret_key: "" }));
        loadStatus();
      } else {
        toast.error(r.error || "Could not verify — credentials were saved, check them.");
      }
    } catch (e) {
      toast.error(`Connection failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setConnecting(false);
    }
  };

  const connected = status?.ok;

  return (
    <SettingsPage title="Brokers" description="Connect a brokerage so Coldview can read your account, positions, and trades.">
      {/* Alpaca */}
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Alpaca</h2>
          </div>
          <div className="flex items-center gap-3">
            {statusLoading ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</span>
            ) : connected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                <CircleCheck className="h-3.5 w-3.5" />
                Connected{status?.account?.is_paper ? " · paper" : status?.account ? " · live" : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Not connected
              </span>
            )}
            <button onClick={loadStatus} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground" title="Recheck">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {connected && status?.account?.account_number ? (
          <p className="mb-4 text-sm text-muted-foreground">
            Account <span className="font-mono">{status.account.account_number}</span> ({status.account.profile}). Enter new credentials below to replace them.
          </p>
        ) : null}

        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className={labelClass}>API key ID</span>
            <input value={broker.api_key} onChange={(e) => setBroker({ ...broker, api_key: e.target.value })} className={fieldClass} placeholder="PK…" autoComplete="off" />
          </label>
          <label className="grid gap-2">
            <span className={labelClass}>API secret key</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input type="password" value={broker.secret_key} onChange={(e) => setBroker({ ...broker, secret_key: e.target.value })} className={`${fieldClass} pl-9`} placeholder={connected ? "Leave blank to keep the saved secret" : "Your Alpaca secret"} autoComplete="off" />
            </div>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className={labelClass}>Account</span>
              <select value={broker.profile} onChange={(e) => setBroker({ ...broker, profile: e.target.value })} className={fieldClass}>
                <option value="paper">Paper (recommended)</option>
                <option value="live-readonly">Live · read-only</option>
                <option value="live">Live</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className={labelClass}>Data feed</span>
              <select value={broker.feed} onChange={(e) => setBroker({ ...broker, feed: e.target.value })} className={fieldClass}>
                <option value="iex">IEX (free)</option>
                <option value="sip">SIP (paid)</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={connect}
            disabled={connecting || !broker.api_key.trim() || !broker.secret_key.trim()}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {connecting ? "Connecting…" : "Connect & test"}
          </button>

          {result ? (
            <div className={cn("flex items-start gap-2 rounded-md border p-3 text-sm", result.ok ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5")}>
              {result.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
              <span>
                {result.ok
                  ? `Connected to Alpaca ${result.report?.account?.is_paper ? "paper" : "live"} account${result.report?.account?.account_number ? ` (${result.report.account.account_number})` : ""}.`
                  : (result.error || "Could not verify. Credentials were saved — double-check them.")}
              </span>
            </div>
          ) : null}

          <p className={hintClass}>
            Credentials are stored locally in <code className="font-mono">~/.coldview/alpaca.json</code> (owner-only). Get paper keys at{" "}
            <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">app.alpaca.markets</a>.
          </p>
        </div>
      </section>

      {/* Other brokers */}
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold">Other brokers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Coldview also ships connectors for the brokers below. They're configured via the agent config / environment for now — a UI form is coming.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {OTHER_BROKERS.map((b) => (
            <span key={b} className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">{b}</span>
          ))}
        </div>
      </section>
    </SettingsPage>
  );
}
