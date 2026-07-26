import { useEffect, useState } from "react";
import { Loader2, MessageSquareMore, Play, RefreshCw, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api, type ChannelRuntimeStatus } from "@/lib/api";
import { SettingsPage } from "./shared";

export function ConnectionsSettings() {
  const { t } = useTranslation();
  const [channelStatus, setChannelStatus] = useState<ChannelRuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [channelRefreshing, setChannelRefreshing] = useState(false);
  const [channelAction, setChannelAction] = useState<"start" | "stop" | null>(null);

  useEffect(() => {
    let alive = true;
    api.getChannelStatus()
      .then((value) => { if (alive) setChannelStatus(value); })
      .catch((error) => {
        if (!alive) return;
        toast.error(`${t("settings.channels.refreshFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshChannelStatus = async () => {
    setChannelRefreshing(true);
    try {
      setChannelStatus(await api.getChannelStatus());
    } catch (error) {
      toast.error(`${t("settings.channels.refreshFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setChannelRefreshing(false);
    }
  };

  const setChannelsRunning = async (action: "start" | "stop") => {
    setChannelAction(action);
    try {
      const updated = action === "start" ? await api.startChannels() : await api.stopChannels();
      setChannelStatus(updated);
      toast.success(action === "start" ? t("settings.channels.started") : t("settings.channels.stoppedToast"));
    } catch (error) {
      toast.error(`${action === "start" ? t("settings.channels.startFailed") : t("settings.channels.stopFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setChannelAction(null);
    }
  };

  const channelRows = channelStatus
    ? Object.entries(channelStatus.channels ?? {}).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const channelEnabledCount = channelRows.filter(([, item]) => item.enabled).length;
  const channelLoadedCount = channelRows.filter(([, item]) => item.loaded).length;
  const channelUnavailableCount = channelRows.filter(([, item]) => item.available === false).length;
  const channelBusy = channelRefreshing || channelAction !== null;

  return (
    <SettingsPage title="Connections" description={t("settings.channels.description")}>
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <MessageSquareMore className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">{t("settings.channels.title")}</h2>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">{t("settings.channels.description")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refreshChannelStatus}
              disabled={channelBusy}
              className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {channelRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("settings.channels.refresh")}
            </button>
            <button
              type="button"
              onClick={() => setChannelsRunning("start")}
              disabled={channelBusy || !channelStatus}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {channelAction === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {t("settings.channels.start")}
            </button>
            <button
              type="button"
              onClick={() => setChannelsRunning("stop")}
              disabled={channelBusy || !channelStatus}
              className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {channelAction === "stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              {t("settings.channels.stop")}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-24 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {"Loading..."}
          </div>
        ) : channelStatus ? (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <div className="text-xs text-muted-foreground">{t("settings.channels.runtime")}</div>
                <div className="text-sm font-medium">{channelStatus.running ? t("settings.channels.running") : t("settings.channels.stopped")}</div>
              </div>
              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <div className="text-xs text-muted-foreground">{t("settings.channels.enabled")}</div>
                <div className="text-sm font-medium">{channelEnabledCount}</div>
              </div>
              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <div className="text-xs text-muted-foreground">{t("settings.channels.loaded")}</div>
                <div className="text-sm font-medium">{channelLoadedCount}</div>
              </div>
              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <div className="text-xs text-muted-foreground">{t("settings.channels.unavailable")}</div>
                <div className="text-sm font-medium">{channelUnavailableCount}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{t("settings.channels.channel")}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("settings.channels.state")}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("settings.channels.recovery")}</th>
                  </tr>
                </thead>
                <tbody>
                  {channelRows.map(([name, item]) => (
                    <tr key={name} className="border-t">
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium">{item.display_name || name}</div>
                        <div className="text-xs text-muted-foreground">{name}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${item.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {item.enabled ? t("settings.channels.enabled") : t("settings.channels.disabled")}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${item.loaded ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                            {item.loaded ? t("settings.channels.loaded") : t("settings.channels.notLoaded")}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${item.running ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                            {item.running ? t("settings.channels.running") : t("settings.channels.stopped")}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-md px-3 py-2 align-top text-xs text-muted-foreground">
                        {item.install_hint || item.error || t("settings.channels.noRecovery")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="rounded-md border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("settings.channels.refreshFailed")}
          </div>
        )}
      </section>
    </SettingsPage>
  );
}
