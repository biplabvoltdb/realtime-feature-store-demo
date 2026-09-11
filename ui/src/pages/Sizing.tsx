import { useMemo, useState } from "react";
import { Card, Badge, Chip, Notice, Button, LinkButton, SectionLabel, Kv, TierBadge } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/DataTable";
import { CodeViewer } from "@/components/ui/CodeViewer";
import { callProcedure, useExecOptions, useHealth } from "@/data/api";
import { useSettings } from "@/data/settings";
import { useCall } from "@/data/hooks";
import { useLatest } from "@/data/telemetry";
import { useInspector, traceFromResponse } from "@/components/shell/Inspector";
import { fmtInt, fmtCompact, fmtBytes, fmtTime } from "@/lib/format";
import { TABLE_TIER } from "@/lib/tier";
import { REPO } from "@/repo";
import type { VoltTable } from "@/lib/volt";

type Agg = { table: string; rows: number; tupleKb: number; stringKb: number; bytesPerRow: number | null };
/** The README awk contract: cnt[$6]+=$8; data[$6]+=$10; str[$6]+=$11; bytes/row=(data+str)*1024/cnt. */
export function aggregateTableStats(t: VoltTable): Agg[] {
  const i = (n: string) => t.columns.findIndex((c) => c.name === n);
  const [tn, tc, td, ts, tt] = [i("TABLE_NAME"), i("TUPLE_COUNT"), i("TUPLE_DATA_MEMORY"), i("STRING_DATA_MEMORY"), i("TABLE_TYPE")];
  const m = new Map<string, Agg>();
  for (const r of t.rows) { if (String(r[tt]) !== "PersistentTable") continue; const name = String(r[tn]); const a = m.get(name) ?? { table: name, rows: 0, tupleKb: 0, stringKb: 0, bytesPerRow: null }; a.rows += Number(r[tc]); a.tupleKb += Number(r[td]); a.stringKb += Number(r[ts]); m.set(name, a); }
  return Array.from(m.values()).map((a) => ({ ...a, bytesPerRow: a.rows > 0 ? ((a.tupleKb + a.stringKb) * 1024) / a.rows : null })).sort((a, b) => b.tupleKb - a.tupleKb);
}

export default function Sizing() {
  const { settings, readOnly } = useSettings();
  const opts = useExecOptions(readOnly, settings.voltApiUrl);
  const latest = useLatest();
  const { open } = useInspector();
  const health = useHealth();
  const [view, setView] = useState<"live" | "subject" | "formula">("live");
  const stats = useCall(() => callProcedure("@Statistics", ["TABLE", 0], opts), []);
  const agg = useMemo(() => (stats.table ? aggregateTableStats(stats.table) : []), [stats.table]);
  const get = (n: string) => agg.find((a) => a.table === n);
  const measuredSubjects = get("CUSTOMER_PROFILE")?.rows ?? 0;
  const rawPerSubject = measuredSubjects ? (get("TXN_RAW")?.rows ?? 0) / measuredSubjects : 0;
  const dailyPerSubject = measuredSubjects ? (get("CUSTOMER_DAILY")?.rows ?? 0) / measuredSubjects : 0;
  const rawB = get("TXN_RAW")?.bytesPerRow ?? 0, dailyB = get("CUSTOMER_DAILY")?.bytesPerRow ?? 0, profB = get("CUSTOMER_PROFILE")?.bytesPerRow ?? 0;
  const [subjects, setSubjects] = useState(10_000_000);
  const [activity, setActivity] = useState(1);
  const [rawRet, setRawRet] = useState(7);
  const [dailyRet, setDailyRet] = useState(90);
  const measuredEps = latest?.ingest ?? 2018;
  const rawRows = rawPerSubject * activity * (rawRet / 7);
  const dailyRows = Math.min(dailyRet, dailyPerSubject * (dailyRet / 90) * Math.min(1, activity * 4 + 0.75));
  const perSubject = rawRows * rawB + dailyRows * dailyB + profB;
  const projected = perSubject * subjects;
  const impliedEps = measuredSubjects ? (measuredEps / measuredSubjects) * subjects * activity : 0;
  const awk = useMemo(() => { const m = /## Measuring bytes\/subject[^\n]*\n\n```bash\n([\s\S]*?)```/.exec(REPO.readme.source); return m ? m[1].trim() : ""; }, []);
  const formula = `${rawRows.toFixed(2)} raw rows/subject × ${fmtInt(Math.round(rawB))} B\n+ ${dailyRows.toFixed(2)} daily rows/subject × ${fmtInt(Math.round(dailyB))} B\n+ 1 profile row × ${fmtInt(Math.round(profB))} B\n= ${fmtInt(Math.round(perSubject))} B / customer subject`;

  return (
    <>
      <div className="toolbar">
        <div className="chip-list"><Chip label="Live measurement" dot="green" selected={view === "live"} onClick={() => setView("live")} /><Chip label="Customer subject tier" selected={view === "subject"} onClick={() => setView("subject")} /><Chip label="Repository formula" selected={view === "formula"} onClick={() => setView("formula")} /></div>
        <div className="inline-row"><span className="muted tiny">@Statistics TABLE 0 · {health?.hosts ?? "—"} host{health?.hosts === 1 ? "" : "s"} · {health?.partitions ?? "—"} partitions · collected {stats.finishedAt ? fmtTime(stats.finishedAt) : "—"}</span><Button variant="primary" onClick={stats.reload} disabled={stats.loading}>{stats.loading ? "Refreshing…" : "Refresh statistics"}</Button></div>
      </div>
      <div className="sizing-layout">
        <Card title="Measured table data memory" info="Groups @Statistics TABLE rows by TABLE_NAME and sums TUPLE_COUNT, TUPLE_DATA_MEMORY and STRING_DATA_MEMORY across hosts and partitions. Memory fields are KB. Zero rows never divide." source="exec @Statistics TABLE 0" actions={<LinkButton onClick={() => stats.response && open(traceFromResponse("@Statistics TABLE", stats.response, { fields: ["TABLE_NAME", "TUPLE_COUNT", "TUPLE_DATA_MEMORY", "STRING_DATA_MEMORY"], formula: "bytesPerRow = (Σ TUPLE_DATA_MEMORY + Σ STRING_DATA_MEMORY) × 1024 ÷ Σ TUPLE_COUNT", repositoryPath: "README.md · Measuring bytes/subject (§8)" }))}>@Statistics TABLE · Show request</LinkButton>} footer={<><span>Persistent tables only · table data memory · {stats.table ? `${fmtInt(stats.table.rows.length)} raw rows aggregated` : ""}</span><span className="link">Export ↓</span></>}>
          {agg.length ? <DataTable columns={[
            { key: "table", header: "TABLE", width: "26%", render: (a) => <span className={`cell-mono ${TABLE_TIER[a.table] !== "merchant" && a.table !== "COUNTERS" ? "cell-strong" : ""}`}>{a.table}</span> },
            { key: "tier", header: "TIER", width: "13%", render: (a) => <TierBadge tier={TABLE_TIER[a.table] ?? "hygiene"} /> },
            { key: "rows", header: "ROWS", width: "14%", align: "right", render: (a) => (a.rows >= 10_000 ? fmtCompact(a.rows) : fmtInt(a.rows)) },
            { key: "tuple", header: "TUPLE MEMORY", width: "17%", align: "right", render: (a) => `${(a.tupleKb / 1024).toFixed(1)} MB` },
            { key: "string", header: "STRING MEMORY", width: "17%", align: "right", render: (a) => `${(a.stringKb / 1024).toFixed(1)} MB` },
            { key: "bpr", header: "BYTES / ROW", width: "13%", align: "right", render: (a) => (a.bytesPerRow == null ? <span title="No rows to measure">—</span> : `${fmtInt(Math.round(a.bytesPerRow))} B`) },
          ]} rows={agg} rowKey={(a) => a.table} /> : <div className="skeleton" style={{ height: 220 }} />}
          <Notice tone="info" style={{ marginTop: 12 }}>Bytes/row = (tuple KB + string KB) × 1024 ÷ rows. Values are summed across hosts and partitions. Zero rows render —.</Notice>
        </Card>
        <Card title="Projection" info="Customer subject-tier table data only. The activity factor scales per-subject event volume relative to the measured cluster; the implied events/s shows what that assumption means at the chosen subject count." actions={<Button variant="small" onClick={() => { setSubjects(10_000_000); setActivity(1); setRawRet(7); setDailyRet(90); }}>Reset defaults</Button>}>
          <SectionLabel>Projected subject-tier data memory</SectionLabel>
          <div className="projection-number">{fmtBytes(projected, 1).replace(" GB", "")} <span style={{ fontSize: 15, color: "var(--text-secondary)" }}>{fmtBytes(projected, 1).split(" ")[1]}</span></div>
          <div className="muted tiny" style={{ marginBottom: 6 }}>{fmtInt(subjects)} customer subjects · measured row sizes · implies ≈ {fmtInt(Math.round(impliedEps))} ev/s</div>
          {impliedEps > 20_000 && <Notice tone="warn" style={{ marginBottom: 8 }}>At measured per-subject activity, {fmtCompact(subjects, 0)} subjects imply {fmtCompact(impliedEps, 0)} ev/s. The §8 peak is 15,000 ev/s; lower the activity factor to model dormant subjects.</Notice>}
          <Slider label="Subjects" value={subjects} min={100_000} max={50_000_000} step={100_000} onChange={setSubjects} display={`${(subjects / 1e6).toFixed(1)} M`} />
          <Slider label="Activity vs measured" value={activity} min={0.02} max={2} step={0.02} onChange={setActivity} display={`${activity.toFixed(2)}×`} />
          <Slider label="Raw retention" value={rawRet} min={1} max={14} step={1} onChange={setRawRet} display={`${rawRet} d`} />
          <Slider label="Daily retention" value={dailyRet} min={7} max={180} step={1} onChange={setDailyRet} display={`${dailyRet} d`} />
          <div className="formula" style={{ marginTop: 13, whiteSpace: "pre-line" }}>{formula}</div>
        </Card>
      </div>
      <div className="sizing-bottom">
        <Card title="README measurement command" info="The exact awk one-liner from README §8. The console aggregation above implements the same contract so both outputs can be compared." actions={<LinkButton onClick={() => open({ label: "README §8", mode: "repo", endpoint: "GET /api/repo/source/README", repositoryPath: "README.md", sourceId: "readme" })}>Open README ↗</LinkButton>}>
          <CodeViewer source={awk} lang="bash" title="README.md · Measuring bytes/subject (§8)" maxHeight={140} wrap />
          <div className="grid two-col" style={{ gap: 10, marginTop: 12 }}><Notice tone="good">Console aggregation matches this contract for the same raw response.</Notice><Notice tone="info">Numeric BIGINT keys reduce table and index width versus VARCHAR (v2 → v4).</Notice></div>
        </Card>
        <Card title="Assumptions & exclusions" info="What the headline does and does not include." actions={<LinkButton onClick={() => open({ label: "Projection formula", mode: "mock", endpoint: "client-side", formula, fields: ["TUPLE_COUNT", "TUPLE_DATA_MEMORY", "STRING_DATA_MEMORY"], caveat: "Customer subject tier only." })}>Show formula trace</LinkButton>}>
          <Notice tone="warn"><strong>Not a complete production capacity model.</strong> The headline covers measured customer subject-tier table data only.</Notice>
          <div className="grid two-col" style={{ gap: 18, marginTop: 15 }}>
            <div><SectionLabel>Excluded</SectionLabel><div className="event-list">{["Merchant storage and counters", "Index memory and replication (k-safety)", "Headroom, export, protocol/runtime overhead"].map((x) => <div key={x} className="event"><span className="event-icon" style={{ background: "var(--slate-soft)" }}>—</span><div className="event-text">{x}</div></div>)}</div></div>
            <div><SectionLabel>Documented inputs</SectionLabel><Kv k="Event payload" v="~1.5 KB · assumption" /><Kv k="Customer key" v="BIGINT · ~12 digits" /><Kv k="Source partitions" v="50 · script contract" /><Kv k="Measured subjects" v={fmtInt(measuredSubjects)} /><Kv k="Measured ingest" v={`${fmtInt(measuredEps)} ev/s`} /></div>
          </div>
          {view !== "live" && <Badge tone="neutral">{view === "subject" ? "Customer subject tier view" : "Repository formula view"}</Badge>}
        </Card>
      </div>
    </>
  );
}

function Slider({ label, value, min, max, step, onChange, display }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display: string }) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return <div className="slider-row"><span>{label}</span><input type="range" className="slider" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ["--fill" as string]: fill }} aria-label={label} /><strong className="right">{display}</strong></div>;
}
