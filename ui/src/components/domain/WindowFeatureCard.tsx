import { useState } from "react";
import type { ExecResponse, VoltTable } from "@/lib/volt";
import { windowTier } from "@/lib/tier";
import { fmtDecimal, fmtInt, fmtDuration, fmtTime } from "@/lib/format";
import { Badge, Button, Notice, Skeleton } from "@/components/ui/primitives";
import { TraceLink, traceFromResponse } from "@/components/shell/Inspector";
import { T } from "@/lib/volt";

export function metricLines(t: VoltTable | undefined, names: string[]): { name: string; value: string }[] {
  if (!t || !t.rows[0]) return [];
  return names.map((n) => { const i = t.columns.findIndex((c) => c.name === n); if (i < 0) return null; const v = t.rows[0][i]; const code = t.columns[i].typeCode; return { name: n, value: v == null ? "NULL" : code === T.DECIMAL ? `₹${fmtDecimal(v)}` : typeof v === "number" ? fmtInt(v) : String(v) }; }).filter(Boolean) as { name: string; value: string }[];
}

export function WindowFeatureCard({ title, windowMinutes, response, loading, subject = "customer" }: { title: string; windowMinutes: number; response: ExecResponse | null; loading: boolean; subject?: "customer" | "merchant" }) {
  const wt = windowTier(windowMinutes);
  const agg = response?.ok ? response.results[0] : undefined;
  const distinct = response?.ok && response.results.length === 4 ? metricLines(response.results[1], ["AMOUNT_DISTINCT"]).concat(metricLines(response.results[2], ["DISTINCT_MERCHANTS"])) : [];
  const lines = subject === "merchant"
    ? metricLines(agg, ["BUCKETS", "ATTEMPT_COUNT", "TXN_COUNT", "AMOUNT_SUM", "SUCCESS_COUNT"])
    : wt.tier === "hot" ? [...metricLines(agg, ["RAW_EVENTS", "TXN_COUNT", "TXN_AMOUNT_SUM"]), ...distinct.slice(0, windowMinutes >= 1440 ? 1 : 1), ...metricLines(agg, windowMinutes >= 60 ? ["SUCCESS_COUNT"] : [])] : metricLines(agg, ["DAYS", "TXN_COUNT", "ATTEMPT_COUNT", "TXN_AMOUNT_SUM"]);
  const badge = subject === "merchant" ? <Badge tone="merchant">MERCHANT</Badge> : <Badge tone={wt.tier}>{wt.tier.toUpperCase()}</Badge>;
  const note = subject === "merchant" ? "MERCHANT_MINUTE · minute-floored cutoff" : wt.note;
  const color = subject === "merchant" ? "var(--orange)" : wt.tier === "hot" ? "var(--accent)" : "var(--purple)";
  return (
    <section className="card window-card">
      <div className="window-title"><span>{title}</span>{badge}</div>
      {loading && !response && <div style={{ display: "grid", gap: 8 }}><Skeleton h={11} /><Skeleton h={11} w="80%" /><Skeleton h={11} w="90%" /><Skeleton h={11} w="60%" /></div>}
      {response && !response.ok && <div className="tiny" style={{ color: "var(--red)" }}>{response.statusstring}</div>}
      {lines.map((l) => <div key={l.name} className="metric-line"><span className="mono">{l.name}</span><strong title={l.value === "NULL" ? "Database NULL" : undefined}>{l.value === "NULL" ? "—" : l.value}</strong></div>)}
      <div style={{ fontSize: 8, color, marginTop: 7, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>{note}</span>{response && <TraceLink trace={traceFromResponse(title, response)} label="trace" />}</div>
    </section>
  );
}

export type Snapshot = { at: number; raw: number | null; txn: number | null; sum: string | null; response: ExecResponse; ingestAt: number };
export function ShrinkProof({ capture, hasActivity, baseline, followUp, onReset, compact = false }: { capture: (kind: "baseline" | "follow") => Promise<void>; hasActivity: boolean; baseline: Snapshot | null; followUp: Snapshot | null; onReset: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState<"baseline" | "follow" | null>(null);
  const run = async (k: "baseline" | "follow") => { setBusy(k); try { await capture(k); } finally { setBusy(null); } };
  const shrank = baseline && followUp && followUp.raw != null && baseline.raw != null && followUp.raw < baseline.raw;
  const equal = baseline && followUp && followUp.raw === baseline.raw;
  return (
    <div>
      <div className="snapshot-grid">
        <div className="snapshot">
          <div className="muted tiny">BASELINE{baseline ? ` · ${fmtTime(baseline.at)}` : ""}</div>
          {baseline ? <><div className="big">{baseline.raw ?? "—"} <span className="kpi-unit">RAW_EVENTS</span></div><div className="muted tiny">TXN_COUNT {baseline.txn ?? "—"} · {baseline.sum ? `₹${fmtDecimal(baseline.sum)}` : "—"}</div></> : <div style={{ marginTop: 10 }}><Button variant="small" disabled={!hasActivity || busy !== null} onClick={() => run("baseline")}>{busy === "baseline" ? "Capturing…" : "Capture baseline"}</Button></div>}
        </div>
        <div style={{ textAlign: "center", color: "var(--accent)", fontSize: 20 }}>→</div>
        <div className="snapshot follow">
          <div className="muted tiny">FOLLOW-UP{followUp ? ` · ${fmtTime(followUp.at)}` : ""}</div>
          {followUp ? <><div className="big">{followUp.raw ?? "—"} <span className="kpi-unit">RAW_EVENTS</span></div><div className="muted tiny">TXN_COUNT {followUp.txn ?? "—"} · {followUp.sum ? `₹${fmtDecimal(followUp.sum)}` : "—"}</div></> : <div style={{ marginTop: 10 }}><Button variant="primary" disabled={!baseline || busy !== null} onClick={() => run("follow")}>{busy === "follow" ? "Capturing…" : "Capture follow-up"}</Button></div>}
        </div>
      </div>
      {!hasActivity && !baseline && <Notice tone="warn" style={{ marginTop: 10 }}>This subject has no events in the current 5-minute window. Pick a subject with recent activity; two identical empty snapshots prove nothing.</Notice>}
      {baseline && followUp && (
        <Notice tone={shrank ? "good" : equal ? "warn" : "info"} style={{ marginTop: 10 }}>
          {shrank ? <>Elapsed {fmtDuration(followUp.at - baseline.at)} · accepted-ingest delta for this subject 0 · totals shrank without a batch job.</> : equal ? <>Elapsed {fmtDuration(followUp.at - baseline.at)} · no change yet. Wait for an event to cross the moving cutoff and capture again.</> : <>Totals grew: new events were accepted for this subject between captures. Stop the load generator for a clean shrink proof.</>}
          <span className="spacer" />
          <button type="button" className="link" style={{ marginLeft: 12 }} onClick={onReset}>Reset</button>
        </Notice>
      )}
      {baseline && !followUp && !compact && <Notice tone="info" style={{ marginTop: 10 }}>Baseline captured. Wait at least a minute (mock: any delay) and capture the follow-up. Stop loadgen in the terminal for a clean comparison.</Notice>}
    </div>
  );
}
