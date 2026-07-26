// Types for the Morning Research workflow (customer-retention layer): a daily
// briefing that combines a watchlist news digest, market movers, and an
// AI/heuristic summary. Mirrors the backend `/morning` route payload.

export type Sentiment = "positive" | "neutral" | "negative";
export type NewsKind = "news" | "filing" | "data";

export interface MorningNewsItem {
  id: string;
  symbol: string;
  title: string;
  source: string;
  url: string;
  /** Human-readable publish time, e.g. "2026-07-24 13:05:00" or "2h ago". */
  published: string;
  snippet: string;
  sentiment: Sentiment;
  kind: NewsKind;
}

export interface MorningMover {
  symbol: string;
  name?: string;
  price?: number;
  changePct: number;
  direction: "up" | "down" | "flat";
  note?: string;
}

/** How the daily brief text was produced. */
export type BriefSource = "ai" | "heuristic" | "sample";

/** AI-written summary: market section + optional portfolio section. */
export interface MorningSummary {
  market: string;
  portfolio: string | null;
  source: "ai" | "heuristic";
}

export interface MorningBrief {
  /** ISO date (YYYY-MM-DD) the brief covers. */
  date: string;
  /** ISO timestamp the payload was generated. */
  generatedAt: string;
  greeting: string;
  /** Multi-sentence summary of the session's setup. */
  brief: string;
  briefSource: BriefSource;
  watchlist: string[];
  movers: MorningMover[];
  news: MorningNewsItem[];
  /** True when this payload is the offline sample fallback, not live data. */
  isSample?: boolean;
}
