import { useCallback, useEffect, useMemo, useState, type ElementType } from "react";
import {
  Sunrise, Newspaper, RefreshCw, TrendingUp, TrendingDown, Minus,
  ExternalLink, Plus, X, Sparkles, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { buildSampleMorning } from "@/lib/morningSample";
import type { MorningBrief, MorningMover, MorningNewsItem, MorningSummary, Sentiment } from "@/types/morning";

const WATCHLIST_KEY = "cv-watchlist";
const DEFAULT_WATCHLIST = ["AAPL.US", "MSFT.US", "NVDA.US", "TSLA.US", "00700.HK"];

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_WATCHLIST;
}

const SENTIMENT_STYLE: Record<Sentiment, string> = {
  positive: "text-success bg-success/10 border-success/20",
  negative: "text-danger bg-danger/10 border-danger/20",
  neutral: "text-muted-foreground bg-muted border-border",
};

const KIND_LABEL: Record<MorningNewsItem["kind"], string> = {
  news: "News",
  filing: "Filing",
  data: "Data",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function Morning() {
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist);
  const [data, setData] = useState<MorningBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [addValue, setAddValue] = useState("");
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [summary, setSummary] = useState<MorningSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [showAllNews, setShowAllNews] = useState(false);

  useEffect(() => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  const load = useCallback(async (list: string[]) => {
    setLoading(true);
    try {
      setData(await api.getMorningBrief(list));
    } catch {
      // Offline / backend down → graceful sample fallback (Silk_Road-style).
      setData(buildSampleMorning(list));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async (list: string[]) => {
    setSummaryLoading(true);
    setSummary(null);
    try {
      setSummary(await api.getMorningSummary(list));
    } catch {
      setSummary(null); // render falls back to the heuristic/sample brief
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const refresh = useCallback((list: string[]) => { load(list); loadSummary(list); }, [load, loadSummary]);

  useEffect(() => { refresh(watchlist); }, [refresh, watchlist]);

  const addSymbol = () => {
    const sym = addValue.trim().toUpperCase();
    if (!sym) return;
    if (!watchlist.includes(sym)) setWatchlist((w) => [...w, sym]);
    setAddValue("");
  };
  const removeSymbol = (sym: string) => {
    setWatchlist((w) => w.filter((s) => s !== sym));
    if (activeSymbol === sym) setActiveSymbol(null);
  };

  const news = useMemo(() => {
    const all = data?.news ?? [];
    return activeSymbol ? all.filter((n) => n.symbol === activeSymbol) : all;
  }, [data, activeSymbol]);

  const dateLabel = data ? formatDate(data.date) : formatDate(new Date().toISOString());

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 text-primary">
            <Sunrise className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Daily Brief</h1>
            <p className="text-sm text-muted-foreground">{dateLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.isSample && (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
              <Info className="h-3 w-3" /> Demo data
            </span>
          )}
          <button
            onClick={() => refresh(watchlist)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", (loading || summaryLoading) && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* AI Summary — market + (optional) portfolio */}
      <section className="cv-frost-card mt-6 rounded-2xl p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" /> Summary
          </h2>
          {summary ? <BriefBadge source={summary.source} /> : data?.isSample ? <BriefBadge source="sample" /> : data ? <BriefBadge source={data.briefSource} /> : null}
        </div>
        {summaryLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
          </div>
        ) : summary ? (
          <div className="space-y-4">
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Market &amp; opportunities</h3>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{summary.market}</p>
            </div>
            {summary.portfolio ? (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Your portfolio</h3>
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{summary.portfolio}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{data?.brief}</p>
        )}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: movers + watchlist */}
        <div className="space-y-6 lg:col-span-1">
          {/* Movers */}
          <section className="cv-frost-card rounded-2xl p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-primary" /> Movers
            </h2>
            {loading && !data ? (
              <SkeletonRows rows={5} />
            ) : data?.movers.length ? (
              <ul className="space-y-1">
                {data.movers.map((m) => <MoverRow key={m.symbol} mover={m} />)}
              </ul>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground/70">
                No live movers. Connect a broker in Settings for real-time quotes.
              </p>
            )}
          </section>

          {/* Watchlist */}
          <section className="cv-frost-card rounded-2xl p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Watchlist
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveSymbol(null)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  !activeSymbol ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                All
              </button>
              {watchlist.map((sym) => (
                <span
                  key={sym}
                  className={cn(
                    "group inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition",
                    activeSymbol === sym ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <button onClick={() => setActiveSymbol(activeSymbol === sym ? null : sym)}>{sym}</button>
                  <button onClick={() => removeSymbol(sym)} className="opacity-40 transition group-hover:opacity-100 hover:text-danger" title={`Remove ${sym}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addSymbol(); }}
                placeholder="Add symbol, e.g. AMZN.US"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none transition focus:border-primary/50"
              />
              <button
                onClick={addSymbol}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground/60">
              Suffix selects the market: <code className="font-mono">.US</code>, <code className="font-mono">.HK</code>, <code className="font-mono">.SH</code>/<code className="font-mono">.SZ</code>.
            </p>
          </section>
        </div>

        {/* Right column: news feed (news-for-research) */}
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Newspaper className="h-4 w-4 text-primary" />
              News {activeSymbol && <span className="text-primary">· {activeSymbol}</span>}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground/60">{news.length} items</span>
              {news.length > 4 && (
                <button onClick={() => setShowAllNews(true)} className="text-xs font-medium text-primary transition hover:underline">
                  View all
                </button>
              )}
            </div>
          </div>

          {loading && !data ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="cv-frost-card rounded-xl p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted/70" />
                </div>
              ))}
            </div>
          ) : news.length ? (
            <ul className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
              {news.map((item) => <NewsCard key={item.id} item={item} />)}
            </ul>
          ) : (
            <div className="cv-frost-card flex flex-col items-center justify-center rounded-xl px-4 py-12 text-center">
              <Newspaper className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No headlines for this filter yet.</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Add symbols or hit refresh to pull the latest news.</p>
            </div>
          )}
        </section>
      </div>

      {showAllNews && (
        <NewsModal news={news} activeSymbol={activeSymbol} onClose={() => setShowAllNews(false)} />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------

function NewsModal({ news, activeSymbol, onClose }: { news: MorningNewsItem[]; activeSymbol: string | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="cv-glass flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Newspaper className="h-4 w-4 text-primary" />
            All news {activeSymbol && <span className="text-primary">· {activeSymbol}</span>}
            <span className="text-xs font-normal text-muted-foreground/60">· {news.length}</span>
          </h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="flex-1 space-y-3 overflow-y-auto p-4">
          {news.map((item) => <NewsCard key={item.id} item={item} />)}
        </ul>
      </div>
    </div>
  );
}

function BriefBadge({ source }: { source: MorningBrief["briefSource"] }) {
  const map = {
    ai: { label: "AI", cls: "border-primary/30 bg-primary/10 text-primary", icon: <Sparkles className="h-3 w-3" /> },
    heuristic: { label: "Auto", cls: "border-border bg-muted text-muted-foreground", icon: <Info className="h-3 w-3" /> },
    sample: { label: "Sample", cls: "border-warning/30 bg-warning/10 text-warning", icon: <Info className="h-3 w-3" /> },
  } as const;
  const s = map[source];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", s.cls)}>
      {s.icon} {s.label}
    </span>
  );
}

function MoverRow({ mover }: { mover: MorningMover }) {
  const up = mover.direction === "up";
  const flat = mover.direction === "flat";
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat ? "text-muted-foreground" : up ? "text-success" : "text-danger";
  return (
    <li className="flex items-center justify-between rounded-lg px-2 py-1.5 transition hover:bg-muted/50">
      <div className="min-w-0">
        <span className="font-mono text-sm font-medium">{mover.symbol}</span>
        {mover.note && <p className="truncate text-[11px] text-muted-foreground">{mover.note}</p>}
      </div>
      <div className={cn("flex items-center gap-1 text-sm font-medium tabular-nums", color)}>
        <Icon className="h-3.5 w-3.5" />
        {mover.changePct > 0 ? "+" : ""}{mover.changePct.toFixed(1)}%
      </div>
    </li>
  );
}

function NewsCard({ item }: { item: MorningNewsItem }) {
  const external = item.url && item.url !== "#";
  const Wrapper: ElementType = external ? "a" : "div";
  return (
    <li>
      <Wrapper
        {...(external ? { href: item.url, target: "_blank", rel: "noopener noreferrer" } : {})}
        className={cn("cv-frost-card block rounded-xl p-4", external && "cursor-pointer")}
      >
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono font-medium text-foreground/70">{item.symbol}</span>
          <span>·</span>
          <span className="truncate">{item.source}</span>
          <span>·</span>
          <span className="shrink-0">{item.published}</span>
          <span className={cn("ms-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize", SENTIMENT_STYLE[item.sentiment])}>
            {item.sentiment}
          </span>
          <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {KIND_LABEL[item.kind]}
          </span>
        </div>
        <h3 className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold leading-snug">
          {item.title}
          {external && <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
        </h3>
        {item.snippet && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.snippet}</p>}
      </Wrapper>
    </li>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-4 w-12 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
