import i18n from "@/i18n";
import { useEffect, useState, type FormEvent } from "react";
import { Database, KeyRound, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { QVerisSettings } from "@/components/settings/QVerisSettings"; // QVERIS-INTEGRATION
import { api, isAuthRequiredError, type DataSourceSettings } from "@/lib/api";
import { SettingsPage, SettingsLoader, fieldClass, labelClass, hintClass } from "./shared";

export function DataSettings() {
  const [dataSettings, setDataSettings] = useState<DataSourceSettings | null>(null);
  const [tushareToken, setTushareToken] = useState("");
  const [clearTushareToken, setClearTushareToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataSaving, setDataSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.getDataSourceSettings()
      .then((value) => { if (alive) setDataSettings(value); })
      .catch((error) => {
        if (!alive) return;
        const message = error instanceof Error ? error.message : "Unknown error";
        setLoadError(message);
        toast.error(isAuthRequiredError(error) ? message : `Failed to load data source settings: ${message}`);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const submitDataSources = async (event: FormEvent) => {
    event.preventDefault();
    setDataSaving(true);
    try {
      const updated = await api.updateDataSourceSettings({
        tushare_token: tushareToken.trim() || undefined,
        clear_tushare_token: clearTushareToken,
      });
      setDataSettings(updated);
      setTushareToken("");
      setClearTushareToken(false);
      toast.success("Data source settings saved");
    } catch (error) {
      toast.error(`Failed to save data source settings: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setDataSaving(false);
    }
  };

  const description = "Optional market-data credentials and the tool marketplace.";

  return (
    <SettingsPage title="Data sources" description={description}>
      {/* QVERIS-INTEGRATION */}
      <QVerisSettings />

      {loading || !dataSettings ? (
        <SettingsLoader error={loadError} />
      ) : (
        <form onSubmit={submitDataSources} className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="mb-5 space-y-1">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">{"Data Source Settings"}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{"Configure optional market data credentials used by backtests and research agents."}</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className={labelClass}>{"Tushare token"}</span>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={tushareToken}
                    onChange={(event) => setTushareToken(event.target.value)}
                    className={`${fieldClass} pl-9`}
                    placeholder={dataSettings.tushare_token_configured ? "Configured" : "Leave blank to keep the current token"}
                    autoComplete="current-password"
                    disabled={clearTushareToken}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className={hintClass}>{"Used for China A-share, futures, fund, and macro data. If unset, the project falls back to AKShare where available."}</span>
                  <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={clearTushareToken}
                      onChange={(event) => {
                        setClearTushareToken(event.target.checked);
                        if (event.target.checked) setTushareToken("");
                      }}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    {"Clear saved Tushare token"}
                  </label>
                </div>
              </label>

              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{i18n.t("settings.saved")}: </span>
                <span className="break-all font-mono">{dataSettings.env_path}</span>
              </div>

              <button
                type="submit"
                disabled={dataSaving}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {dataSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {dataSaving ? i18n.t("settings.saving") : "Save data source settings"}
              </button>
            </div>

            <div className="rounded-md border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{"BaoStock"}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${dataSettings.baostock_supported ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                  {dataSettings.baostock_supported ? "Loader available" : "No project loader"}
                </span>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{dataSettings.baostock_message}</p>
                <p>{dataSettings.baostock_installed ? "Python package installed" : "Python package not installed"}</p>
              </div>
            </div>
          </div>
        </form>
      )}
    </SettingsPage>
  );
}
