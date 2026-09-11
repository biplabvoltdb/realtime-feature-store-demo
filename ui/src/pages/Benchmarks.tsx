import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity } from "lucide-react";
import { Card, Badge, Chip, Notice, Button, LinkButton, CopyButton, EmptyState } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/DataTable";
import { RateTrendChart } from "@/components/domain/charts";
import { useLatest, useSeries, useTelemetry, type Range } from "@/data/telemetry";
import { callProcedure, useExecOptions, useProcStats, kafkaLag, useMode } from "@/data/api";
import { PROCEDURES } from "@/data/mock";
import { useSettings } from "@/data/settings";
import { useCall, useNow, useAsync } from "@/data/hooks";
import { useInspector, traceFromResponse } from "@/components/shell/Inspector";
import { fmtInt, fmtCompact, fmtAgo, fmtRate } from "@/lib/format";
import { REPO } from "@/repo";

type ProcRow = { name: string; inv: number | null; avg: number; min: number; max: number; calls: number };

export default function Benchmarks() {
  const nav = useNavigate();
  const { settings, readOnly } = useSettings();
  const opts = useExecOptions(readOnly, settings.voltApiUrl);
  const mode = useMode();
  const latest = useLatest();
  const { samples } = useTelemetry();
  const procStats = useProcStats();
  const [range, setRange] = useState<Range>("15m");
  const series = useSeries(range);
  const [section, setSection] = useState<"server" | "client" | "kafka">("server");
  const now = useNow(1000);
  const { open } = useInspector();
  const stats = useCall(() => callProcedure("@Statistics", ["PROCEDURE", 0], opts), [Math.floor((latest?.t ?? 0) / 30_000)]);
  const lag = useAsync(() => kafkaLag(), [Math.floor((latest?.t ?? 0) / 10_000)], mode === "live" && settings.kafkaLag);
  const rows = useMemo<ProcRow[]>(() => {
    const t = stats.table;
    if (!t) return [];
    const idx = (n: string) => t.columns.findIndex((c) => c.name === n);
    const [pi, ii, mn, mx, av] = [idx("PROCEDURE"), idx("INVOCATIONS"), idx("MIN_EXECUTION_TIME"), idx("MAX_EXECUTION_TIME"), idx("AVG_EXECUTION_TIME")];
    const agg = new Map<string, { inv: number; min: number; max: number; avgW: number }>();
    for (const r of t.rows) { const name = String(r[pi]).split(".").pop()!; const a = agg.get(name) ?? { inv: 0, min: Infinity, max: 0, avgW: 0 }; const inv = Number(r[ii]); a.inv += inv; a.min = Math.min(a.min, Number(r[mn])); a.max = Math.max(a.max, Number(r[mx])); a.avgW += Number(r[av]) * inv; agg.set(name, a); }
    const hasRates = samples.length >= 1;
    return Array.from(agg.entries()).map(([name, a]) => {
      const m = PROCEDURES.find((p) => p.name === name);
      const liveRate = procStats?.find((s) => s.name === name)?.ratePerSec ?? null;
      const rate = mode === "live" ? liveRate : !hasRates || !latest ? null : name === "RecordTxn" ? latest.ingest : name === "RecordMerchantTxn" ? latest.merchant : name === "GetRollingFeatures" ? latest.reads * 0.9 : name === "GetMerchantFeatures" ? latest.reads * 0.1 : name === "BumpCounter" ? latest.rejected : m?.invPerSec ?? null;
      return { name, inv: rate, avg: a.inv ? Math.round(a.avgW / a.inv / 1000) : 0, min: Math.round((a.min === Infinity ? 0 : a.min) / 1000), max: Math.round(a.max / 1000), calls: a.inv };
    }).sort((a, b) => (b.inv ?? 0) - (a.inv ?? 0) || b.calls - a.calls);
  }, [stats.table, latest, samples.length, mode, procStats]);
  const lagRows: number[][] = mode === "live" ? (lag.data?.data?.rows ?? []).map((r) => [r.partition, r.endOffset, r.lag ?? -1]) : Array.from({ length: 8 }, (_, i) => [i, 18_402_110 + i * 3_311, 12 + ((i * 37) % 60)]);
  const lagTotal = mode === "live" ? lag.data?.data?.totalLag ?? null : 1240;
  const lagError = mode === "live" ? (lag.error ?? (lag.data && !lag.data.ok ? lag.data.error : null)) : null;

  return (
    <>
      <div className="toolbar">
        <div className="chip-list"><Chip label="Server statistics" selected={section === "server"} onClick={() => setSection("server")} /><Chip label="Client evidence" selected={section === "client"} onClick={() => setSection("client")} /><Chip label="Kafka lag" selected={section === "kafka"} onClick={() => setSection("kafka")} /></div>
        <div className="inline-row"><select className="small-control select-control" value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label="Range"><option value="5m">5m</option><option value="15m">15m</option><option value="1h">1h</option></select><span className="small-control">Avg</span><span className="muted tiny">Updated {latest ? fmtAgo(latest.t, now) : "—"}</span></div>
      </div>
      {section === "server" && (
        <div className="benchmark-top">
          <Card title="Server procedure performance" info="@Statistics PROCEDURE 0 aggregated across sites and hosts: invocations summed, execution times converted from nanoseconds to microseconds, average weighted by invocations. inv/s is the invocation delta between telemetry samples." source="exec @Statistics PROCEDURE 0" actions={<LinkButton onClick={() => stats.response && open(traceFromResponse("@Statistics PROCEDURE", stats.response, { fields: ["PROCEDURE", "INVOCATIONS", "AVG_EXECUTION_TIME", "MIN_EXECUTION_TIME", "MAX_EXECUTION_TIME"], formula: "µs = ns ÷ 1000 · avg weighted by INVOCATIONS · inv/s = ΔINVOCATIONS ÷ Δs" }))}>@Statistics PROCEDURE · Show request</LinkButton>} footer={<><span>Nanoseconds converted to microseconds in the BFF.</span><LinkButton onClick={() => nav("/procedures")}>View all 9 procedures ›</LinkButton></>}>
            {stats.error ? <Notice tone="error">{stats.error}</Notice> : rows.length ? <DataTable maxHeight={360} columns={[
              { key: "name", header: "PROCEDURE", width: "35%", render: (r) => <button type="button" className={`link cell-mono ${/^Get(Rolling|Merchant)/.test(r.name) ? "cell-strong" : ""}`} onClick={() => nav(`/procedures?name=${r.name}`)}>{r.name}</button> },
              { key: "inv", header: "INV/S", width: "11%", align: "right", render: (r) => (r.inv == null ? "—" : fmtRate(r.inv, "")) },
              { key: "avg", header: "AVG µS", width: "12%", align: "right", render: (r) => fmtInt(r.avg) }, { key: "min", header: "MIN µS", width: "12%", align: "right", render: (r) => fmtInt(r.min) }, { key: "max", header: "MAX µS", width: "12%", align: "right", render: (r) => fmtInt(r.max) },
              { key: "calls", header: "CALLS", width: "18%", align: "right", render: (r) => fmtCompact(r.calls) },
            ]} rows={rows} rowKey={(r) => r.name} /> : stats.loading ? <div className="skeleton" style={{ height: 200 }} /> : <EmptyState title="No procedure statistics yet" detail="@Statistics PROCEDURE returns rows once procedures have been invoked." minHeight={200} />}
          </Card>
          <Card title="Cluster latency percentiles" info="@Statistics LATENCY 0 is cluster-wide (all transactions, all hosts; max across hosts). It is labeled cluster latency, not feature-read-only, until procedure-level attribution is proven on the live schema." source="exec @Statistics LATENCY 0 · P50/P95/P99/P99.9 (µs → ms)" actions={<span className="small-control" style={{ minHeight: 28 }}>Percentiles</span>}>
            <div className="grid four-col" style={{ gap: 8, marginBottom: 8 }}>{([["p50", latest?.p50], ["p95", latest?.p95], ["p99", latest?.p99], ["p99.9", latest?.p999]] as [string, number | undefined][]).map(([l, v]) => <div key={l} className="stat-tile"><div className="label">{l}</div><div className="value">{v == null ? "—" : v.toFixed(v < 10 ? 2 : 1)}<span className="kpi-unit">ms</span></div></div>)}</div>
            <RateTrendChart samples={series} height={170} unit=" ms" decimals={2} keys={[{ key: "p99", label: "p99", color: "#7c3aed" }, { key: "p95", label: "p95", color: "#2563eb" }]} />
            <Notice tone="info" style={{ marginTop: 8 }}>Scope: @Statistics LATENCY · cluster. Not labeled feature-read-only.</Notice>
          </Card>
        </div>
      )}
      <div className="benchmark-bottom">
        {(section === "server" || section === "client") && (
          <Card title="Load generation" info="Commands are copied from the script header comments and shown with explicit arguments. The console never launches processes." source={REPO.s05.path} actions={<LinkButton onClick={() => open({ label: "Load generator", mode: "repo", endpoint: "GET /api/repo/loadgen", repositoryPath: REPO.loadgen.path, sourceId: "loadgen" })}>View source ↗</LinkButton>} footer={<><span>View / copy only</span><span>Not launched by console</span></>}>
            <div className="muted tiny">Steady demo load</div>
            <div className="command-box"><span>./scripts/05_run_loadgen.sh 2000 100000</span><CopyButton value="./scripts/05_run_loadgen.sh 2000 100000" /></div>
            <div className="muted tiny" style={{ marginTop: 12 }}>§8 peak · 10M customers</div>
            <div className="command-box"><span>./scripts/05_run_loadgen.sh 15000 10000000</span><CopyButton value="./scripts/05_run_loadgen.sh 15000 10000000" /></div>
            <Notice tone="warn" style={{ marginTop: 12 }}>Script comment says 100k customers; the Java default is 10M. Explicit arguments are shown so the two cannot be confused.</Notice>
          </Card>
        )}
        {(section === "server" || section === "client") && (
          <Card title="Query benchmark" info="FeatureQueryBench prints client round-trip percentiles to stdout every ~10 s. The repository exposes no feed, so nothing is simulated here in live mode." source={REPO.querybench.path} actions={<LinkButton onClick={() => open({ label: "FeatureQueryBench", mode: "repo", endpoint: "GET /api/repo/querybench", repositoryPath: REPO.querybench.path, sourceId: "querybench" })}>FeatureQueryBench.java ↗</LinkButton>} footer={<><span>TODO adapter hook</span><span>No fabricated live percentiles</span></>}>
            <div className="muted tiny">500 target qps · 10M customers · windows 5 / 60 / 1440 / 43200 min + 10% merchant reads</div>
            <div className="command-box"><span>./scripts/06_run_querybench.sh 500 10000000</span><CopyButton value="./scripts/06_run_querybench.sh 500 10000000" /></div>
            <EmptyState title="No live client feed configured" detail="The Java process prints client round-trip percentiles to stdout every ~10 seconds." action={<span className="mono tiny" style={{ color: "var(--accent)" }}>queries=N errors=N | latency ms: p50 p95 p99 p99.9 max</span>} minHeight={135} />
          </Card>
        )}
        {(section === "server" || section === "kafka") && (
          <Card title="Kafka consumer lag" info="Optional Kafka admin client reading group novapay-feature-agg offsets against novapay-txn-events end offsets. Read-only: the console never commits or changes offsets." actions={<Badge tone={settings.kafkaLag ? (mode === "live" ? "good" : "mock") : "neutral"}>{settings.kafkaLag ? (mode === "live" ? "LIVE" : "MOCK") : "OPTIONAL"}</Badge>} footer={<><span>No offsets changed</span><LinkButton onClick={() => open({ label: "Kafka lag", mode, endpoint: "GET /api/kafka/lag", request: { group: "novapay-feature-agg", topic: "novapay-txn-events" }, response: mode === "live" ? lag.data ?? null : { enabled: settings.kafkaLag, totalLag: 1240 }, caveat: "Disabled state is a valid state; the feature is optional." })}>Trace ›</LinkButton></>}>
            {settings.kafkaLag ? (
              <div>
                {lagError && <Notice tone="error" style={{ marginBottom: 8 }}>{lagError}</Notice>}
                <div className="grid two-col" style={{ gap: 8, marginBottom: 10 }}><div className="stat-tile"><div className="label">Total lag</div><div className="value">{lagTotal == null ? "—" : fmtInt(lagTotal)}</div></div><div className="stat-tile"><div className="label">Partitions</div><div className="value">{mode === "live" ? lagRows.length || "—" : 50}</div></div></div>
                <DataTable maxHeight={160} columns={[{ key: "p", header: "PARTITION", width: "30%", render: (r: number[]) => String(r[0]) }, { key: "e", header: "END OFFSET", width: "35%", align: "right", render: (r) => fmtInt(r[1]) }, { key: "l", header: "LAG", width: "35%", align: "right", render: (r) => (r[2] < 0 ? "— (no commit)" : fmtInt(r[2])) }]} rows={lagRows} rowKey={(r) => String(r[0])} empty={lag.loading ? "Querying group offsets…" : "No partitions returned"} />
                {mode === "live" && lag.data?.data?.groupState && <div className="muted tiny" style={{ marginTop: 6 }}>Group state {lag.data.data.groupState} · read-only admin fetch</div>}
              </div>
            ) : <EmptyState icon={<Activity size={19} />} title="Lag inspection disabled" detail={<>Group <span className="mono">novapay-feature-agg</span><br />Enable the optional Kafka admin client.</>} action={<Button onClick={() => nav("/settings")}>Open Settings</Button>} minHeight={235} />}
          </Card>
        )}
      </div>
    </>
  );
}
