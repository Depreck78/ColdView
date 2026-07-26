import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, ArrowLeft, Check, Cloud, Laptop, KeyRound, Loader2, Sparkles,
  Building2, CircleCheck, CircleX, ChevronRight, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, type LLMProviderOption, type LLMSettings } from "@/lib/api";
import type { AlpacaConnectResult } from "@/types/onboarding";
import { LogoMark } from "@/components/common/Logo";
import { OllamaSetup } from "@/pages/settings/OllamaSetup";

const fieldClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
const labelClass = "text-sm font-medium";

const STEPS = ["Welcome", "AI model", "Broker", "Done"];

function isLocalProvider(p?: LLMProviderOption): boolean {
  return !!p && !p.api_key_required && p.auth_type !== "oauth";
}

export function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // ---- AI step state ----
  const [llm, setLlm] = useState<LLMSettings | null>(null);
  const [aiMode, setAiMode] = useState<"local" | "cloud">("local");
  const [aiForm, setAiForm] = useState({ provider: "ollama", model_name: "", base_url: "http://localhost:11434", api_key: "" });
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [cloudModels, setCloudModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => {
    api.getLLMSettings()
      .then((s) => {
        setLlm(s);
        const local = isLocalProvider(s.providers.find((p) => p.name === s.provider));
        setAiMode(local ? "local" : "cloud");
        setAiForm({ provider: s.provider, model_name: s.model_name, base_url: s.base_url, api_key: "" });
      })
      .catch(() => { /* backend may be down; user can still browse steps */ });
  }, []);

  const providers = llm?.providers ?? [];
  const selectedProvider = useMemo(() => providers.find((p) => p.name === aiForm.provider), [providers, aiForm.provider]);
  const modeProviders = providers.filter((p) => (aiMode === "local" ? isLocalProvider(p) : !isLocalProvider(p)));

  const switchAiMode = (next: "local" | "cloud") => {
    if (next === aiMode) return;
    setAiMode(next);
    setCloudModels([]);
    setModelsError(null);
    const list = providers.filter((p) => (next === "local" ? isLocalProvider(p) : !isLocalProvider(p)));
    if (!list.some((p) => p.name === aiForm.provider) && list[0]) {
      setAiForm((f) => ({ ...f, provider: list[0].name, model_name: list[0].default_model, base_url: list[0].default_base_url, api_key: "" }));
    }
  };

  const onProviderChange = (name: string) => {
    const p = providers.find((x) => x.name === name);
    if (!p) return;
    setAiForm((f) => ({ ...f, provider: p.name, model_name: p.default_model, base_url: p.default_base_url, api_key: "" }));
    setCloudModels([]);
    setModelsError(null);
  };

  const fetchCloudModels = async () => {
    setFetchingModels(true);
    setModelsError(null);
    try {
      const r = await api.listAiModels({ provider: aiForm.provider, api_key: aiForm.api_key.trim() || undefined, base_url: aiForm.base_url.trim() || undefined });
      if (r.ok) {
        setCloudModels(r.models);
        if (r.models.length === 0) setModelsError("No models returned for this key.");
        else if (!r.models.includes(aiForm.model_name)) setAiForm((f) => ({ ...f, model_name: r.models[0] }));
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

  const saveAiAndContinue = async () => {
    if (!aiForm.model_name.trim()) {
      toast.error("Choose a model first.");
      return;
    }
    setSavingAi(true);
    try {
      await api.updateLLMSettings({
        provider: aiForm.provider,
        model_name: aiForm.model_name.trim(),
        base_url: aiForm.base_url.trim(),
        temperature: llm?.temperature ?? 0,
        timeout_seconds: llm?.timeout_seconds ?? 120,
        max_retries: llm?.max_retries ?? 2,
        reasoning_effort: llm?.reasoning_effort ?? "",
        api_key: aiForm.api_key.trim() || undefined,
      });
      toast.success("AI model configured");
      setStep(2);
    } catch (e) {
      toast.error(`Could not save: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setSavingAi(false);
    }
  };

  // ---- Broker step state ----
  const [broker, setBroker] = useState({ api_key: "", secret_key: "", profile: "paper", feed: "iex" });
  const [connecting, setConnecting] = useState(false);
  const [brokerResult, setBrokerResult] = useState<AlpacaConnectResult | null>(null);

  const connectBroker = async () => {
    setConnecting(true);
    setBrokerResult(null);
    try {
      const r = await api.connectAlpaca({ ...broker, save: true });
      setBrokerResult(r);
      if (r.ok) toast.success("Alpaca connected");
      else toast.error(r.error || "Could not connect — credentials saved, check them.");
    } catch (e) {
      toast.error(`Connection failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setConnecting(false);
    }
  };

  const finish = () => {
    localStorage.setItem("cv-onboarded", "1");
    navigate("/", { replace: true });
  };

  const cloudKeyRequired = aiMode === "cloud" && !!selectedProvider?.api_key_required;

  return (
    <div className="relative min-h-screen overflow-y-auto bg-background">
      {/* Icy backdrop */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 h-[380px] overflow-hidden">
        <div className="absolute left-1/2 top-[-160px] h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]" />
        <div className="absolute left-1/3 top-[-120px] h-[300px] w-[420px] -translate-x-1/2 rounded-full bg-accent/10 blur-[110px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
        {/* Header + stepper */}
        <div className="mb-8 flex items-center justify-between">
          <span className="flex items-center gap-2 font-bold tracking-tight">
            <LogoMark className="h-7 w-7" />
            <span>Cold<span className="cv-brand-gradient">view</span></span>
          </span>
          <button onClick={finish} className="text-xs text-muted-foreground transition hover:text-foreground">Skip setup</button>
        </div>

        <div className="mb-8 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <span className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition",
                i < step ? "bg-primary text-primary-foreground" : i === step ? "border-2 border-primary text-primary" : "border border-border text-muted-foreground",
              )}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("hidden text-xs sm:block", i === step ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
              {i < STEPS.length - 1 && <span className={cn("h-px flex-1", i < step ? "bg-primary" : "bg-border")} />}
            </div>
          ))}
        </div>

        <div className="flex-1">
          {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Choose your AI model</h1>
                <p className="mt-1 text-sm text-muted-foreground">Coldview's agent needs a model. Run one locally (free, private) or connect a cloud provider.</p>
              </div>

              {/* Local / Cloud */}
              <div className="inline-flex rounded-lg border bg-card p-1">
                {([["local", "Local", Laptop], ["cloud", "Cloud (API)", Cloud]] as const).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => switchAiMode(id)}
                    className={cn("flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition", aiMode === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>

              {aiMode === "local" ? (
                <div className="space-y-4">
                  <OllamaSetup
                    onModels={setOllamaModels}
                    onReady={(models) => { if (models[0]) setAiForm((f) => ({ ...f, model_name: models[0] })); }}
                  />
                  <label className="grid gap-2">
                    <span className={labelClass}>Model</span>
                    {ollamaModels.length > 0 ? (
                      <select value={aiForm.model_name} onChange={(e) => setAiForm({ ...aiForm, model_name: e.target.value })} className={fieldClass}>
                        {aiForm.model_name && !ollamaModels.includes(aiForm.model_name) ? <option value={aiForm.model_name}>{aiForm.model_name}</option> : null}
                        {ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <input value={aiForm.model_name} onChange={(e) => setAiForm({ ...aiForm, model_name: e.target.value })} className={fieldClass} placeholder="Install a model above, or type one" />
                    )}
                  </label>
                </div>
              ) : (
                <div className="grid gap-4 rounded-lg border bg-card p-5">
                  <label className="grid gap-2">
                    <span className={labelClass}>Provider</span>
                    <select value={aiForm.provider} onChange={(e) => onProviderChange(e.target.value)} className={fieldClass}>
                      {modeProviders.map((p) => <option key={p.name} value={p.name}>{p.label}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className={labelClass}>API key {cloudKeyRequired ? "" : "(not required)"}</span>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                          type="password"
                          value={aiForm.api_key}
                          onChange={(e) => { setAiForm({ ...aiForm, api_key: e.target.value }); setCloudModels([]); setModelsError(null); }}
                          className={`${fieldClass} pl-9`}
                          placeholder={cloudKeyRequired ? "Paste your API key" : "This provider needs no key"}
                          disabled={!cloudKeyRequired}
                          autoComplete="off"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={fetchCloudModels}
                        disabled={fetchingModels || (cloudKeyRequired && !aiForm.api_key.trim())}
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {fetchingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {fetchingModels ? "Loading…" : "Load models"}
                      </button>
                    </div>
                    {modelsError ? (
                      <span className="text-xs text-danger">{modelsError}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {cloudModels.length > 0 ? `${cloudModels.length} models loaded — choose one below.` : "Paste your key, then load the models it can access."}
                      </span>
                    )}
                  </label>
                  {cloudModels.length > 0 ? (
                    <label className="grid gap-2">
                      <span className={labelClass}>Model</span>
                      <select value={aiForm.model_name} onChange={(e) => setAiForm({ ...aiForm, model_name: e.target.value })} className={fieldClass}>
                        {cloudModels.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                  ) : null}
                </div>
              )}

              <StepNav
                onBack={() => setStep(0)}
                onNext={saveAiAndContinue}
                nextLabel={savingAi ? "Saving…" : "Continue"}
                nextDisabled={savingAi || (aiMode === "cloud" ? cloudModels.length === 0 : !aiForm.model_name.trim())}
                busy={savingAi}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Connect your broker</h1>
                <p className="mt-1 text-sm text-muted-foreground">Optional — connect Alpaca so Coldview can read your account and trades. You can add or change this later in Settings.</p>
              </div>

              <div className="grid gap-4 rounded-lg border bg-card p-5">
                <div className="flex items-center gap-2 text-sm font-medium"><Building2 className="h-4 w-4 text-primary" /> Alpaca</div>
                <label className="grid gap-2">
                  <span className={labelClass}>API key ID</span>
                  <input value={broker.api_key} onChange={(e) => setBroker({ ...broker, api_key: e.target.value })} className={fieldClass} placeholder="PK…" autoComplete="off" />
                </label>
                <label className="grid gap-2">
                  <span className={labelClass}>API secret key</span>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input type="password" value={broker.secret_key} onChange={(e) => setBroker({ ...broker, secret_key: e.target.value })} className={`${fieldClass} pl-9`} placeholder="Your Alpaca secret" autoComplete="off" />
                  </div>
                </label>
                <div className="grid grid-cols-2 gap-4">
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
                  onClick={connectBroker}
                  disabled={connecting || !broker.api_key.trim() || !broker.secret_key.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {connecting ? "Connecting…" : "Connect & test"}
                </button>

                {brokerResult && (
                  <div className={cn("flex items-start gap-2 rounded-md border p-3 text-sm", brokerResult.ok ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5")}>
                    {brokerResult.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                    <span>
                      {brokerResult.ok
                        ? `Connected to Alpaca ${brokerResult.report?.account?.is_paper ? "paper" : "live"} account${brokerResult.report?.account?.account_number ? ` (${brokerResult.report.account.account_number})` : ""}.`
                        : (brokerResult.error || "Could not verify. Credentials were saved — double-check them.")}
                    </span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Credentials are stored locally in <code className="font-mono">~/.coldview/alpaca.json</code> (owner-only). Other brokers can be added later.</p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={() => setStep(3)} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">Skip for now</button>
                  <button onClick={() => setStep(3)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90">
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && <DoneStep onFinish={finish} brokerConnected={!!brokerResult?.ok} model={aiForm.model_name} mode={aiMode} />}
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <LogoMark className="cv-float h-16 w-16" />
      <span className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        <Sparkles className="h-3 w-3" /> Welcome
      </span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Let's set up Coldview</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        Two quick steps and you're ready: pick the AI model that powers your agent, then optionally connect your broker. Takes about a minute.
      </p>
      <button onClick={onNext} className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5">
        Get started <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function DoneStep({ onFinish, brokerConnected, model, mode }: { onFinish: () => void; brokerConnected: boolean; model: string; mode: string }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10 text-success">
        <CircleCheck className="h-9 w-9" />
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">You're all set</h1>
      <p className="mt-3 max-w-md text-muted-foreground">Coldview is ready to use. You can change any of this anytime in Settings.</p>

      <ul className="mt-6 w-full max-w-sm space-y-2 text-left text-sm">
        <li className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
          <CircleCheck className="h-4 w-4 text-success" /> AI model: <span className="font-mono">{model || "configured"}</span> <span className="text-muted-foreground">({mode})</span>
        </li>
        <li className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
          {brokerConnected ? <CircleCheck className="h-4 w-4 text-success" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          Broker: {brokerConnected ? "Alpaca connected" : <span className="text-muted-foreground">skipped — add later in Settings</span>}
        </li>
      </ul>

      <button onClick={onFinish} className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5">
        Open Coldview <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function StepNav({ onBack, onNext, nextLabel, nextDisabled, busy }: { onBack: () => void; onNext: () => void; nextLabel: string; nextDisabled?: boolean; busy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {nextLabel} {!busy && <ArrowRight className="h-4 w-4" />}
      </button>
    </div>
  );
}
