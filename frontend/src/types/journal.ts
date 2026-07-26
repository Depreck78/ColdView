// Trade journal types (mirrors agent/src/api/journal_routes.py).

export interface Trade {
  id: string;
  date: string;          // YYYY-MM-DD
  symbol: string;
  side: "long" | "short";
  qty: number | null;
  entry: number | null;
  exit: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  notes: string;
  what_happened: string;
  why_happened: string;
  lesson: string;
  grade: string;         // A-F or ""
  ai_generated: boolean;
}

export interface JournalList {
  trades: Trade[];
}

/** Fields the client sends when creating/updating a trade (id optional). */
export type TradeInput = Partial<Trade>;
