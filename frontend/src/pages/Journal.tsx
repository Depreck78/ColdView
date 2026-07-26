import { Fragment, useCallback, useEffect, useState } from "react";
import {
  NotebookPen, Plus, Sparkles, Trash2, ChevronDown, ChevronRight, Loader2, Info, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Trade, TradeInput } from "@/types/journal";

const AUTO_KEY = "cv-journal-autojournal";
const field = "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

function gradeClass(g: string): string {
  const c = (g || "").toUpperCase()[0];
  if (c === "A" || c === "B") return "text-success bg-success/10 border-success/25";
  if (c === "C") return "text-warning bg-warning/10 border-warning/25";
  if (c === "D" || c === "F") return "text-danger bg-danger/10 border-danger/25";
  return "text-muted-foreground bg-muted border-border";
}

const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));

export function Journal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [autoJournal, setAutoJournal] = useState(() => localStorage.getItem(AUTO_KEY) !== "0");

  const emptyForm: TradeInput = { date: new Date().toISOString().slice(0, 10), symbol: "", side: "long", qty: null, entry: null, exit: null, notes: "" };
  const [form, setForm] = useState<TradeInput>(emptyForm);

  useEffect(() => { localStorage.setItem(AUTO_KEY, autoJournal ? "1" : "0"); }, [autoJournal]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listTrades();
      setTrades(r.trades);
    } catch (e) {
      toast.error(`Could not load journal: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reflect = async (id: string) => {
    setReflecting(id);
    try {
      const updated = await api.reflectTrade(id);
      setTrades((ts) => ts.map((t) => (t.id === id ? updated : t)));
      setExpanded(id);
    } catch (e) {
      toast.error(`AI reflection failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setReflecting(null);
    }
  };

  const addTrade = async () => {
    if (!form.symbol?.trim()) { toast.error("Enter a symbol."); return; }
    try {
      const saved = await api.saveTrade(form);
      setTrades((ts) => [saved, ...ts]);
      setAdding(false);
      setForm(emptyForm);
      if (autoJournal) reflect(saved.id);
    } catch (e) {
      toast.error(`Could not save trade: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  const saveReflectionField = async (t: Trade, patch: Partial<Trade>) => {
    const updated = { ...t, ...patch };
    setTrades((ts) => ts.map((x) => (x.id === t.id ? updated : x)));
    try { await api.saveTrade(updated); } catch { /* ignore transient */ }
  };

  const remove = async (id: string) => {
    setTrades((ts) => ts.filter((t) => t.id !== id));
    try { await api.deleteTrade(id); } catch { /* ignore */ }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 text-primary">
            <NotebookPen className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Trade Journal</h1>
            <p className="text-sm text-muted-foreground">Every trade, graded and reflected on — by you or the AI.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={autoJournal} onChange={(e) => setAutoJournal(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Auto-journal with AI
          </label>
          <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90">
            {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {adding ? "Cancel" : "Add trade"}
          </button>
        </div>
      </div>

      {/* Add-trade form */}
      {adding && (
        <div className="cv-frost-card mt-5 rounded-xl p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <label className="grid gap-1"><span className="text-[11px] font-medium text-muted-foreground">Date</span>
              <input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value })} className={field} /></label>
            <label className="grid gap-1"><span className="text-[11px] font-medium text-muted-foreground">Symbol</span>
              <input value={form.symbol ?? ""} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} className={field} placeholder="AAPL" /></label>
            <label className="grid gap-1"><span className="text-[11px] font-medium text-muted-foreground">Side</span>
              <select value={form.side ?? "long"} onChange={(e) => setForm({ ...form, side: e.target.value as Trade["side"] })} className={field}>
                <option value="long">Long</option><option value="short">Short</option></select></label>
            <label className="grid gap-1"><span className="text-[11px] font-medium text-muted-foreground">Qty</span>
              <input type="number" value={form.qty ?? ""} onChange={(e) => setForm({ ...form, qty: num(e.target.value) })} className={field} /></label>
            <label className="grid gap-1"><span className="text-[11px] font-medium text-muted-foreground">Entry</span>
              <input type="number" value={form.entry ?? ""} onChange={(e) => setForm({ ...form, entry: num(e.target.value) })} className={field} /></label>
            <label className="grid gap-1"><span className="text-[11px] font-medium text-muted-foreground">Exit</span>
              <input type="number" value={form.exit ?? ""} onChange={(e) => setForm({ ...form, exit: num(e.target.value) })} className={field} /></label>
            <label className="col-span-2 grid gap-1 sm:col-span-4 lg:col-span-1"><span className="text-[11px] font-medium text-muted-foreground">Notes</span>
              <input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={field} placeholder="setup, why…" /></label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={addTrade} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90">Save trade</button>
            {autoJournal && <span className="text-xs text-muted-foreground">The AI will write the reflection after saving.</span>}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="mt-6 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2.5"></th>
              <th className="px-3 py-2.5 text-left font-medium">Date</th>
              <th className="px-3 py-2.5 text-left font-medium">Symbol</th>
              <th className="px-3 py-2.5 text-left font-medium">Side</th>
              <th className="px-3 py-2.5 text-right font-medium">Qty</th>
              <th className="px-3 py-2.5 text-right font-medium">Entry</th>
              <th className="px-3 py-2.5 text-right font-medium">Exit</th>
              <th className="px-3 py-2.5 text-right font-medium">P&L</th>
              <th className="px-3 py-2.5 text-center font-medium">Grade</th>
              <th className="px-3 py-2.5 text-right font-medium">Journal</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading…</td></tr>
            ) : trades.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                No trades yet. Click <span className="font-medium text-foreground">Add trade</span> — with Auto-journal on, the AI writes the reflection for each one.
              </td></tr>
            ) : (
              trades.map((t) => {
                const open = expanded === t.id;
                const pnlUp = (t.pnl ?? 0) > 0;
                const pnlDown = (t.pnl ?? 0) < 0;
                return (
                  <Fragment key={t.id}>
                    <tr className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-2 py-2.5">
                        <button onClick={() => setExpanded(open ? null : t.id)} className="text-muted-foreground hover:text-foreground">
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{t.date || "—"}</td>
                      <td className="px-3 py-2.5 font-mono font-medium">{t.symbol || "—"}</td>
                      <td className="px-3 py-2.5 capitalize">{t.side}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{t.qty ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{t.entry ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{t.exit ?? "—"}</td>
                      <td className={cn("px-3 py-2.5 text-right font-medium tabular-nums", pnlUp && "text-success", pnlDown && "text-danger")}>
                        {t.pnl == null ? "—" : `${t.pnl > 0 ? "+" : ""}${t.pnl}`}
                        {t.pnl_pct != null && <span className="ml-1 text-[11px] text-muted-foreground">({(t.pnl_pct * 100).toFixed(1)}%)</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {t.grade ? <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold", gradeClass(t.grade))}>{t.grade}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => reflect(t.id)}
                            disabled={reflecting === t.id}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-60"
                            title="Have the AI journal this trade"
                          >
                            {reflecting === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            {t.what_happened ? "Re-journal" : "AI journal"}
                          </button>
                          <button onClick={() => remove(t.id)} className="p-1 text-muted-foreground hover:text-danger" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b bg-muted/20">
                        <td></td>
                        <td colSpan={9} className="px-4 py-4">
                          {t.ai_generated && (
                            <div className="mb-3 inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                              <Sparkles className="h-3 w-3" /> AI-journaled
                            </div>
                          )}
                          <div className="grid gap-3 md:grid-cols-3">
                            {([["what_happened", "What happened"], ["why_happened", "Why it happened"], ["lesson", "Lesson / how to improve"]] as const).map(([key, label]) => (
                              <label key={key} className="grid gap-1">
                                <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
                                <textarea
                                  value={(t[key] as string) || ""}
                                  onChange={(e) => setTrades((ts) => ts.map((x) => (x.id === t.id ? { ...x, [key]: e.target.value } : x)))}
                                  onBlur={(e) => saveReflectionField(t, { [key]: e.target.value } as Partial<Trade>)}
                                  rows={4}
                                  className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                  placeholder={autoJournal ? "AI will fill this, or type your own…" : "Write your reflection…"}
                                />
                              </label>
                            ))}
                          </div>
                          {t.notes && <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium">Your notes:</span> {t.notes}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" /> Trades are stored locally in <code className="font-mono">~/.coldview/journal.json</code>. Reflections use your configured AI model.
      </p>
    </div>
  );
}
