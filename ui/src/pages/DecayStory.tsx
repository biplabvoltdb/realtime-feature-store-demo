/**
 * Decay Story — a guided, executable narration of the rolling-window lifecycle for ONE customer:
 * seed history → prove the plateau → decay with zero events (window-sweep time machine) →
 * sudden reactivation through the real pipeline → the floor → the tail-out → evidence.
 *
 * Every step executes for real in live mode (DML/produce behind the write unlock); mock mode
 * walks the same script against fixtures so the story can be rehearsed without a cluster.
 * The window sweep is a faithful simulation: cutoff = TRUNCATE(DAY, NOW) − W, so shrinking W
 * by one day moves the cutoff exactly as one midnight would — over fixed data they are identical.
 */
import { useMemo, useRef, useState } from "react";
import { Badge, Button, Card, CopyButton, Notice, SectionLabel } from "@/components/ui/primitives";
import { ResultPanel } from "@/components/domain/ResultPanel";
import { callProcedure, produceEvents, runStatement, unlockOnServer, useExecOptions, useMode } from "@/data/api";
import { useCall, useLocalStorage } from "@/data/hooks";
import { useSettings } from "@/data/settings";
import { parseStatement } from "@/lib/sqlParse";
import { fmtDecimal, fmtInr, fmtTime } from "@/lib/format";
import type { ExecResponse, VoltTable } from "@/lib/volt";

// ------------------------------------------------------------------ helpers --
const DAY_MIN = 1440;
const cellOf = (t: VoltTable | undefined, name: string) => {
  if (!t || !t.rows[0]) return null;
  const i = t.columns.findIndex((c) => c.name === name);
  return i < 0 ? null : t.rows[0][i];
};
const warmSum = (r: ExecResponse | null): number | null => {
  const v = r?.ok ? cellOf(r.results[0], "TXN_AMOUNT_SUM") : null;
  return v == null ? null : Number(v);
};
const heroEvent = (customerId: string) => JSON.stringify({
  event_type: "TXN", customer_id: Number(customerId), txn_id: `decay_${Date.now()}`,
  created_at: new Date().toISOString(), amount: 2500.0, currency: "INR", txn_type: "CARD_PAY",
  payment_result: "SUCCESS", merchant_id: "M-00042", city: "Mumbai",
});

type SweepPoint = { w: number; sum: number | null; response: ExecResponse };
type StepId = "reset" | "seed" | "plateau" | "sweep" | "reactivate" | "noreset" | "tailout" | "evidence";
type StepDef = { id: StepId; n: number; title: string; meta: string; talking: string; expected: string; write: boolean };

const STEPS: StepDef[] = [
  { id: "reset", n: 1, title: "Clean slate", meta: "3 × DELETE · unlock", write: true,
    talking: "The story runs on one isolated customer id, so it never collides with loadgen traffic. We wipe only that customer's rows across the three customer tables.",
    expected: "Three DML results; the live window panel drops to zero rows." },
  { id: "seed", n: 2, title: "Seed 20 active days", meta: "20 × INSERT · unlock", write: true,
    talking: "History: ₹1,000/day for 20 'days' at T−39…T−20, written straight into CUSTOMER_DAILY. Seeded via SQL deliberately — the pipeline's 24-hour lateness bound would rightly dead-letter month-old events (that guard is itself part of the design).",
    expected: "20 daily bucket rows appear in the window panel below." },
  { id: "plateau", n: 3, title: "The plateau", meta: "GetRollingFeatures · 40 d", write: false,
    talking: "With a window wide enough to cover all 20 active days, the aggregate reads the full ₹20,000. This is the customer's value the day they go silent.",
    expected: "TXN_AMOUNT_SUM = ₹20,000 · DAYS = 20." },
  { id: "sweep", n: 4, title: "Decay with zero events — the time machine", meta: "8 reads · read-only", write: false,
    talking: "cutoff = TRUNCATE(DAY, NOW) − W. Shrinking W by one day moves the cutoff exactly as one midnight would — over fixed data the two are identical. So sweeping W = 40 → 20 days replays twenty midnights of pure silence in seconds. Watch the value step down ₹1,000 per 'day' with nothing executing in between: eviction is the WHERE clause, not a job.",
    expected: "₹20,000 → ₹0 staircase, exact at every step." },
  { id: "reactivate", n: 5, title: "Sudden reactivation — through the real pipeline", meta: "Kafka produce · unlock", write: true,
    talking: "One ₹2,500 CARD_PAY, produced onto the real source topic right now. It travels Kafka → VoltSP → RecordTxn: dedupe check, raw insert, today's bucket created, profile upserted with avg_ticket recomputed — one ACID commit. The 30-day window is re-read before and after so the jump is measured, not asserted.",
    expected: "The 30-day sum rises by exactly ₹2,500 within seconds of the event." },
  { id: "noreset", n: 6, title: "No reset — old data still decays", meta: "5 reads · read-only", write: false,
    talking: "The arrival did not reset, refresh, or retain the old history. Re-sweep the trailing edge: every value is exactly the silent-decay staircase plus ₹2,500, and at W = 20 days only the new event remains — the floor.",
    expected: "Same staircase, offset by +₹2,500, floor ₹2,500." },
  { id: "tailout", n: 7, title: "The tail-out", meta: "1 × INSERT + 5 reads · unlock", write: true,
    talking: "To sweep past the reactivation we seed its 'ten days later' position (today's real event can't be swept past — its future hasn't happened). W = 21 → 10: the ₹2,500 floor holds until the event's own 30 days elapse, then ₹0. Every event evicts itself exactly one window-length after its own event time.",
    expected: "₹3,500 → ₹2,500 floor → ₹0 at W = 10 d." },
  { id: "evidence", n: 8, title: "Evidence & close", meta: "GetProfile · GetRecentTxns", write: false,
    talking: "Nothing in this story was a scheduled job: the climb was commits, the decay was a WHERE clause moving with the clock, the jump was one ACID transaction, and the tail-out was the event's own timestamp aging past the cutoff. The profile shows avg_ticket materialized by that same commit.",
    expected: "Profile row with AVG_TICKET = 2500 after step 5; the raw event in GetRecentTxns." },
];

// ------------------------------------------------------------- sweep visuals --
function SweepChart({ points }: { points: SweepPoint[] }) {
  const known = points.filter((p) => p.sum != null);
  if (known.length < 2) return null;
  const w = 560, h = 150, padL = 46, padR = 14, padT = 12, padB = 24;
  const max = Math.max(...known.map((p) => p.sum!), 1);
  const x = (i: number) => padL + (i / (points.length - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);
  let d = "";
  points.forEach((p, i) => {
    if (p.sum == null) return;
    const px = x(i), py = y(p.sum);
    d += d === "" ? `M${px.toFixed(1)},${py.toFixed(1)}` : `H${px.toFixed(1)}V${py.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Aggregate value at each sweep window — the decay staircase">
      {[0, 0.5, 1].map((f) => <line key={f} x1={padL} x2={w - padR} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeWidth="1" />)}
      {[0, 0.5, 1].map((f) => <text key={`t${f}`} x={padL - 6} y={y(max * f) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">₹{fmtDecimal(max * f, 0)}</text>)}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" />
      {points.map((p, i) => p.sum == null ? null : <circle key={p.w} cx={x(i)} cy={y(p.sum)} r="3.4" fill="var(--accent)"><title>{`W=${p.w}d → ₹${fmtDecimal(p.sum)}`}</title></circle>)}
      {points.map((p, i) => <text key={`x${p.w}`} x={x(i)} y={h - 8} textAnchor="middle" fontSize="9" fill="var(--muted)">{p.w}d</text>)}
    </svg>
  );
}

function BucketStrip({ buckets, windowMinutes }: { buckets: VoltTable | undefined; windowMinutes: number }) {
  const now = Date.now();
  const dayFloor = now - (now % 86_400_000);
  const cutoff = dayFloor - windowMinutes * 60_000;
  const byDay = new Map<number, { sum: string; txn: number }>();
  if (buckets) {
    const di = buckets.columns.findIndex((c) => c.name === "DAY_START");
    const si = buckets.columns.findIndex((c) => c.name === "TXN_AMOUNT_SUM");
    const ti = buckets.columns.findIndex((c) => c.name === "TXN_COUNT");
    for (const r of buckets.rows) {
      const raw = r[di];
      const ms = typeof raw === "number" ? raw / 1000 : Date.parse(String(raw));
      if (!Number.isFinite(ms)) continue;
      byDay.set(ms - (ms % 86_400_000), { sum: String(r[si] ?? "0"), txn: Number(r[ti] ?? 0) });
    }
  }
  const days = Array.from({ length: 41 }, (_, i) => dayFloor - (40 - i) * 86_400_000);
  return (
    <div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {days.map((d) => {
          const b = byDay.get(d);
          const inWin = d > cutoff;
          const bg = b ? (inWin ? "var(--accent)" : "var(--border)") : "transparent";
          const title = `${new Date(d).toISOString().slice(0, 10)}${b ? ` · ${b.txn} txns · ₹${fmtDecimal(b.sum)}` : " · no bucket"}${inWin ? " · IN window" : " · evicted"}`;
          return <span key={d} title={title} style={{ width: 12, height: 20, borderRadius: 3, background: bg, border: `1px solid ${b ? bg : "var(--border)"}`, opacity: b && !inWin ? 0.55 : 1 }} />;
        })}
      </div>
      <div className="tiny muted" style={{ marginTop: 5 }}>T−40 … today · filled = CUSTOMER_DAILY bucket row (live) · bright = inside the {Math.round(windowMinutes / DAY_MIN)}-day window · faded = stored but evicted by the cutoff</div>
    </div>
  );
}

// --------------------------------------------------------------------- page --
export default function DecayStory() {
  const mode = useMode();
  const { settings, readOnly, unlockToken, unlockWrites, toast } = useSettings();
  const opts = useExecOptions(readOnly, settings.voltApiUrl);
  const writeOpts = useMemo(() => ({ ...opts, readOnly: false }), [opts]);
  const [simId, setSimId] = useLocalStorage("pfsc.decay.customer", "100000000777");
  const [active, setActive] = useState(1);
  const step = STEPS[active - 1];

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [response, setResponse] = useState<ExecResponse | null>(null);
  const [response2, setResponse2] = useState<ExecResponse | null>(null);
  const [sweep, setSweep] = useState<SweepPoint[] | null>(null);
  const [jump, setJump] = useState<{ before: number | null; after: number | null; produced?: string } | null>(null);
  const doneRef = useRef<Partial<Record<StepId, boolean>>>({});

  const watchWindow = 43_200; // 30 days
  const watch = useCall(() => callProcedure("GetRollingFeatures", [simId, watchWindow], opts), [simId]);
  const bucketsCall = useCall(() => callProcedure("GetDailyBuckets", [simId], opts), [simId]);
  const refreshPanels = () => { watch.reload(); bucketsCall.reload(); };

  const needsUnlock = step.write && readOnly;
  const doUnlock = async () => {
    if (mode === "mock") { unlockWrites(null); toast("Writes unlocked (mock)"); return; }
    const r = await unlockOnServer();
    if ("error" in r) { toast(`Unlock failed: ${r.error}`); return; }
    unlockWrites(r.token); toast("Writes unlocked for 15 minutes");
  };

  const runSql = (sql: string, o = writeOpts) => runStatement(parseStatement(sql), o);
  const runSweep = async (ws: number[]): Promise<SweepPoint[]> => {
    const out: SweepPoint[] = [];
    for (const w of ws) {
      setProgress(`querying W = ${w} d…`);
      const r = await callProcedure("GetRollingFeatures", [simId, w * DAY_MIN], opts);
      out.push({ w, sum: warmSum(r), response: r });
      setSweep([...out]);
    }
    return out;
  };

  const execute = async () => {
    setBusy(true); setProgress(""); setResponse(null); setResponse2(null);
    try {
      switch (step.id) {
        case "reset": {
          let last: ExecResponse | null = null;
          for (const t of ["TXN_RAW", "CUSTOMER_DAILY", "CUSTOMER_PROFILE"]) {
            setProgress(`DELETE FROM ${t}…`);
            last = await runSql(`DELETE FROM ${t} WHERE CUSTOMER_ID = ${simId};`);
            if (!last.ok) break;
          }
          setResponse(last); setSweep(null); setJump(null);
          break;
        }
        case "seed": {
          let last: ExecResponse | null = null;
          for (let d = 20; d <= 39; d++) {
            setProgress(`inserting day T−${d} (${d - 19}/20)…`);
            last = await runSql(`INSERT INTO CUSTOMER_DAILY (CUSTOMER_ID, DAY_START, ATTEMPT_COUNT, TXN_COUNT, TXN_AMOUNT_SUM) VALUES (${simId}, DATEADD(DAY, -${d}, TRUNCATE(DAY, NOW)), 2, 2, 1000.00);`);
            if (!last.ok) break;
          }
          setResponse(last);
          break;
        }
        case "plateau": setResponse(await callProcedure("GetRollingFeatures", [simId, 40 * DAY_MIN], opts)); break;
        case "sweep": setSweep(null); await runSweep([40, 35, 31, 30, 29, 25, 21, 20]); break;
        case "reactivate": {
          setProgress("reading the 30-day window (before)…");
          const before = warmSum(await callProcedure("GetRollingFeatures", [simId, watchWindow], opts));
          const value = heroEvent(simId);
          setJump({ before, after: null, produced: value });
          if (mode === "mock") { toast("Mock mode: no event was produced"); await new Promise((r) => setTimeout(r, 600)); }
          else {
            setProgress("producing the event onto novapay-txn-events…");
            const p = await produceEvents([{ value }], unlockToken);
            if (!p.ok) { setResponse({ ok: false, source: "live", results: [], timing: { bffRoundTripMs: 0 }, capturedAt: new Date().toISOString(), request: { produce: true }, response: null, statusstring: p.error }); break; }
            setProgress("waiting for Kafka → VoltSP → RecordTxn…");
            await new Promise((r) => setTimeout(r, 2500));
          }
          setProgress("reading the 30-day window (after)…");
          const afterResp = await callProcedure("GetRollingFeatures", [simId, watchWindow], opts);
          setResponse(afterResp);
          setJump({ before, after: warmSum(afterResp), produced: value });
          break;
        }
        case "noreset": setSweep(null); await runSweep([31, 30, 25, 21, 20]); break;
        case "tailout": {
          setProgress("seeding the reactivation's T−10 position…");
          const ins = await runSql(`INSERT INTO CUSTOMER_DAILY (CUSTOMER_ID, DAY_START, ATTEMPT_COUNT, TXN_COUNT, TXN_AMOUNT_SUM) VALUES (${simId}, DATEADD(DAY, -10, TRUNCATE(DAY, NOW)), 1, 1, 2500.00);`);
          if (!ins.ok) { setResponse(ins); break; }
          setSweep(null); await runSweep([21, 20, 15, 11, 10]);
          break;
        }
        case "evidence": {
          setResponse(await callProcedure("GetProfile", [simId], opts));
          setResponse2(await callProcedure("GetRecentTxns", [simId], opts));
          break;
        }
      }
      doneRef.current[step.id] = true;
      refreshPanels();
    } finally { setBusy(false); setProgress(""); }
  };

  const expectSweep = step.id === "sweep" || step.id === "noreset" || step.id === "tailout";
  const equivalences: Record<number, string> = { 40: "the plateau", 35: "+5 midnights", 31: "+9", 30: "+10", 29: "+11", 25: "+15", 21: "one active day left", 20: "full decay of the history", 15: "floor", 11: "floor", 10: "the event's own 30 days elapse" };

  return (
    <>
      <div className="toolbar">
        <div className="inline-row">
          <span style={{ fontSize: 12, fontWeight: 700 }}>Story customer</span>
          <input className="mono" style={{ width: 150, fontSize: 12, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 7, background: "transparent", color: "inherit" }} value={simId} onChange={(e) => setSimId(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Simulation customer id" />
          <span className="muted tiny">isolated id — never collides with loadgen traffic</span>
        </div>
        <div className="inline-row">
          {mode === "mock" && <Badge tone="mock">MOCK · narrative preview</Badge>}
          <Badge tone={readOnly ? "neutral" : "warn"}>{readOnly ? "READ-ONLY" : "WRITES UNLOCKED"}</Badge>
        </div>
      </div>

      <Card title={`Live 30-day window · customer ${simId}`} info="GetRollingFeatures(customer, 43200) plus GetDailyBuckets, re-read after every executed step. The strip is drawn from the real CUSTOMER_DAILY rows; bright cells are inside the current 30-day cutoff." actions={<><Button onClick={refreshPanels}>Refresh</Button></>} style={{ marginBottom: 14 }}>
        <div className="inline-row" style={{ gap: 24, alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontSize: 26, fontWeight: 750, fontVariantNumeric: "tabular-nums", color: "var(--accent)" }}>{watch.response?.ok ? fmtInr(cellOf(watch.response.results[0], "TXN_AMOUNT_SUM") as string | number | null) : watch.loading ? "…" : "—"}</span>
          <span className="muted tiny">TXN_AMOUNT_SUM · 30-day window · {watch.response ? `read ${fmtTime(Date.now())}` : ""}</span>
          {watch.error && <span className="tiny" style={{ color: "var(--red)" }}>{watch.error}</span>}
        </div>
        <BucketStrip buckets={bucketsCall.table} windowMinutes={watchWindow} />
      </Card>

      <div className="runbook-layout">
        <Card title="The story" info="Eight steps; each executes for real in live mode. Steps marked unlock perform writes (DML or Kafka produce) and need the 15-minute write unlock." flush>
          <div className="step-list" style={{ paddingTop: 4 }}>
            {STEPS.map((s) => (
              <button key={s.n} type="button" className={`step-row ${s.n === active ? "active" : ""}`} onClick={() => { setActive(s.n); setResponse(null); setResponse2(null); if (s.id !== "sweep" && s.id !== "noreset" && s.id !== "tailout") setSweep(null); }}>
                <div className="step-number">{s.n}</div>
                <div><div className="step-name">{s.title}</div><div className="step-meta">{s.meta}</div></div>
                <span className={`checkbox ${doneRef.current[s.id] ? "checked" : ""}`}>{doneRef.current[s.id] ? "✓" : ""}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card title={`Step ${step.n} · ${step.title}`} info={step.expected}
          actions={<Button variant="primary" onClick={execute} disabled={busy || needsUnlock}>{busy ? (progress || "Running…") : "Execute"}</Button>}
          footer={<><span>Expected: {step.expected}</span>{step.id === "reactivate" && jump?.produced && <CopyButton value={jump.produced} label="Copy event JSON" />}</>}>
          <div className="inline-row" style={{ marginBottom: 11 }}>
            {step.write ? <Badge tone="warn">WRITE STEP</Badge> : <Badge tone="good">READ-ONLY</Badge>}
            <span className="muted tiny">{step.meta}</span>
          </div>
          <div className="talking-point"><strong>Narration</strong><br />{step.talking}</div>
          {needsUnlock && <Notice tone="warn" style={{ marginTop: 10 }} action={<Button variant="small" onClick={doUnlock}>Unlock writes (15 min)</Button>}>This step {step.id === "reactivate" ? "produces a real Kafka event" : "runs DML"} and requires the write unlock.</Notice>}
          {mode === "mock" && step.id === "reactivate" && <Notice tone="mock" style={{ marginTop: 10 }}>Mock mode: the event is not produced; values come from fixtures. Switch to Live cluster in Settings for the real jump.</Notice>}

          {step.id === "reactivate" && jump && (
            <div className="snapshot-grid" style={{ marginTop: 12 }}>
              <div className="snapshot"><div className="muted tiny">BEFORE</div><div className="big">{jump.before == null ? "—" : fmtInr(jump.before)}</div></div>
              <div style={{ textAlign: "center", color: "var(--accent)", fontSize: 20 }}>→</div>
              <div className="snapshot follow"><div className="muted tiny">AFTER (via Kafka → VoltSP → RecordTxn)</div><div className="big">{jump.after == null ? "…" : fmtInr(jump.after)}</div>
                {jump.before != null && jump.after != null && <div className="muted tiny">Δ ₹{fmtDecimal(jump.after - jump.before)} {Math.abs(jump.after - jump.before - 2500) < 0.01 ? "· exactly the event — no reset of older data ✓" : ""}</div>}
              </div>
            </div>
          )}

          {expectSweep && sweep && sweep.length > 0 && (
            <div style={{ marginTop: 13 }}>
              <SweepChart points={sweep} />
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table className="mini-table" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead><tr>{["Sweep W", "≡ (time-machine reading)", "TXN_AMOUNT_SUM"].map((h) => <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</th>)}</tr></thead>
                  <tbody>{sweep.map((p) => <tr key={p.w} style={{ borderTop: "1px solid var(--border)" }}><td className="mono" style={{ padding: "4px 8px" }}>{p.w} d</td><td style={{ padding: "4px 8px", color: "var(--muted)" }}>{equivalences[p.w] ?? ""}</td><td className="mono" style={{ padding: "4px 8px", fontWeight: 600 }}>{p.sum == null ? "—" : fmtInr(p.sum)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}

          {!expectSweep && (
            <div style={{ marginTop: 13, border: "1px solid var(--border)", borderRadius: 10, minHeight: 160, display: "flex", flexDirection: "column" }}>
              <ResultPanel response={response} loading={busy && !expectSweep} emptyTitle="Click Execute to run this step" emptyDetail={step.expected} maxHeight={230} />
            </div>
          )}
          {step.id === "evidence" && response2 && (
            <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 10 }}>
              <SectionLabel style={{ padding: "8px 12px 0" }}>GetRecentTxns — the reactivation event's raw row</SectionLabel>
              <ResultPanel response={response2} loading={false} maxHeight={180} />
            </div>
          )}
          {busy && progress && <div className="muted tiny" style={{ marginTop: 8 }}>{progress}</div>}
        </Card>
      </div>
    </>
  );
}
