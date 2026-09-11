import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, Badge, Notice, Button, LinkButton, CopyButton, SectionLabel } from "@/components/ui/primitives";
import { CodeViewer } from "@/components/ui/CodeViewer";
import { ResultPanel } from "@/components/domain/ResultPanel";
import { ShrinkProof, type Snapshot } from "@/components/domain/WindowFeatureCard";
import { Drawer } from "@/components/ui/Overlay";
import { runStatement, callProcedure, useExecOptions } from "@/data/api";
import { useSettings } from "@/data/settings";
import { useTelemetry, useLatest } from "@/data/telemetry";
import { useHealth } from "@/data/api";
import { useCall } from "@/data/hooks";
import { DDL_MODEL } from "@/repo/ddlModel";
import { parseSnippets, REPO } from "@/repo";
import { parseStatement } from "@/lib/sqlParse";
import { useInspector, traceFromResponse } from "@/components/shell/Inspector";
import { fmtTime } from "@/lib/format";
import type { ExecResponse } from "@/lib/volt";

type Step = { n: number; title: string; meta: string; talking: string; expected: string; statement: (c: string) => string; source: string; tier?: "hot" | "warm" | "life" | "merchant" | "hygiene"; link?: string; manual?: string[] };
const STEPS: Step[] = [
  { n: 1, title: "Pick a busy customer", meta: "Query 1 · ad-hoc", talking: "Discovery runs against the warm tier: a multi-partition GROUP BY over CUSTOMER_DAILY. The cutoff is day-bucket aligned, so call it 'busiest by daily buckets', not an exact rolling 24 hours.", expected: "Ten customers ordered by spend. Click one to carry it into steps 2–5, 8 and 9.", statement: () => "", source: "queries.sql · query 1", tier: "warm", link: "/sql?snippet=" },
  { n: 2, title: "Hot-tier read", meta: "GetRollingFeatures · 1440", talking: "≤ 10080 minutes takes the hot branch: filtered SUM/COUNT/MIN/MAX via CASE, exact COUNT DISTINCT on amount and merchant, straight from TXN_RAW. Four result sets; the last is the profile row.", expected: "Aggregate, distinct amount, distinct merchants, profile. Cutoff floored to the minute.", statement: (c) => `exec GetRollingFeatures ${c} 1440;`, source: "GetRollingFeatures.java · hotAgg", tier: "hot", link: "/procedures?name=GetRollingFeatures" },
  { n: 3, title: "Rolling-window shrink proof", meta: "GetRollingFeatures · 5", talking: "A rolling feature shrinks as old events cross the moving cutoff. No batch job is needed; this is distinct from physical TTL deletion.", expected: "Baseline RAW_EVENTS > follow-up RAW_EVENTS after a few minutes with loadgen stopped.", statement: (c) => `exec GetRollingFeatures ${c} 5;`, source: "queries.sql · query 3 · GetRollingFeatures.java", tier: "hot", manual: ["Stop loadgen in terminal", "Wait for a recent event to cross the cutoff"] },
  { n: 4, title: "Warm-tier read", meta: "GetRollingFeatures · 43200", talking: "> 10080 minutes sums CUSTOMER_DAILY. Leading edge is live (today's bucket updates per event); trailing edge advances at day granularity. For a 30-day SUM the trailing day holds ~3% of the value.", expected: "Two result sets: DAYS-based aggregate and the profile. No distinct counts.", statement: (c) => `exec GetRollingFeatures ${c} 43200;`, source: "GetRollingFeatures.java · warmAgg", tier: "warm", link: "/procedures?name=GetRollingFeatures" },
  { n: 5, title: "Materialized profile", meta: "GetProfile", talking: "AVG_TICKET is recomputed inside every RecordTxn transaction (sum_24h ÷ count_24h) — not a query-time expression. LAST_CITY / LAST_TXN_AT are last accepted writes.", expected: "One row with lifetime totals, 24h inputs and the materialized AVG_TICKET.", statement: (c) => `exec GetProfile ${c};`, source: "ddl.sql · GetProfile · RecordTxn.java", tier: "life", link: "/procedures?name=GetProfile" },
  { n: 6, title: "Merchant features", meta: "GetMerchantFeatures · 60", talking: "Second subject key. Hot merchants see ~50 events/min, so minute buckets compress ~50:1 — the one place minute buckets earn their RAM.", expected: "BUCKETS ≈ 60 for a hot merchant; minute-exact sums.", statement: () => "exec GetMerchantFeatures 'M-00042' 60;", source: "GetMerchantFeatures.java", tier: "merchant", link: "/explorer?subject=merchant&id=M-00042" },
  { n: 7, title: "Ingest correctness counters", meta: "GetCounters", talking: "Unparseable created_at, missing subject key and beyond-lateness events are dead-lettered or dropped and counted — never silently.", expected: "Rows dlq_missing_subject_key, dlq_unparseable_created_at, dropped_late with monotonic values.", statement: () => "exec GetCounters;", source: "ddl.sql · GetCounters · TxnFeaturePipeline.java", tier: "hygiene", link: "/hygiene" },
  { n: 8, title: "Retry / dedupe proof", meta: "Ad-hoc query 8", talking: "Retried payments carry the same txn_id. RecordTxn dedupes on (CUSTOMER_ID, TXN_ID): ATTEMPT_COUNT grows, the aggregate counts the payment once.", expected: "Rows with ATTEMPT_COUNT > 1 — each is a single raw row.", statement: () => "", source: "queries.sql · query 8 · RecordTxn.java", tier: "hot", link: "/hygiene" },
  { n: 9, title: "Daily buckets", meta: "GetDailyBuckets", talking: "The storage model behind long windows: one CUSTOMER_DAILY row per (customer, day), 51 physical columns including the 38 width fillers that keep the sizing measurement honest.", expected: "Up to 30 daily rows, newest first.", statement: (c) => `exec GetDailyBuckets ${c};`, source: "ddl.sql · GetDailyBuckets", tier: "warm", link: "/explorer" },
  { n: 10, title: "Sizing inputs", meta: "@Statistics TABLE 0", talking: "Rows and memory per table across hosts and partitions feed the bytes/subject formula from README §8.", expected: "One row per table per partition; the Sizing page aggregates them exactly like the README awk command.", statement: () => "exec @Statistics TABLE 0;", source: "README.md · §8", link: "/sizing" },
];

export default function Runbook() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const active = Math.min(10, Math.max(1, Number(params.get("step") ?? 3)));
  const step = STEPS[active - 1];
  const { settings, readOnly, selectedCustomer, setSelectedCustomer, doneSteps, setStepDone, resetSteps } = useSettings();
  const opts = useExecOptions(readOnly, settings.voltApiUrl);
  const { samples } = useTelemetry();
  const { open } = useInspector();
  const snippets = useMemo(() => parseSnippets(), []);
  const statement = step.n === 1 ? snippets[0].statement : step.n === 8 ? snippets.find((s) => s.number === 8)!.statement : step.statement(selectedCustomer);
  const [response, setResponse] = useState<ExecResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [commands, setCommands] = useState(false);
  const [baseline, setBaseline] = useState<Snapshot | null>(null);
  const [followUp, setFollowUp] = useState<Snapshot | null>(null);
  useEffect(() => { setResponse(null); }, [active]);
  const done = Object.values(doneSteps).filter(Boolean).length;
  const run = async () => { setBusy(true); try { setResponse(await runStatement(parseStatement(statement), opts)); } finally { setBusy(false); } };
  const capture = async (kind: "baseline" | "follow") => {
    const r = await callProcedure("GetRollingFeatures", [selectedCustomer, 5], opts);
    const t = r.ok ? r.results[0] : undefined; const idx = (n: string) => t?.columns.findIndex((c) => c.name === n) ?? -1;
    const snap: Snapshot = { at: Date.now(), raw: t ? (t.rows[0][idx("RAW_EVENTS")] as number) : null, txn: t ? (t.rows[0][idx("TXN_COUNT")] as number) : null, sum: t ? (t.rows[0][idx("TXN_AMOUNT_SUM")] as string) : null, response: r, ingestAt: Date.now() };
    if (kind === "baseline") { setBaseline(snap); setFollowUp(null); } else setFollowUp(snap);
  };
  const hasRates = samples.length >= 1;
  const latest = useLatest();
  const health = useHealth();
  const catTables = useCall(() => callProcedure("@SystemCatalog", ["TABLES"], opts), []);
  const catProcs = useCall(() => callProcedure("@SystemCatalog", ["PROCEDURES"], opts), []);
  const expectedTables = DDL_MODEL.tables.map((t) => t.name);
  const foundTables = catTables.table ? catTables.table.rows.map((r) => String(r[catTables.table!.columns.findIndex((c) => c.name === "TABLE_NAME")])).filter((n) => expectedTables.includes(n)).length : null;
  const expectedProcs = DDL_MODEL.procedures.map((p) => p.name);
  const foundProcs = catProcs.table ? catProcs.table.rows.map((r) => String(r[catProcs.table!.columns.findIndex((c) => c.name === "PROCEDURE_NAME")]).split(".").pop()!).filter((n) => expectedProcs.includes(n)).length : null;
  const ingesting = hasRates && (latest?.ingest ?? 0) > 0;
  const checks = [
    { label: "VoltDB reachable", sub: health ? (health.ok ? `` : health.error ?? "unreachable") : "checking…", ok: !!health?.ok, glyph: health?.ok ? "✓" : "×" },
    { label: "Six tables", sub: foundTables == null ? (catTables.error ?? "checking…") : foundTables === 6 ? "verified" : ` of 6 deployed`, ok: foundTables === 6, glyph: foundTables === 6 ? "✓" : "!" },
    { label: "Nine procedures", sub: foundProcs == null ? (catProcs.error ?? "checking…") : foundProcs === 9 ? "verified" : ` of 9 deployed`, ok: foundProcs === 9, glyph: foundProcs === 9 ? "✓" : "!" },
    { label: "Pipeline activity", sub: !hasRates ? "waiting for second sample" : ingesting ? "RecordTxn increasing" : "no accepted writes", ok: ingesting, glyph: ingesting ? "↗" : "·" },
    { label: "Loadgen activity", sub: ingesting ? "likely · rate > 0" : "not observable", ok: false, glyph: "~" },
  ];
  const scripts = ["s01", "s02", "s03", "s04", "s05", "s06"].map((id) => REPO[id]);

  return (
    <>
      <div className="toolbar">
        <div className="inline-row"><span style={{ fontSize: 12, fontWeight: 700 }}>Demo progress</span><div className="progress-bar" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={10}><div style={{ width: `${done * 10}%` }} /></div><span className="muted">{done} of 10 steps</span></div>
        <div className="inline-row"><Button onClick={resetSteps}>Reset checks</Button><Button onClick={() => setCommands(true)}>Manual commands</Button><span className="chip selected">Presenter mode</span></div>
      </div>
      <Card title="Pre-flight checks" info="Auto-checks: health via @SystemInformation OVERVIEW, six tables and nine procedures via @SystemCatalog, accepted ingest via increasing RecordTxn invocations. Loadgen process identity is not observable, so it is 'likely'." actions={<span className="link">Updated {fmtTime(Date.now())}</span>} flush style={{ marginBottom: 14 }}>
        <div className="preflight-grid" style={{ paddingTop: 4 }}>{checks.map((c) => <div key={c.label} className="preflight"><span className="event-icon" style={{ color: c.ok ? "var(--green)" : "var(--amber)", background: c.ok ? "var(--green-soft)" : "var(--amber-soft)" }}>{c.glyph}</span><strong>{c.label}</strong><span className="sub">{c.sub}</span></div>)}</div>
        <div style={{ padding: "0 14px 12px" }}><Notice tone="info" action={<button type="button" className="link" onClick={() => setCommands(true)}>View manual commands ↗</button>}>Pipeline activity is proven by increasing procedure calls. Loadgen process identity is not directly observable, so its state is “likely”. Pipeline must start before loadgen because startingOffset is LATEST.</Notice></div>
      </Card>
      <div className="runbook-layout">
        <Card title="Runbook steps" info="Ten steps mirroring queries.sql. Done state is manual and stored locally; results are not persisted across reloads." actions={<Badge tone="neutral">SOURCE-LINKED</Badge>} flush footer={<><span>Progress stored locally</span><LinkButton onClick={resetSteps}>Reset</LinkButton></>}>
          <div className="step-list" style={{ paddingTop: 4 }}>
            {STEPS.map((s) => <button key={s.n} type="button" className={`step-row ${s.n === active ? "active" : ""}`} onClick={() => setParams({ step: String(s.n) })}><div className="step-number">{s.n}</div><div><div className="step-name">{s.title}</div><div className="step-meta">{s.n === 1 ? `Query 1 · selected ${selectedCustomer}` : s.meta}</div></div><span role="checkbox" aria-checked={!!doneSteps[s.n]} tabIndex={0} className={`checkbox ${doneSteps[s.n] ? "checked" : ""}`} onClick={(e) => { e.stopPropagation(); setStepDone(s.n, !doneSteps[s.n]); }} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); setStepDone(s.n, !doneSteps[s.n]); } }}>{doneSteps[s.n] ? "✓" : ""}</span></button>)}
          </div>
        </Card>
        <Card title={`Step ${step.n} · ${step.title}`} info={step.expected} actions={<>{step.link && <Button onClick={() => nav(step.n === 1 ? `/sql?snippet=${snippets[0].id}` : step.link!)}>{step.n === 1 ? "Open SQL" : step.link.startsWith("/procedures") ? "Open procedure" : step.link.startsWith("/explorer") ? "Open Feature Explorer" : step.link.startsWith("/sizing") ? "Open sizing" : "Open hygiene"}</Button>}{step.n === 3 ? <><Button onClick={() => capture("baseline")}>Capture baseline</Button><Button variant="primary" disabled={!baseline} onClick={() => capture("follow")}>Capture follow-up</Button></> : <Button variant="primary" onClick={run} disabled={busy}>{busy ? "Running…" : "Run"}</Button>}</>} footer={<><span>Source: {step.source}</span><button type="button" className="link" onClick={() => setStepDone(step.n, !doneSteps[step.n])}>{doneSteps[step.n] ? "Mark not done ☑" : "Mark Done ☐"}</button></>}>
          <div className="inline-row" style={{ marginBottom: 11 }}><Badge tone="hot">CURRENT</Badge>{step.tier && <Badge tone={step.tier}>{step.tier === "hot" ? "HOT · TXN_RAW" : step.tier === "warm" ? "WARM · CUSTOMER_DAILY" : step.tier === "life" ? "LIFE · CUSTOMER_PROFILE" : step.tier === "merchant" ? "MERCHANT · MERCHANT_MINUTE" : "HYGIENE · COUNTERS"}</Badge>}<span className="muted">{step.n >= 2 && step.n <= 5 || step.n === 9 ? <>Uses selectedCustomer <span className="mono">{selectedCustomer}</span> from step 1</> : step.meta}</span></div>
          <div className="talking-point"><strong>Talking point</strong><br />{step.talking}</div>
          <CodeViewer source={statement} lang="sql" title="Exact statement" maxHeight={120} actions={<><CopyButton value={statement} /><button type="button" onClick={() => nav(`/sql?snippet=${step.n === 1 ? snippets[0].id : step.n === 8 ? snippets.find((s) => s.number === 8)!.id : ""}`)}>Open SQL ↗</button></>} wrap />
          {step.n === 3 ? (
            <div style={{ marginTop: 13 }}>
              <ShrinkProof capture={capture} hasActivity baseline={baseline} followUp={followUp} onReset={() => { setBaseline(null); setFollowUp(null); }} compact />
              <div className="drawer-section" style={{ margin: "14px -16px 0" }}><SectionLabel>Manual checklist</SectionLabel><div className="inline-row" style={{ gap: 20 }}>{step.manual!.map((m) => <label key={m} style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={!!manual[m]} onChange={(e) => setManual((x) => ({ ...x, [m]: e.target.checked }))} />{m}</label>)}</div></div>
            </div>
          ) : (
            <div style={{ marginTop: 13, border: "1px solid var(--border)", borderRadius: 10, minHeight: 200, display: "flex", flexDirection: "column" }}>
              <ResultPanel response={response} loading={busy} emptyTitle="Click Run to execute this step" emptyDetail={step.expected} maxHeight={260} />
              {response?.ok && step.n === 1 && response.results[0].rows.length > 0 && <div style={{ padding: "0 14px 12px" }}><Notice tone="info">Select a customer to carry into later steps: {response.results[0].rows.slice(0, 5).map((r) => <button key={String(r[0])} type="button" className="link mono" style={{ marginLeft: 8 }} onClick={() => setSelectedCustomer(String(r[0]))}>{String(r[0])}{String(r[0]) === selectedCustomer ? " ✓" : ""}</button>)}</Notice></div>}
              {response?.ok && <div style={{ padding: "0 14px 12px" }}><Notice tone="good"><strong>Expected observation.</strong> {step.expected} <span className="spacer" /><button type="button" className="link" onClick={() => open(traceFromResponse(`Step ${step.n}`, response))}>Show request</button></Notice></div>}
            </div>
          )}
        </Card>
      </div>
      <Drawer open={commands} title="Manual commands" subtitle="README run order · view/copy only · the console never launches processes" onClose={() => setCommands(false)} width={640}>
        <div style={{ padding: 14, display: "grid", gap: 12 }}>
          <div className="command-box"><span>mvn -q -DskipTests package</span><CopyButton value="mvn -q -DskipTests package" /></div>
          {scripts.map((s) => { const cmd = `./${s.path}${s.id === "s05" ? " 2000" : s.id === "s06" ? " 500" : ""}`; const comment = s.source.split("\n").find((l) => /^#\s+[A-Z]/.test(l))?.replace(/^#\s+/, "") ?? ""; return <div key={s.id}><div className="muted tiny" style={{ marginBottom: 4 }}>{comment}</div><div className="command-box" style={{ margin: 0 }}><span>{cmd}</span><span className="inline-row"><CopyButton value={cmd} /><button type="button" className="link" onClick={() => open({ label: s.path, mode: "repo", endpoint: "GET /api/repo/scripts", repositoryPath: s.path, sourceId: s.id })}>Source</button></span></div></div>; })}
          <Notice tone="warn">Run the pipeline (terminal 1) before the load generator (terminal 2): the consumer starts at LATEST.</Notice>
        </div>
      </Drawer>
    </>
  );
}
