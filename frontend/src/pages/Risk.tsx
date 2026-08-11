import i18n from "@/i18n";
import { useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { api, type RiskXrayResponse } from "@/lib/api";

const WINDOWS = [90, 180, 365] as const;

function pct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

interface TileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "danger";
}

function Tile({ label, value, hint, tone = "default" }: TileProps) {
  const toneClass =
    tone === "danger"
      ? "text-danger"
      : tone === "warn"
        ? "text-amber-500"
        : "text-foreground";
  return (
    <div className="flex flex-col gap-1 border rounded-lg p-4">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function Risk() {
  const [codes, setCodes] = useState("AAPL,MSFT,SPY");
  const [weightsText, setWeightsText] = useState("");
  const [days, setDays] = useState<number>(365);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RiskXrayResponse | null>(null);
  const requestGeneration = useRef(0);

  const invalidateResult = () => {
    requestGeneration.current += 1;
    setResult(null);
    setError(null);
    setLoading(false);
  };

  // Parse the optional weights box: "AAPL.US=0.4, MSFT.US=0.4, SPY.US=0.2".
  // Returns null (equal weights) when blank, or throws a readable message.
  const parseWeights = (symbols: string[]): Record<string, number> | null => {
    const raw = weightsText.trim();
    if (!raw) return null;
    const out: Record<string, number> = {};
    for (const part of raw.split(",")) {
      const [sym, val] = part.split("=").map((s) => s.trim());
      if (!sym) continue;
      const w = Number(val);
      if (!Number.isFinite(w)) throw new Error(`Bad weight for "${sym}": "${val}"`);
      out[sym] = w;
    }
    const missing = symbols.filter((s) => !(s in out));
    if (missing.length) throw new Error(`Weights missing for: ${missing.join(", ")}`);
    return out;
  };

  const compute = async () => {
    const generation = ++requestGeneration.current;
    setError(null);
    setResult(null);
    const symbols = codes
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    let weights: Record<string, number> | null;
    try {
      weights = parseWeights(symbols);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid weights");
      return;
    }
    setLoading(true);
    try {
      const start = new Date();
      start.setDate(start.getDate() - days);
      const res = await api.postRiskXray({
        symbols,
        weights,
        start_date: start.toISOString().slice(0, 10),
      });
      if (requestGeneration.current === generation) setResult(res);
    } catch (e) {
      if (requestGeneration.current === generation) {
        setError(e instanceof Error ? e.message : "Failed to compute risk x-ray");
      }
    } finally {
      if (requestGeneration.current === generation) setLoading(false);
    }
  };

  const d = result?.data;
  // 99% VaR/ES on ~1 year of daily bars rests on only 2–3 tail observations —
  // flag low tail confidence rather than presenting it as precise.
  const thinTail = d ? d.inputs.return_observations < 500 : false;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{i18n.t("risk.title", "Portfolio Risk X-Ray")}</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-3">
        {i18n.t(
          "risk.subtitle",
          "Concentration, volatility, drawdown, and tail risk for a weighted basket. Descriptive risk context — not investment advice.",
        )}
      </p>

      {/* Controls */}
      <div className="flex flex-col gap-4 border rounded-lg p-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">{i18n.t("risk.symbols", "Symbols")}</label>
          <input
            type="text"
            value={codes}
            onChange={(e) => {
              invalidateResult();
              setCodes(e.target.value);
            }}
            placeholder="AAPL.US,MSFT.US,SPY.US"
            className="w-full px-3 py-2 rounded-md border bg-background text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {i18n.t(
              "risk.symbolsHint",
              "Comma-separated, loader-suffixed (e.g. AAPL.US, 600519.SH, BTC-USDT).",
            )}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">
            {i18n.t("risk.weights", "Weights (optional)")}
          </label>
          <input
            type="text"
            value={weightsText}
            onChange={(e) => {
              invalidateResult();
              setWeightsText(e.target.value);
            }}
            placeholder="AAPL.US=0.4, MSFT.US=0.4, SPY.US=0.2"
            className="w-full px-3 py-2 rounded-md border bg-background text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {i18n.t("risk.weightsHint", "Leave blank for equal weights. Renormalized to sum 1.")}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">{i18n.t("risk.windowDays", "Lookback")}</label>
          <div className="flex gap-1.5">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => {
                  invalidateResult();
                  setDays(w);
                }}
                className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                  days === w
                    ? "bg-primary text-primary-foreground"
                    : "border-muted-foreground/30 hover:border-primary"
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={compute}
          disabled={loading}
          className="self-start px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? i18n.t("risk.loading", "Computing…") : i18n.t("risk.compute", "Analyze risk")}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-danger border border-danger/30 rounded p-3 bg-danger/5">
          {error}
        </div>
      )}

      {/* Results */}
      {d && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Tile
              label={i18n.t("risk.annVol", "Annualized volatility")}
              value={pct(d.volatility.annualized_vol)}
              hint={`Daily ${pct(d.volatility.daily_vol)}`}
            />
            <Tile
              label={i18n.t("risk.maxDrawdown", "Max drawdown")}
              value={pct(d.drawdown.max_drawdown)}
              tone="danger"
              hint={
                d.drawdown.max_drawdown_trough
                  ? `Trough ${String(d.drawdown.max_drawdown_trough).slice(0, 10)}`
                  : undefined
              }
            />
            <Tile
              label={i18n.t("risk.concentration", "Concentration (HHI)")}
              value={num(d.concentration.hhi, 3)}
              hint={`Effective N ${num(d.concentration.effective_n, 1)} · Top-1 ${pct(
                d.concentration.top1_weight,
                0,
              )}`}
            />
            <Tile
              label={i18n.t("risk.var95", "VaR 95% (1d)")}
              value={pct(d.tail_risk.var_95)}
              hint={`ES ${pct(d.tail_risk.expected_shortfall_95)}`}
            />
            <Tile
              label={i18n.t("risk.var99", "VaR 99% (1d)")}
              value={pct(d.tail_risk.var_99)}
              tone={thinTail ? "warn" : "default"}
              hint={
                thinTail
                  ? i18n.t("risk.thinTail", "Thin tail — low confidence")
                  : `ES ${pct(d.tail_risk.expected_shortfall_99)}`
              }
            />
            <Tile
              label={i18n.t("risk.diversification", "Diversification ratio")}
              value={num(d.diversification.diversification_ratio, 2)}
              hint={`Beta (eq-wt) ${num(d.correlation.beta_to_equal_weight, 2)}`}
            />
            <Tile
              label={i18n.t("risk.sharpe", "Sharpe / Sortino")}
              value={`${num(d.risk_adjusted?.sharpe, 2)} / ${num(d.risk_adjusted?.sortino, 2)}`}
              hint={i18n.t("risk.riskAdjustedHint", "Annualized, rf 0%")}
            />
            <Tile
              label={i18n.t("risk.capmBeta", "CAPM beta")}
              value={num(d.capm?.beta, 2)}
              hint={
                d.capm
                  ? `vs ${result?.meta.benchmark ?? "—"} · R² ${num(d.capm.r_squared, 2)}`
                  : i18n.t("risk.noBenchmark", "no benchmark")
              }
            />
            <Tile
              label={i18n.t("risk.paramVar95", "Parametric VaR 95%")}
              value={pct(d.parametric_tail_risk?.var_95)}
              hint={`Historical ${pct(d.tail_risk.var_95)}`}
            />
          </div>

          {/* Risk contributors — which positions actually drive volatility */}
          {(d.risk_contribution?.contributions?.length ?? 0) > 1 && (
            <div className="flex flex-col gap-2 border rounded-lg p-4">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {i18n.t("risk.contributors", "Risk contributors")}
              </span>
              <p className="text-xs text-muted-foreground -mt-1">
                {i18n.t(
                  "risk.contributorsHint",
                  "Share of portfolio volatility each position drives — diverges from weight when a name is riskier or more correlated than the rest.",
                )}
              </p>
              <div className="flex flex-col gap-1.5 mt-1">
                {(d.risk_contribution?.contributions ?? []).map((row) => {
                  const share = row.pct ?? 0;
                  return (
                    <div key={row.symbol} className="flex items-center gap-3 text-sm">
                      <span className="w-24 shrink-0 font-medium truncate">{row.symbol}</span>
                      <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right tabular-nums">
                        {pct(row.pct, 0)}
                      </span>
                      <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground text-xs">
                        wt {pct(row.weight, 0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Data-quality footer */}
          <div className="text-xs text-muted-foreground border-t pt-3 flex flex-col gap-1">
            <span>
              {d.inputs.symbols.length} symbols · {d.inputs.aligned_days} aligned trading days ·{" "}
              {String(d.inputs.first_date).slice(0, 10)} → {String(d.inputs.last_date).slice(0, 10)}{" "}
              · via {result?.meta.source}
            </span>
            {d.tail_risk.method && <span>Tail method: {d.tail_risk.method}</span>}
            {result?.meta.unresolved_symbols?.length ? (
              <span className="text-amber-500">
                Unresolved: {result.meta.unresolved_symbols.join(", ")}
              </span>
            ) : null}
            {d.skipped.map((s) => (
              <span key={s.symbol} className="text-amber-500">
                Skipped {s.symbol}: {s.reason}
              </span>
            ))}
            {d.warnings.map((w) => (
              <span key={w} className="text-amber-500">
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
