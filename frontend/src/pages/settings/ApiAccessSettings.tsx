import i18n from "@/i18n";
import { useState, type FormEvent } from "react";
import { KeyRound, Save } from "lucide-react";
import { toast } from "sonner";
import { getApiAuthKey, setApiAuthKey } from "@/lib/apiAuth";
import { SettingsPage, fieldClass, labelClass } from "./shared";

export function ApiAccessSettings() {
  const [localApiKey, setLocalApiKey] = useState(() => getApiAuthKey());

  const submitLocalApiKey = (event: FormEvent) => {
    event.preventDefault();
    setApiAuthKey(localApiKey);
    toast.success("Local API key saved");
    window.location.reload();
  };

  return (
    <SettingsPage title="API access" description="For remote or private Web UI deployments. Localhost use can stay blank.">
      <form onSubmit={submitLocalApiKey} className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="mb-4 space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">{"Local API access"}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{"For remote or private Web UI deployments, enter the server API key once in this browser. Localhost use can stay blank."}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="grid gap-2">
            <span className={labelClass}>{"Server API key"}</span>
            <input
              type="password"
              value={localApiKey}
              onChange={(event) => setLocalApiKey(event.target.value)}
              className={fieldClass}
              placeholder={"Stored only in this browser. Leave blank to clear it."}
              autoComplete="current-password"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Save className="h-4 w-4" />
            {i18n.t("settings.save")}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{"Stored only in this browser. Leave blank to clear it."}</p>
      </form>
    </SettingsPage>
  );
}
