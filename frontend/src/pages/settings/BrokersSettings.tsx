import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { BROKERS, BrokerMark, type Broker } from "@/lib/brokers";
import { BrokerConnectModal } from "@/components/settings/BrokerConnectModal";
import type { AlpacaStatus } from "@/types/onboarding";
import { SettingsPage } from "./shared";

/**
 * Brokers settings — a grid of connector "tiles"; clicking one opens its
 * connect dialog. Only Alpaca has a wired save endpoint today, so its tile is
 * the only one that can report a live connection status; the rest open a
 * dialog with their real fields plus the exact manual setup steps.
 */
export function BrokersSettings() {
  const [alpacaStatus, setAlpacaStatus] = useState<AlpacaStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [active, setActive] = useState<Broker | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      setAlpacaStatus(await api.getAlpacaStatus());
    } catch {
      setAlpacaStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const isConnected = (b: Broker) => b.id === "alpaca" && !!alpacaStatus?.ok;

  return (
    <SettingsPage
      title="Brokers"
      description="Connect a brokerage so Coldview can read your account, positions, and trades."
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {BROKERS.length} connectors available — pick one to set it up.
        </p>
        <button
          onClick={loadStatus}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          title="Recheck connections"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? "animate-spin" : ""}`} />
          Recheck
        </button>
      </div>

      {/* Broker tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BROKERS.map((broker) => {
          const connected = isConnected(broker);
          return (
            <button
              key={broker.id}
              type="button"
              onClick={() => setActive(broker)}
              className="group relative flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus:outline-none focus-visible:border-primary"
            >
              <div className="flex w-full items-start justify-between gap-2">
                <BrokerMark broker={broker} size={40} />
                {connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                    <CircleCheck className="h-3 w-3" />
                    Connected
                  </span>
                ) : broker.id === "alpaca" && statusLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : broker.method === "oauth" ? (
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    Sign in
                  </span>
                ) : broker.method === "manual" ? (
                  <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                    Manual setup
                  </span>
                ) : null}
              </div>

              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{broker.name}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{broker.markets}</p>
              </div>

              <span className="text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                {connected ? "Manage →" : "Set up →"}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Credentials are stored locally on this machine under{" "}
        <code className="font-mono">~/.coldview</code> and are sent only to the broker you connect —
        Coldview operates no server in between. Reading positions is free at every broker listed
        here; only live trading requires a committed mandate.
      </p>

      <BrokerConnectModal
        broker={active}
        connected={active ? isConnected(active) : false}
        onClose={() => setActive(null)}
        onConnected={loadStatus}
      />
    </SettingsPage>
  );
}
