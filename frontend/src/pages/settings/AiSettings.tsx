import i18n from "@/i18n";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Cloud, KeyRound, Laptop, Loader2, RefreshCw, Save, Server, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, isAuthRequiredError, type LLMProviderOption, type LLMSettings } from "@/lib/api";
import { SettingsPage, SettingsLoader, fieldClass, labelClass, hintClass } from "./shared";
import { OllamaSetup } from "./OllamaSetup";

interface LLMFormState {
  provider: string;
  model_name: string;
  base_url: string;
  temperature: number;
  timeout_seconds: number;
  max_retries: number;
  reasoning_effort: string;
}

type AiMode = "local" | "cloud";

function toForm(settings: LLMSettings): LLMFormState {
  return {
    provider: settings.provider,
    model_name: settings.model_name,
    base_url: settings.base_url,
    temperature: settings.temperature,
    timeout_seconds: settings.timeout_seconds,
    max_retries: settings.max_retries,
    reasoning_effort: settings.reasoning_effort || "",
  };
}

// Local = runs on your machine, needs no API key (e.g. Ollama). Everything that
// needs a key or OAuth is a hosted "cloud" provider.
function isLocalProvider(p?: LLMProviderOption): boolean {
  return !!p && !p.api_key_required && p.auth_type !== "oauth";
}

export function AiSettings() {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [form, setForm] = useState<LLMFormState | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<AiMode | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [cloudModels, setCloudModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.getLLMSettings()
      .then((value) => {
        if (!alive) return;
        setSettings(value);
        setForm(toForm(value));
      })
      .catch((error) => {
        if (!alive) return;
        const message = error instanceof Error ? error.message : "Unknown error";
        setLoadError(message);
        toast.error(isAuthRequiredError(error) ? message : `Failed to load AI settings: ${message}`);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const providers = settings?.providers ?? [];
  const selectedProvider = useMemo<LLMProviderOption | undefined>(
    () => providers.find((provider) => provider.name === form?.provider),
    [form?.provider, providers],
  );

  // Default the tab to whatever the saved provider is, once loaded.
  useEffect(() => {
    if (form && mode === null && providers.length) {
      setMode(isLocalProvider(providers.find((p) => p.name === form.provider)) ? "local" : "cloud");
    }
  }, [form, providers, mode]);

  const activeMode: AiMode = mode ?? (isLocalProvider(selectedProvider) ? "local" : "cloud");
  const modeProviders = providers.filter((p) => (activeMode === "local" ? isLocalProvider(p) : !isLocalProvider(p)));

  const onProviderChange = (name: string) => {
    const provider = providers.find((item) => item.name === name);
    if (!provider || !form) return;
    setForm({ ...form, provider: provider.name, model_name: provider.default_model, base_url: provider.default_base_url });
    setApiKey("");
    setClearApiKey(false);
    setCloudModels([]);
    setModelsError(null);
  };

  const fetchCloudModels = async () => {
    if (!form) return;
    setFetchingModels(true);
    setModelsError(null);
    try {
      const r = await api.listAiModels({ provider: form.provider, api_key: apiKey.trim() || undefined, base_url: form.base_url.trim() || undefined });
      if (r.ok) {
        setCloudModels(r.models);
        if (r.models.length === 0) setModelsError("No models returned for this key.");
        else if (!r.models.includes(form.model_name)) setForm({ ...form, model_name: r.models[0] });
      } else {
        setCloudModels([]);
        setModelsError(r.error || "Could not load models.");
      }
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : "Could not load models.");
    } finally {
      setFetchingModels(false);
    }
  };

  const switchMode = (next: AiMode) => {
    if (next === activeMode) return;
    setMode(next);
    const list = providers.filter((p) => (next === "local" ? isLocalProvider(p) : !isLocalProvider(p)));
    if (form && !list.some((p) => p.name === form.provider) && list[0]) {
      onProviderChange(list[0].name);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const updated = await api.updateLLMSettings({ ...form, api_key: apiKey.trim() || undefined, clear_api_key: clearApiKey });
      setSettings(updated);
      setForm(toForm(updated));
      setApiKey("");
      setClearApiKey(false);
      toast.success("AI settings saved");
    } catch (error) {
      toast.error(`Failed to save AI settings: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const description = "Pick the model that powers the agent — run one locally or connect a cloud provider with your API key.";

  if (loading || !form || !settings) {
    return (
      <SettingsPage title="AI Settings" description={description}>
        <SettingsLoader error={loadError} />
      </SettingsPage>
    );
  }

  // Status reflects the *selected* provider. "Configured" only applies when the
  // selected provider is the one currently saved with a key on the backend.
  const providerIsSaved = selectedProvider?.name === settings.provider;
  const keyStatus =
    providerIsSaved && settings.api_key_configured
      ? "Configured — leave blank to keep the current key"
      : selectedProvider?.auth_type === "oauth" && selectedProvider.login_command
        ? `This provider uses OAuth. Run: ${selectedProvider.login_command}`
        : selectedProvider?.api_key_required
          ? "Enter your API key"
          : "This provider does not require an API key.";
  const apiKeyDisabled = !selectedProvider?.api_key_required || clearApiKey;

  const TABS: { id: AiMode; label: string; icon: typeof Laptop; hint: string }[] = [
    { id: "local", label: "Local", icon: Laptop, hint: "Runs on your machine — no API key needed. Requires Ollama (or a compatible server) running." },
    { id: "cloud", label: "Cloud (API)", icon: Cloud, hint: "Use a hosted provider with your own API key." },
  ];
  const activeHint = TABS.find((tabItem) => tabItem.id === activeMode)?.hint;

  return (
    <SettingsPage title="AI Settings" description={description}>
      {/* Horizontal Local / Cloud menu */}
      <div className="space-y-2">
        <div className="inline-flex rounded-lg border bg-card p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => switchMode(id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition",
                activeMode === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        {activeHint ? <p className="text-xs text-muted-foreground">{activeHint}</p> : null}
      </div>

      {activeMode === "local" ? (
        <OllamaSetup
          onModels={setOllamaModels}
          onReady={(models) => {
            if (models[0]) setForm((f) => (f ? { ...f, model_name: models[0] } : f));
          }}
        />
      ) : null}

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">{"Connection"}</h2>
          </div>

          <div className="grid gap-4">
            {/* Provider */}
            <label className="grid gap-2">
              <span className={labelClass}>{i18n.t("settings.provider")}</span>
              <select value={form.provider} onChange={(event) => onProviderChange(event.target.value)} className={fieldClass}>
                {modeProviders.map((provider) => (
                  <option key={provider.name} value={provider.name}>{provider.label}</option>
                ))}
              </select>
              <span className={hintClass}>{"Changing providers updates the recommended endpoint."}</span>
            </label>

            {/* Cloud: the API key is the gate — enter it, then load models. */}
            {activeMode === "cloud" ? (
              <label className="grid gap-2">
                <span className={labelClass}>{selectedProvider?.auth_type === "oauth" ? "OAuth" : "API key"}</span>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(event) => { setApiKey(event.target.value); setCloudModels([]); setModelsError(null); }}
                      className={`${fieldClass} pl-9`}
                      placeholder={keyStatus}
                      autoComplete="current-password"
                      disabled={apiKeyDisabled}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={fetchCloudModels}
                    disabled={fetchingModels || (!!selectedProvider?.api_key_required && !apiKey.trim() && !settings.api_key_configured)}
                    className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Load the models this key can access"
                  >
                    {fetchingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {fetchingModels ? "Loading…" : "Load models"}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className={hintClass}>{cloudModels.length > 0 ? `${cloudModels.length} models loaded — choose one below.` : keyStatus}</span>
                  {selectedProvider?.api_key_required ? (
                    <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={clearApiKey}
                        onChange={(event) => {
                          setClearApiKey(event.target.checked);
                          if (event.target.checked) setApiKey("");
                        }}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      {"Clear saved API key"}
                    </label>
                  ) : null}
                </div>
                {modelsError ? <span className="text-xs text-danger">{modelsError}</span> : null}
              </label>
            ) : null}

            {/* Model — local: installed-Ollama selector; cloud: only after models load. */}
            {activeMode === "local" ? (
              <label className="grid gap-2">
                <span className={labelClass}>{"Model"}</span>
                {ollamaModels.length > 0 ? (
                  <select value={form.model_name} onChange={(event) => setForm({ ...form, model_name: event.target.value })} className={fieldClass} required>
                    {form.model_name && !ollamaModels.includes(form.model_name) ? (
                      <option value={form.model_name}>{form.model_name} (not installed)</option>
                    ) : null}
                    {ollamaModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input value={form.model_name} onChange={(event) => setForm({ ...form, model_name: event.target.value })} className={fieldClass} required placeholder="Install a model above" />
                )}
                <span className={hintClass}>{"Choose from the models installed in Ollama."}</span>
              </label>
            ) : cloudModels.length > 0 ? (
              <label className="grid gap-2">
                <span className={labelClass}>{"Model"}</span>
                <select value={form.model_name} onChange={(event) => setForm({ ...form, model_name: event.target.value })} className={fieldClass} required>
                  {cloudModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <span className={hintClass}>{`Pick from the ${cloudModels.length} models available to your key.`}</span>
              </label>
            ) : null}

            {/* Base URL */}
            <label className="grid gap-2">
              <span className={labelClass}>{i18n.t("settings.baseUrl")}</span>
              <input
                value={form.base_url}
                onChange={(event) => setForm({ ...form, base_url: event.target.value })}
                className={fieldClass}
                placeholder={selectedProvider?.default_base_url}
                list={selectedProvider?.base_url_options?.length ? "llm-base-url-options" : undefined}
                disabled={selectedProvider?.auth_type === "oauth"}
              />
              {selectedProvider?.base_url_options?.length ? (
                <datalist id="llm-base-url-options">
                  {selectedProvider.base_url_options.map((baseUrl) => (
                    <option key={baseUrl} value={baseUrl} />
                  ))}
                </datalist>
              ) : null}
            </label>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">{"Generation"}</h2>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className={labelClass}>{i18n.t("settings.temperature")}</span>
              <input type="number" min={0} max={2} step={0.1} value={form.temperature} onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} className={fieldClass} />
            </label>

            <label className="grid gap-2">
              <span className={labelClass}>{i18n.t("settings.timeoutSeconds")}</span>
              <input type="number" min={1} max={3600} step={1} value={form.timeout_seconds} onChange={(event) => setForm({ ...form, timeout_seconds: Number(event.target.value) })} className={fieldClass} />
            </label>

            <label className="grid gap-2">
              <span className={labelClass}>{"Max retries"}</span>
              <input type="number" min={0} max={20} step={1} value={form.max_retries} onChange={(event) => setForm({ ...form, max_retries: Number(event.target.value) })} className={fieldClass} />
            </label>

            <label className="grid gap-2">
              <span className={labelClass}>{i18n.t("settings.reasoningEffort")}</span>
              <select value={form.reasoning_effort} onChange={(event) => setForm({ ...form, reasoning_effort: event.target.value })} className={fieldClass}>
                <option value="">{"Off"}</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="max">max</option>
              </select>
              <span className={hintClass}>{"How hard the model thinks before answering. Higher is more thorough but slower; leave Off for fastest replies."}</span>
            </label>

            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{i18n.t("settings.saved")}: </span>
              <span className="break-all font-mono">{settings.env_path}</span>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? i18n.t("settings.saving") : i18n.t("settings.save")}
            </button>
          </div>
        </section>
      </form>
    </SettingsPage>
  );
}
