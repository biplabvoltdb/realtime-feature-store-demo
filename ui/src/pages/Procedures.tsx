import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Play } from "lucide-react";
import { Card, Badge, Notice, LinkButton, Button } from "@/components/ui/primitives";
import { CodeViewer } from "@/components/ui/CodeViewer";
import { ResultPanel } from "@/components/domain/ResultPanel";
import { PROCEDURES, type ProcManifest } from "@/data/mock";
import { callProcedure, useExecOptions, useProcStats } from "@/data/api";
import { useSettings } from "@/data/settings";
import { useInspector, traceFromResponse } from "@/components/shell/Inspector";
import { REPO, findLine } from "@/repo";
import { DDL_MODEL } from "@/repo/ddlModel";
import { windowTier } from "@/lib/tier";
import { fmtRate, fmtInt } from "@/lib/format";
import type { ExecResponse } from "@/lib/volt";

function coerce(p: ProcManifest["params"][number], raw: string): { value: unknown; error?: string } {
  const v = raw.trim();
  if (p.type === "BIGINT") { if (!/^-?\d+$/.test(v)) return { value: v, error: "Expected an integer" }; return { value: Math.abs(Number(v)) <= Number.MAX_SAFE_INTEGER ? Number(v) : v }; }
  if (p.type === "INTEGER") { if (!/^-?\d+$/.test(v)) return { value: v, error: "Expected an integer" }; const n = Number(v); if (n < -2147483648 || n > 2147483647) return { value: n, error: "Out of INTEGER range" }; return { value: n }; }
  if (p.type === "FLOAT") { const n = Number(v); if (Number.isNaN(n)) return { value: v, error: "Expected a number" }; return { value: n }; }
  return { value: v };
}

export default function Procedures() {
  const [params, setParams] = useSearchParams();
  const name = params.get("name") ?? "GetRollingFeatures";
  const proc = PROCEDURES.find((p) => p.name === name) ?? PROCEDURES[0];
  const { settings, readOnly, selectedCustomer } = useSettings();
  const opts = useExecOptions(readOnly, settings.voltApiUrl);
  const { open } = useInspector();
  const procStats = useProcStats();
  const statFor = (n: string) => procStats?.find((s) => s.name === n);
  const [filter, setFilter] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [response, setResponse] = useState<ExecResponse | null>(null);
  const [plan, setPlan] = useState<ExecResponse | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValues(Object.fromEntries(proc.params.map((p) => [p.name, p.name === "customerId" ? selectedCustomer : p.defaultValue]))); setResponse(null); setPlan(null); }, [proc, selectedCustomer]);
  const coerced = proc.params.map((p) => coerce(p, values[p.name] ?? p.defaultValue));
  const errors = coerced.filter((c) => c.error).length;
  const windowMinutes = proc.name === "GetRollingFeatures" ? Number(values.windowMinutes ?? 1440) : null;
  const wt = windowMinutes != null ? windowTier(windowMinutes) : null;
  const blocked = readOnly && proc.mutating;
  const src = REPO[proc.sourceId];
  const runLine = useMemo(() => (proc.kind === "java" ? findLine(src, " run(") : findLine(src, `CREATE PROCEDURE ${proc.name}`)), [src, proc]);
  const sqlText = DDL_MODEL.procedures.find((d) => d.name === proc.name)?.sql;
  const stat = statFor(proc.name);

  const execute = async () => { setBusy(true); try { setResponse(await callProcedure(proc.name, coerced.map((c) => c.value), opts)); } finally { setBusy(false); } };
  const explain = async () => { setBusy(true); try { setPlan(await callProcedure("@ExplainProc", [proc.name], opts)); } finally { setBusy(false); } };
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !blocked && !errors) execute(); }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }); // eslint-disable-line react-hooks/exhaustive-deps

  const planText = plan?.ok ? plan.results[0].rows.map((r) => `-- ${r[0]}\n-- ${String(r[1]).slice(0, 160)}${String(r[1]).length > 160 ? "…" : ""}\n${r[2]}`).join("\n\n") : plan ? `-- ${plan.statusstring}` : "";

  return (
    <div className="split-page wide-left">
      <Card title="Procedures" info="Nine procedures from ddl.sql: five Java classes and four DDL-defined. Rates and durations come from @Statistics PROCEDURE 0 (invocation deltas between samples, ns → µs); mutating procedures are locked while the read-only guard is on." actions={<Badge tone="neutral">{PROCEDURES.length}</Badge>} flush footer={<><span className="link">Read-only guard</span><span style={{ color: readOnly ? "var(--green)" : "var(--red)" }}>● {readOnly ? "Locked ✓" : "Unlocked · writes allowed"}</span></>}>
        <div className="panel-search" style={{ marginTop: 8 }}><Search size={13} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search procedures…" aria-label="Search procedures" /></div>
        {PROCEDURES.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase())).map((p) => { const s = statFor(p.name); return (
          <button key={p.name} type="button" className={`list-row ${p.name === proc.name ? "active" : ""}`} style={{ minHeight: 61 }} onClick={() => setParams({ name: p.name })}>
            <div><div className="list-row-title mono">{p.name}</div><div className="list-row-meta">{p.kind === "java" ? "Java" : "SQL"} · {p.mutating ? "mutating" : "read"} {p.mutating && readOnly && <Badge tone="hygiene">LOCKED</Badge>}</div></div>
            <div className="list-row-stat"><strong>{s?.ratePerSec == null ? "—" : fmtRate(s.ratePerSec)}</strong><br />{s ? `${s.avgUs} µs` : "—"}</div>
          </button>); })}
      </Card>
      <div className="detail-grid">
        <Card title={proc.name} info={proc.description} source={src.path} actions={<><Button variant="ghost" disabled={!response} onClick={() => response && open(traceFromResponse(proc.name, response, { sourceId: proc.sourceId, repositoryPath: src.path }))}>Show request</Button><Button variant="ghost" onClick={explain} disabled={busy}>Explain</Button><Button variant="primary" icon={Play} onClick={execute} disabled={busy || blocked || errors > 0}>{busy ? "Running…" : "Execute ⌘↵"}</Button></>}>
          <div className="inline-row" style={{ marginBottom: 12 }}>
            <Badge tone="neutral">{proc.kind.toUpperCase()}</Badge><Badge tone={proc.mutating ? "hygiene" : "good"}>{proc.mutating ? "MUTATING" : "READ"}</Badge>
            <span className="muted" style={{ fontSize: 11 }}>{proc.partition ? <>Partition <span className="mono">{proc.partition.table}.{proc.partition.column}</span> · parameter {proc.partition.param}</> : "Multi-partition"}</span>
            <span className="spacer" /><span className="muted tiny">Signature from repository manifest{settings.dataMode === "live" ? " · deployed catalog reachable" : " · catalog check runs live"}</span>
          </div>
          {proc.params.length === 0 && <Notice tone="info">This procedure takes no parameters.</Notice>}
          <div className="form-row" style={{ gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, proc.params.length + (wt ? 1 : 0)))}, minmax(0,1fr))` }}>
            {proc.params.map((p, i) => (
              <div className="field" key={p.name}><label htmlFor={`param-${p.name}`}>{p.name} · {p.type}</label><input id={`param-${p.name}`} className={`input mono ${coerced[i].error ? "invalid" : ""}`} value={values[p.name] ?? ""} disabled={blocked} onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))} />{coerced[i].error && <div className="field-error">{coerced[i].error}</div>}</div>
            ))}
            {wt && <div className="field"><label>Computed tier</label><div className="input"><Badge tone={wt.tier}>{wt.label}</Badge><span className="muted">{wt.tier === "hot" ? "≤ 10080 min" : "> 10080 min"}</span></div></div>}
          </div>
          {blocked ? <Notice tone="warn" style={{ marginTop: 11 }}><strong>Locked.</strong> {proc.name} mutates cluster state. The form is disabled while the read-only guard is on; unlock writes in Settings to execute it.</Notice>
            : wt ? <Notice tone="info" style={{ marginTop: 11 }}>{wt.tier === "hot" ? "Exact aggregates from raw events · minute-aligned cutoff. Windows above 10080 minutes use CUSTOMER_DAILY." : "Summed from CUSTOMER_DAILY · live leading edge, day-granular trailing edge. Result shape is 2 VoltTables (aggregate, profile)."}</Notice>
            : <Notice tone="info" style={{ marginTop: 11 }}>{proc.description}</Notice>}
        </Card>
        <section className="card" style={{ minHeight: 420 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(360px, 44%)", flex: 1, minHeight: 0 }}>
            <ResultPanel response={response} loading={busy} emptyTitle={`Execute ${proc.name} to see its result sets`} emptyDetail={wt ? "Hot windows return 4 VoltTables (aggregate, distinct amount, distinct merchants, profile); warm windows return 2." : "Each VoltTable becomes a tab with field names and Volt types."} maxHeight={330}
              extras={[{ id: "plan", label: "Plan", content: <div style={{ padding: 12 }}>{plan ? <CodeViewer source={planText} lang="sql" title={`@ExplainProc ${proc.name}`} maxHeight={330} wrap /> : <Notice tone="info">Click <strong>Explain</strong> to fetch the execution plan via <span className="mono">@ExplainProc {proc.name}</span>.</Notice>}</div> }]} />
            <div style={{ borderLeft: "1px solid var(--border)", minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div className="code-toolbar" style={{ borderRadius: 0 }}><span>{src.path.split("/").pop()}</span><span className="actions"><button type="button" onClick={() => open({ label: src.path, mode: "repo", endpoint: `GET /api/repo/${proc.sourceId}`, repositoryPath: src.path, sourceId: proc.sourceId })}>Open full source ↗</button></span></div>
              <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                {proc.kind === "java" ? <CodeViewer source={src.source.split("\n").slice(runLine - 1, runLine + 34).join("\n")} lang="java" startLine={runLine} highlightLines={[runLine]} borderless /> : <CodeViewer source={`CREATE PROCEDURE ${proc.name}${proc.partition ? `\n    PARTITION ON TABLE ${proc.partition.table} COLUMN ${proc.partition.column}` : ""}\n    AS ${sqlText ?? ""};`} lang="sql" startLine={runLine} highlightLines={[runLine]} borderless />}
              </div>
            </div>
          </div>
          <div className="card-footer"><span className="muted">{response?.ok ? `${response.results.length} result sets · ${response.results.reduce((a, t) => a + t.rows.length, 0)} rows · BFF round trip ${response.timing.bffRoundTripMs} ms${response.timing.upstreamMs != null ? ` · upstream ${response.timing.upstreamMs} ms` : ""}` : response ? "Call failed — see statusstring" : "No execution yet"}</span><span className="inline-row"><span className="muted">{stat ? `Procedure avg ${stat.avgUs} µs · ${fmtInt(stat.invocations)} invocations` : "No procedure statistics yet"}</span><LinkButton onClick={() => open({ label: `${proc.name} statistics`, mode: settings.dataMode, endpoint: "GET /api/volt/stats/PROCEDURE", request: { Procedure: "@Statistics", Parameters: ["PROCEDURE", 0] }, fields: ["INVOCATIONS", "AVG_EXECUTION_TIME", "MIN_EXECUTION_TIME", "MAX_EXECUTION_TIME"], formula: "µs = AVG_EXECUTION_TIME (ns) ÷ 1000 · rate = ΔINVOCATIONS ÷ Δs", response: stat ?? null })}>Show trace ›</LinkButton></span></div>
        </section>
      </div>
    </div>
  );
}
