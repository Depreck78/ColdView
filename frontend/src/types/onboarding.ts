// Types for onboarding helpers (mirrors agent/src/api/onboarding_routes.py).

export interface AlpacaAccountInfo {
  profile: string;
  is_paper: boolean;
  account_number?: string | null;
}

export interface AlpacaConnectReport {
  status: string;
  error?: string;
  account?: AlpacaAccountInfo;
  [key: string]: unknown;
}

export interface AlpacaConnectResult {
  ok: boolean;
  saved: boolean;
  report?: AlpacaConnectReport;
  error?: string | null;
}

export interface AlpacaConnectRequest {
  api_key: string;
  secret_key: string;
  profile: string;
  feed: string;
  save?: boolean;
}

export interface AlpacaStatus {
  configured: boolean;
  ok: boolean;
  report?: AlpacaConnectReport;
  error?: string | null;
  account?: AlpacaAccountInfo | null;
}
