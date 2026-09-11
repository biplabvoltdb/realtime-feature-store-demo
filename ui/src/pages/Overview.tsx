import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowRightLeft, Clock, Users, Rows3, AlertTriangle } from "lucide-react";
import { Card, Chip, KpiCard, Badge, Notice, LinkButton } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/DataTable";
import { DonutStorage, RateTrendChart } from "@/components/domain/charts";
import { PipelineMiniMap } from "@/components/domain/PipelineMiniMap";
import { useLatest, useSeries, useTelemetry, rejectedTotal, type Range } from "@/data/telemetry";
import { callProcedure, useExecOptions, useTableStats } from "@/data/api";
import { useSettings } from "@/data/settings";
import { useCall } from "@/data/hooks";
import { parseSnippets } from "@/repo";
import { fmtCompact, fmtInt, fmtDecimal, fmtTime, fmtPct } from "@/lib/format";
import { TIER_META, type Tier } from "@/lib/tier";
import { useInspector, traceFromResponse } from "@/components/shell/Inspector";

const TIERS: Tier[] = ["hot", "warm", "life", "merchant", "hygiene", "kafka", "voltsp"];

export default function Overview() {
  const nav = useNavigate();
  const { settings, readOnly } = useSettings();
  const opts = useExecOptions(readOnly, settings.voltApiUrl);
  const tableStats = useTableStats();
  const latest = useLatest();
  const { samples, events } = useTelemetry();
  const [range, setRange] = useState<Range>("15m");
  const series = useSeries(range);
  const [selected, setSelected] = useState<Set<Tier>>(new Set());
  const hasRates = samples.length >= 1;
  const dim = (t: Tier) => selected.size > 0 && !selected.has(t);
  const toggle = (t: Tier, isolate: boolean) => setSelected((s) => { if (isolate) return new Set([t]); const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const snippet1 = useMemo(() => parseSnippets()[0], []);
  const busiest = useCall(() => callProcedure("@AdHoc", [snippet1.statement], opts), [snippet1.statement]);
  const { open } = useInspector();
  const rej = rejectedTotal(latest);
  const inputTotal = latest ? latest.ingest + latest.rejected : 0;

  return (
    <>
      <div className="toolbar">
        <div className="chip-list">
          {TIERS.map((t) => <Chip key={t} label={TIER_META[t].label} dot={TIER_META[t].dot} selected={selected.has(t)} dimmed={dim(t)} onClick={() => toggle(t, false)} title="Click to filter · Alt+click to isolate" />)}
          {selected.size > 0 && <LinkButton onClick={() => setSelected(new Set())}>Clear</LinkButton>}
        </div>
        <select className="small-control select-control" value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label="Chart range"><option value="5m">5m</option><option value="15m">15m</option><option value="1h">1h</option></select>
      </div>
      <div className="kpi-grid">
        <KpiCard label="Ingest rate" icon={Activity} tone="blue" value={hasRates && latest ? fmtInt(latest.ingest) : "—"} unit="ev/s" meta={hasRates ? "accepted RecordTxn/s" : "Waiting for second sample…"} metaTone="neutral" info="Accepted customer-tier writes per second: delta of RecordTxn invocations from @Statistics PROCEDURE 0 over the sample interval. Not total Kafka input." source="@Statistics PROCEDURE 0 · INVOCATIONS delta" />
        <KpiCard label="Feature reads" icon={ArrowRightLeft} tone="green" value={hasRates && latest ? fmtInt(latest.reads) : "—"} unit="q/s" meta={hasRates ? "GetRolling + GetMerchant" : undefined} metaTone="neutral" info="GetRollingFeatures + GetMerchantFeatures invocation deltas. Excludes profile/daily/ad-hoc reads." source="@Statistics PROCEDURE 0" />
        <KpiCard label="Cluster p99 latency" icon={Clock} tone="purple" value={latest ? latest.p99.toFixed(1) : "—"} unit="ms" meta="cluster scope" metaTone="neutral" info="Cluster-wide p99 from @Statistics LATENCY 0. Labeled cluster, not feature-read-only, until procedure-level attribution is proven live." source="@Statistics LATENCY 0 · P99 (µs → ms)" />
        <KpiCard label="Customer subjects" icon={Users} tone="orange" value={latest ? fmtInt(latest.subjects) : "—"} meta={latest ? `+${latest.subjects - (samples[0]?.subjects ?? latest.subjects)} in view` : undefined} info="Rows in CUSTOMER_PROFILE (one row per customer by schema invariant), summed across hosts and partitions." source="@Statistics TABLE 0 · TUPLE_COUNT where TABLE_NAME = CUSTOMER_PROFILE" />
        <KpiCard label="Hot-tier rows" icon={Rows3} tone="blue" value={latest ? fmtCompact(latest.hotRows) : "—"} meta="TXN_RAW · 7 d TTL" metaTone="neutral" info="TXN_RAW tuple count across all partitions. Physical TTL deletion runs in batches of 5000." source="@Statistics TABLE 0 · TUPLE_COUNT where TABLE_NAME = TXN_RAW" />
        <KpiCard label="Rejected + late" icon={AlertTriangle} tone="red" value={rej != null ? fmtInt(rej) : "—"} meta={latest && inputTotal ? fmtPct(latest.rejected / inputTotal, 2) : undefined} metaTone="neutral" info="Sum of the four canonical counters: dlq_unparseable_json, dlq_unparseable_created_at, dlq_missing_subject_key, dropped_late. A successful call with an absent name counts as 0." source="exec GetCounters" onClick={() => nav("/hygiene")} />
      </div>
      <div className="grid overview-main">
        <Card title="Tier Storage" info="Tuple + string data memory per table from @Statistics TABLE 0, summed across hosts and partitions. Index memory is excluded." source="@Statistics TABLE 0 · TUPLE_DATA_MEMORY + STRING_DATA_MEMORY (KB)" actions={<LinkButton onClick={() => nav("/sizing")}>View sizing ›</LinkButton>}>
          <DonutStorage stats={tableStats} dimmed={dim} onSelect={(t) => nav(`/schema?table=${t}`)} />
          <Notice tone="info" style={{ marginTop: 16 }}>Memory sums tuple + string data across all hosts and partitions. Index memory is excluded.</Notice>
        </Card>
        <Card title="Ingest & Reads Over Time" info="Per-second rates derived from cumulative procedure invocation counters. Gaps stay gaps; nothing is interpolated." source="@Statistics PROCEDURE 0 · INVOCATIONS deltas" actions={<><span className="small-control" style={{ minHeight: 28 }}>{range}</span><span className="small-control" style={{ minHeight: 28 }}>Avg</span></>}>
          <RateTrendChart samples={series} height={232} unit="/s" keys={[{ key: "ingest", label: "RecordTxn/s", color: "#2563eb", dimmed: dim("hot") }, { key: "merchant", label: "RecordMerchantTxn/s", color: "#ea580c", dimmed: dim("merchant") }, { key: "reads", label: "Feature reads/s", color: "#7c3aed", dimmed: dim("warm") && dim("hot") }]} />
        </Card>
        <Card title="Pipeline" subtitle="(Live)" info="Compact event path. Edge rates come from procedure deltas and counter deltas; the Kafka→VoltSP figure is accepted + rejected because Kafka telemetry is optional." actions={<LinkButton onClick={() => nav("/architecture")}>View full architecture ↗</LinkButton>}>
          <PipelineMiniMap latest={latest} events={events} hasRates={hasRates} dim={(k) => dim(k === "hot" ? "hot" : k === "warm" ? "warm" : k === "merchant" ? "merchant" : k === "kafka" ? "kafka" : k === "voltsp" ? "voltsp" : "hygiene")} />
        </Card>
      </div>
      <div className="grid overview-bottom">
        <Card title="Busiest Customers" info={<>Query 1 from queries.sql via @AdHoc. Multi-partition GROUP BY over CUSTOMER_DAILY. <strong>Daily-bucket cutoff</strong>: DAY_START &gt; NOW() − 1 day, so this is not an exact rolling 24 hours.</>} source={snippet1?.statement} footer={<><LinkButton onClick={() => nav(`/sql?snippet=${snippet1.id}`)}>View in SQL console ›</LinkButton><span className="inline-row">{busiest.response && <LinkButton onClick={() => open(traceFromResponse("Busiest customers", busiest.response!, { repositoryPath: "src/main/resources/queries.sql", caveat: "Daily-bucket cutoff; not an exact rolling 24 h." }))}>Show request</LinkButton>}<LinkButton onClick={() => nav("/sql")}>Export CSV ↓</LinkButton></span></>}>
          <Notice tone="warn" style={{ margin: "0 0 7px" }}>Daily-bucket cutoff from query 1 · not an exact rolling 24 hours.</Notice>
          <DataTable columns={[
            { key: "id", header: "CUSTOMER_ID", width: "27%", render: (r: (string | number | null)[]) => <span className="cell-mono cell-strong">{String(r[0])}</span> },
            { key: "txns", header: "TXNS", width: "14%", render: (r) => <span className="cell-strong">{fmtInt(Number(r[1]))}</span> },
            { key: "spend", header: "SPEND", width: "23%", render: (r) => <span className="cell-strong">₹{fmtDecimal(r[2])}</span> },
            { key: "src", header: "SOURCE", width: "18%", render: () => <Badge tone="warm">WARM</Badge> },
            { key: "go", header: "", width: "18%", render: () => <span className="link">Explore ›</span> },
          ]} rows={busiest.table?.rows.slice(0, 5) ?? []} rowKey={(r) => String(r[0])} onRowClick={(r) => nav(`/explorer?subject=customer&id=${r[0]}`)} empty={busiest.loading ? "Running query 1…" : busiest.error ?? "No rows returned"} />
        </Card>
        <Card title="Recent Hygiene Events" info="Derived from GetCounters deltas between samples. Equal consecutive samples create no feed item. Optional Kafka DLQ payloads would be labeled separately." source="exec GetCounters · per-sample deltas" actions={<LinkButton onClick={() => nav("/hygiene")}>View hygiene ›</LinkButton>}>
          {events.length === 0 ? <div className="empty-state" style={{ minHeight: 120 }}><div><strong>No rejected events yet — ingest is clean</strong><p>Counter deltas appear here as they are observed.</p></div></div> : (
            <div className="event-list">
              {events.slice(0, 5).map((e) => <div key={e.id} className="event"><span className="event-icon" style={{ color: e.name === "dropped_late" ? "var(--red)" : "var(--amber)", background: e.name === "dropped_late" ? "var(--red-soft)" : "var(--amber-soft)" }}>!</span><div className="event-text"><strong className="mono">{e.name} +{e.delta}</strong><br />{e.name === "dropped_late" ? "Age exceeded configured 86,400 s bound" : e.name === "dlq_missing_subject_key" ? "Missing or invalid customer_id" : e.name === "dlq_unparseable_created_at" ? "Payloads forwarded to novapay-txn-dlq" : "Unparseable JSON forwarded to novapay-txn-dlq"}</div><span className="event-time">{fmtTime(e.t)}</span></div>)}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
