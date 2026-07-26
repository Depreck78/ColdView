// Types for the local Ollama runtime status + one-click install flow.
// Mirrors agent/src/api/ollama_routes.py.

export type OllamaCheckLevel = "ok" | "warn" | "error";
export type OllamaInstallState = "idle" | "running" | "done" | "error";

export interface OllamaPreflightCheck {
  id: string;
  label: string;
  level: OllamaCheckLevel;
  detail: string;
}

export interface OllamaModel {
  name: string;
  size: number | null;
}

export interface OllamaSystemInfo {
  system: string;
  arch: string;
  free_disk_gb: number | null;
  total_ram_gb: number | null;
}

export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version: string | null;
  baseUrl: string;
  models: OllamaModel[];
  system: OllamaSystemInfo;
  preflight: OllamaPreflightCheck[];
  installMethod: "brew" | "script" | null;
  canAutoInstall: boolean;
  defaultModels: string[];
  defaultModelNote: string;
  ready: boolean;
  installState: OllamaInstallState;
}

export interface OllamaInstallStatus {
  state: OllamaInstallState;
  step: string;
  log: string[];
  error: string | null;
  models: string[];
  startedAt: string | null;
  finishedAt: string | null;
}

export interface OllamaInstallStart {
  started: boolean;
  already?: boolean;
  state?: string;
  reason?: string;
  preflight?: OllamaPreflightCheck[];
}
