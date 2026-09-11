import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database } from "lucide-react";
import { Card, Badge, Chip, Notice, Button, LinkButton, InfoTip, Sparkline, TierBadge, EmptyState } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/DataTable";
import { CodeViewer } from "@/components/ui/CodeViewer";
import { useLatest, useSeries, useTelemetry, counterRate, type Sample } from "@/data/telemetry";
import { callProcedure, useExecOptions, dlqTail, useMode } from "@/data/api";
import { useSettings } from "@/data/settings";
import { useCall, useAsync } from "@/data/hooks";
import { parseSnippets } from "@/repo";
import { useInspector, traceFromResponse } from "@/components/shell/Inspector";
import { fmtInt, fmtDecimal, fmtPct, fmtTime, shortId } from "@/lib/format";
import { TABLE_TIER } from "@/lib/tier";

type CounterKey = keyof Sample["counters"];
const COUNTERS: { key: CounterKey; color: string; expected: number | null; label: string; note: string }[] = [
  { key: "dlq_unparseable_json", color: "#64748b", expected: null, label: "Malformed JSON", note: "Standard loadgen always serializes valid JSON" },
  { key: "dlq_unparseable_created_at", color: "#dc2626", expected: 0.00196, label: "Invalid created_at", note: "Injected only on non-retries" },
  { key: "dlq_missing_subject_key", color: "#ea580c", expected: 0.00196, label: "Missing subject key", note: "customer_id absent from payload" },
  { key: "dropped_late", color: "#7c3aed", expected: 0.00294, label: "Beyond lateness", note: "Three days old vs 1-day bound" },
];
type DlqRow = { p: number; o: number; reason: string; payload: string };
const MOCK_DLQ: DlqRow[] = [
  { p: 1, o: 40211, reason: "unparseable created_at", payload: '{"event_type":"TXN","customer_id":100000073321,"created_at":"not-a-timestamp",…}' },
  { p: 3, o: 40188, reason: "missing customer_id / txn_id", payload: '{"event_type":"TXN","txn_id":"txn_1756800011","created_at":"2026-09-02T…",…}' },
  { p: 0, o: 40402, reason: "age > 86,400 s", payload: '{"event_type":"MANDATE","customer_id":100000018812,"created_at":"2026-08-30T…",…}' },
];

export default function Hygiene() {
  const nav = useNavigate();
  const { settings, readOnly } = useSettings();
  const opts = useExecOptions(readOnly, settings.voltApiUrl);
  const mode = useMode();
  const latest = useLatest();
  const { samples } = useTelemetry();
  const series = useSeries("15m");
  const [section, setSection] = useState<"all" | "rejected" | "retries" | "ttl">("all");
  const [auto, setAuto] = useState(true);
  const { open } = useInspector();
  const snippet8 = useMemo(() => parseSnippets().find((s) => s.number === 8)!, []);
  const dedupe = useCall(() => callProcedure("@AdHoc", [snippet8.statement], opts), [auto ? Math.floor((latest?.t ?? 0) / 30_000) : 0]);
  const ttl = useCall(() => callProcedure("@Statistics", ["TTL", 0], opts), [auto ? Math.floor((latest?.t ?? 0) / 30_000) : 0]);
  const tail = useAsync(() => dlqTail(20), [Math.floor((latest?.t ?? 0) / 15_000)], mode === "live" && settings.dlqTail);
  const dlqRows: DlqRow[] = mode === "live" ? (tail.data?.data?.messages ?? []).map((m) => ({ p: m.partition, o: m.offset, reason: inferReason(m.value), payload: m.value.length > 140 ? `${m.value.slice(0, 140)}…` : m.value })) : MOCK_DLQ;
  const tailError = mode === "live" ? (tail.error ?? (tail.data && !tail.data.ok ? tail.data.error : null)) : null;
  const inputRate = latest ? latest.ingest + latest.rejected : 0;
  const ratio = (k: CounterKey) => { const r = counterRate(samples, k, 120_000); return r == null || !inputRate ? null : r / inputRate; };
  const sparkVals = (k: CounterKey) => { const step = Math.max(1, Math.floor(series.length / 40)); const out: number[] = []; for (let i = step; i < series.length; i += step) out.push(series[i].counters[k] - series[i - step].counters[k]); return out; };
  const show = (s: typeof section) => section === "all" || section === s;

  return (
    <>
      <div className="toolbar">
        <div className="chip-list"><Chip label="All counters" selected={section === "all"} onClick={() => setSection("all")} /><Chip label="Rejected" dot="red" selected={section === "rejected"} onClick={() => setSection("rejected")} /><Chip label="Retries" dot="orange" selected={section === "retries"} onClick={() => setSection("retries")} /><Chip label="TTL" dot="purple" selected={section === "ttl"} onClick={() => setSection("ttl")} /></div>
        <div className="inline-row"><span className="small-control">15m</span><Chip label="Auto refresh" dot="green" selected={auto} onClick={() => setAuto((a) => !a)} /><Chip label={settings.dlqTail ? (mode === "live" ? "Kafka tail enabled" : "Kafka tail (mock)") : "Kafka tail disabled"} dot="slate" selected={false} onClick={() => nav("/settings")} /></div>
      </div>
      {show("rejected") && (
        <div className="counter-grid">
          {COUNTERS.map((c) => { const v = latest?.counters[c.key] ?? null; const r = ratio(c.key); return (
            <section key={c.key} className="card counter-card">
              <div className="counter-name">{c.key} <InfoTip content={<>Current VAL from <span className="mono">exec GetCounters</span>. Ratio = counter delta ÷ (accepted RecordTxn delta + rejection deltas) over the last 2 minutes. {c.expected == null ? "Not injected by the standard load generator; a nonzero value would still be valid evidence from another producer." : `Loadgen injects ≈${fmtPct(c.expected, 3)} of the whole stream (edge cases skip retries).`}</>} source="exec GetCounters · @Statistics PROCEDURE 0" /></div>
              <div className="counter-main"><span className="counter-value">{v == null ? "—" : fmtInt(v)}</span><span className="counter-ratio" style={{ color: c.expected == null ? "var(--slate)" : "var(--green)" }}>{c.expected == null ? "not injected" : r == null ? "—" : fmtPct(r, 3)}</span></div>
              <Sparkline values={sparkVals(c.key)} color={c.color} />
            </section>); })}
        </div>
      )}
      {show("rejected") && (
        <div className="hygiene-main">
          <Card title="Expected vs observed" info="Expected values come from TxnLoadGenerator constants (badTs 0.2%, noKey 0.2%, late 0.3% of non-retries with ~2% retries). They are expectations, not pass/fail thresholds." source="TxnLoadGenerator.java · retryPct/badTsPct/noKeyPct/latePct" actions={<LinkButton onClick={() => open({ label: "Loadgen edge cases", mode: "repo", endpoint: "GET /api/repo/loadgen", repositoryPath: "src/main/java/com/novapay/poc/loadgen/TxnLoadGenerator.java", sourceId: "loadgen" })}>Loadgen source ↗</LinkButton>}>
            <Notice tone="info" icon="ƒ" style={{ marginBottom: 8 }}>Ratio = rejected delta ÷ (accepted RecordTxn delta + rejection deltas)</Notice>
            <DataTable columns={[
              { key: "label", header: "CASE", width: "20%" },
              { key: "expected", header: "EXPECTED", width: "15%", render: (c) => (c.expected == null ? <Badge tone="neutral">NOT INJECTED</Badge> : `~${fmtPct(c.expected, 3)}`) },
              { key: "observed", header: "OBSERVED", width: "15%", render: (c) => { const r = ratio(c.key); return c.expected == null ? fmtInt(latest?.counters[c.key] ?? 0) : r == null ? "—" : fmtPct(r, 3); } },
              { key: "state", header: "STATE", width: "15%", render: (c) => { const r = ratio(c.key); if (c.expected == null) return "—"; if (r == null) return <Badge tone="neutral">WAITING</Badge>; return Math.abs(r - c.expected) / c.expected < 0.35 ? <Badge tone="good">ALIGNED</Badge> : <Badge tone="warn">DRIFT</Badge>; } },
              { key: "note", header: "NOTES", width: "35%" },
            ]} rows={COUNTERS} rowKey={(c) => c.key} />
          </Card>
          <Card title="Recent rejected input" subtitle="(Optional)" info="DLQ payloads on novapay-txn-dlq contain the original event with no reason envelope. Any displayed reason is inferred from a visible payload defect; COUNTERS is authoritative. The tail uses an isolated consumer group and never commits as novapay-feature-agg." actions={<Badge tone={settings.dlqTail ? (mode === "live" ? "good" : "mock") : "warn"}>{settings.dlqTail ? (mode === "live" ? "KAFKA TAIL" : "MOCK TAIL") : "PARTIAL"}</Badge>}>
            {settings.dlqTail ? (
              <>
                {tailError && <Notice tone="error" style={{ marginBottom: 8 }}>{tailError}</Notice>}
                <DataTable maxHeight={190} columns={[
                  { key: "off", header: "PARTITION · OFFSET", width: "22%", render: (r: DlqRow) => <span className="cell-mono">{r.p} · {r.o}</span> },
                  { key: "reason", header: "INFERRED REASON", width: "30%", render: (r) => <Badge tone="hygiene">{r.reason}</Badge> },
                  { key: "payload", header: "PAYLOAD", width: "48%", render: (r) => <span className="cell-mono" title={r.payload}>{r.payload}</span> },
                ]} rows={dlqRows} rowKey={(r) => `${r.p}-${r.o}`} empty={tail.loading ? "Reading the tail of novapay-txn-dlq…" : "No messages on novapay-txn-dlq yet"} />
              </>
            ) : <EmptyState icon={<Database size={17} />} title="Kafka tail not enabled" detail="Enable the isolated console tail in Settings. The pipeline emits raw payloads without a reason envelope." action={<Button onClick={() => nav("/settings")}>Open Settings</Button>} minHeight={165} />}
            <Notice tone="warn" style={{ marginTop: 8 }}>Any displayed rejection reason is inferred. COUNTERS is authoritative for classification.</Notice>
          </Card>
        </div>
      )}
      <div className="hygiene-bottom">
        {show("retries") && (
          <Card title="Retry / dedupe evidence" info="Query 8 from queries.sql: TXN_RAW rows with ATTEMPT_COUNT > 1. One raw row per (CUSTOMER_ID, TXN_ID) means the retried payment was counted once; RecordTxn source proves the aggregate behavior." source={snippet8.statement} actions={<LinkButton onClick={() => nav(`/sql?snippet=${snippet8.id}`)}>Query 8 · Open SQL ↗</LinkButton>} footer={<><span>One raw row per (CUSTOMER_ID, TXN_ID); procedure source proves aggregate behavior.</span><LinkButton onClick={() => dedupe.response && open(traceFromResponse("Dedupe evidence", dedupe.response, { repositoryPath: "src/main/resources/queries.sql", sourceId: "RecordTxn" }))}>Show trace ›</LinkButton></>}>
            {dedupe.error ? <Notice tone="error">{dedupe.error}</Notice> : dedupe.table ? <DataTable maxHeight={230} columns={[
              { key: "c", header: "CUSTOMER_ID", width: "23%", render: (r: (string | number | null)[]) => <button type="button" className="link cell-mono" onClick={() => nav(`/explorer?subject=customer&id=${r[0]}`)}>{String(r[0])}</button> },
              { key: "t", header: "TXN_ID", width: "22%", render: (r) => <span className="cell-mono" title={String(r[1])}>{shortId(String(r[1]), 8, 4)}</span> },
              { key: "a", header: "AMOUNT", width: "18%", render: (r) => `₹${fmtDecimal(r[2])}` },
              { key: "n", header: "ATTEMPT_COUNT", width: "23%", render: (r) => <>{String(r[3])} <Badge tone="warn">retry deduplicated</Badge></> },
              { key: "r", header: "PAYMENT_RESULT", width: "14%", render: (r) => String(r[4]) },
            ]} rows={dedupe.table.rows} rowKey={(r) => `${r[0]}-${r[1]}`} empty="No retried txn_id observed yet (loadgen retries ~2% of events)" /> : <div className="skeleton" style={{ height: 120 }} />}
          </Card>
        )}
        {show("ttl") && (
          <Card title="Physical TTL activity" info="@Statistics TTL 0: rows physically deleted by the TTL background task. This is distinct from the rolling-window shrink shown in Feature Explorer." source="exec @Statistics TTL 0" actions={<LinkButton onClick={() => ttl.response && open(traceFromResponse("@Statistics TTL", ttl.response, { fields: ["TABLE_NAME", "ROWS_DELETED", "ROWS_DELETED_LAST_ROUND", "ROWS_REMAINING", "LAST_DELETE_TIMESTAMP"] }))}>@Statistics TTL · Show request</LinkButton>} footer={<><span>Physical row deletion · distinct from rolling-window shrinkage.</span><LinkButton onClick={() => nav("/sql?snippet=sys-ttl")}>Open in SQL ↗</LinkButton></>}>
            {ttl.error ? <Notice tone="error">{ttl.error}</Notice> : ttl.table ? (() => { const t = ttl.table!; const ix = (n: string) => t.columns.findIndex((c) => c.name === n); const [tn, rd, rl, rr, ld] = [ix("TABLE_NAME"), ix("ROWS_DELETED"), ix("ROWS_DELETED_LAST_ROUND"), ix("ROWS_REMAINING"), ix("LAST_DELETE_TIMESTAMP")]; const num = (v: string | number | null) => (v == null ? null : Number(v)); return <DataTable columns={[
              { key: "t", header: "TABLE", width: "26%", render: (r: (string | number | null)[]) => <span className="cell-mono">{String(r[tn])}</span> },
              { key: "tier", header: "TIER", width: "12%", render: (r) => <TierBadge tier={TABLE_TIER[String(r[tn])] ?? "hygiene"} /> },
              { key: "d", header: "ROWS DELETED", width: "17%", align: "right", render: (r) => fmtInt(num(r[rd])) },
              { key: "l", header: "LAST ROUND", width: "15%", align: "right", render: (r) => fmtInt(num(r[rl])) },
              { key: "rem", header: "REMAINING", width: "17%", align: "right", render: (r) => fmtInt(num(r[rr])) },
              { key: "at", header: "LAST DELETE", width: "13%", render: (r) => (r[ld] == null ? "—" : fmtTime(Number(r[ld]) / 1000)) },
            ]} rows={t.rows} rowKey={(r, i) => `${r[tn]}-${i}`} empty="No TTL rounds reported yet (rows are younger than their TTL)" />; })() : <div className="skeleton" style={{ height: 120 }} />}
          </Card>
        )}
      </div>
      {section === "all" && <div style={{ marginTop: 14 }}><CodeViewer source={snippet8.statement} lang="sql" title="Query 8 · exact statement" maxHeight={90} /></div>}
    </>
  );
}

/** Reason is inferred from a visible payload defect; COUNTERS remain authoritative (DESIGN §13). */
function inferReason(value: string): string {
  let e: Record<string, unknown>;
  try { e = JSON.parse(value) as Record<string, unknown>; } catch { return "unparseable JSON"; }
  if (e.customer_id == null || Number(e.customer_id) <= 0 || !e.txn_id) return "missing customer_id / txn_id";
  const ts = Date.parse(String(e.created_at ?? ""));
  if (Number.isNaN(ts)) return "unparseable created_at";
  if (Date.now() - ts > 86_400_000) return "age > 86,400 s";
  return "reason not inferable";
}
