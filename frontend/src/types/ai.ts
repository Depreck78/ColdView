// Result of listing a cloud provider's available models (agent/src/api/ai_routes.py).
export interface ProviderModelsResult {
  ok: boolean;
  models: string[];
  count?: number;
  error?: string;
}
