// Offline / demo fallback for the Morning Research page. Used when the backend
// `/morning` route is unreachable, so the page always renders something
// meaningful (matching Silk_Road's offline-friendly philosophy). Clearly
// flagged with `isSample: true` so the UI can badge it as demo data.

import type { MorningBrief } from "@/types/morning";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildSampleMorning(watchlist?: string[]): MorningBrief {
  const list = watchlist?.length ? watchlist : ["AAPL.US", "MSFT.US", "NVDA.US", "00700.HK", "TSLA.US"];
  const now = new Date();

  return {
    date: isoDate(now),
    generatedAt: now.toISOString(),
    greeting: greetingFor(now),
    briefSource: "sample",
    isSample: true,
    watchlist: list,
    brief:
      "Sample brief — connect the Coldview backend for live data. Futures point modestly higher into the open, led by megacap tech; semis are the session's momentum tell after a strong AI-capex read. Watch NVDA for follow-through and TSLA into its delivery update. Rates are steady, so single-name catalysts should dominate over macro today. Keep position sizing tied to your plan, not the tape.",
    movers: [
      { symbol: "NVDA.US", name: "NVIDIA", price: 178.42, changePct: 3.1, direction: "up", note: "AI-capex commentary" },
      { symbol: "AAPL.US", name: "Apple", price: 227.9, changePct: 1.2, direction: "up", note: "Services strength" },
      { symbol: "MSFT.US", name: "Microsoft", price: 471.3, changePct: 0.6, direction: "up" },
      { symbol: "TSLA.US", name: "Tesla", price: 249.1, changePct: -2.4, direction: "down", note: "Deliveries in focus" },
      { symbol: "00700.HK", name: "Tencent", price: 512.0, changePct: -0.8, direction: "down" },
    ],
    news: [
      {
        id: "sample-1",
        symbol: "NVDA.US",
        title: "Chipmakers rally as data-center demand guidance is raised",
        source: "Sample Wire",
        url: "#",
        published: "1h ago",
        snippet: "Suppliers cited stronger-than-expected AI infrastructure orders for the coming quarter, lifting the broader semiconductor complex.",
        sentiment: "positive",
        kind: "news",
      },
      {
        id: "sample-2",
        symbol: "AAPL.US",
        title: "Services segment expected to anchor upcoming results",
        source: "Sample Wire",
        url: "#",
        published: "2h ago",
        snippet: "Analysts point to high-margin services as the key swing factor into the print, with hardware seen as broadly in line.",
        sentiment: "positive",
        kind: "news",
      },
      {
        id: "sample-3",
        symbol: "TSLA.US",
        title: "Delivery estimates trimmed ahead of quarterly update",
        source: "Sample Wire",
        url: "#",
        published: "3h ago",
        snippet: "Several desks lowered near-term delivery forecasts, citing softer regional demand, though longer-term targets were left intact.",
        sentiment: "negative",
        kind: "news",
      },
      {
        id: "sample-4",
        symbol: "MSFT.US",
        title: "Cloud capacity expansion continues across new regions",
        source: "Sample Wire",
        url: "#",
        published: "4h ago",
        snippet: "New data-center announcements underscore sustained enterprise cloud investment heading into the second half.",
        sentiment: "neutral",
        kind: "news",
      },
      {
        id: "sample-5",
        symbol: "00700.HK",
        title: "Gaming approvals steady as regulatory tone stays constructive",
        source: "Sample Wire",
        url: "#",
        published: "5h ago",
        snippet: "The latest batch of title approvals suggests a stable operating backdrop for large China internet platforms.",
        sentiment: "neutral",
        kind: "news",
      },
    ],
  };
}

export function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
