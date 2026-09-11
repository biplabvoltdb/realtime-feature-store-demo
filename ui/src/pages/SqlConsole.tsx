import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Play, Search } from "lucide-react";
import { Card, Badge, Notice, Button, LinkButton } from "@/components/ui/primitives";
import { CodeViewer } from "@/components/ui/CodeViewer";
import { DataTable } from "@/components/ui/DataTable";
import { SqlEditor } from "@/components/domain/SqlEditor";
import { ResultPanel } from "@/components/domain/ResultPanel";
import { parseSnippets, REPO } from "@/repo";
import { runStatement, callProcedure, useExecOptions } from "@/data/api";
import { useSettings } from "@/data/settings";
import { useLocalStorage } from "@/data/hooks";
import { splitStatements, parseStatement, classify } from "@/lib/sqlParse";
import { useInspector, traceFromResponse } from "@/components/shell/Inspector";
import { fmtTime } from "@/lib/format";
import type { ExecResponse } from "@/lib/volt";

const SYSTEM = [
  { id: "sys-table", label: "@Statistics TABLE", statement: "exec @Statistics TABLE 0;" }, { id: "sys-ttl", label: "@Statistics TTL", statement: "exec @Statistics TTL 0;" },
  { id: "sys-proc", label: "@Statistics PROCEDURE", statement: "exec @Statistics PROCEDURE 0;" }, { id: "sys-lat", label: "@Statistics LATENCY", statement: "exec @Statistics LATENCY 0;" },
  { id: "sys-mem", label: "@Statistics MEMORY", statement: "exec @Statistics MEMORY 0;" }, { id: "sys-info", label: "@SystemInformation OVERVIEW", statement: "exec @SystemInformation OVERVIEW;" },
  { id: "sys-cat", label: "@SystemCatalog TABLES", statement: "exec @SystemCatalog TABLES;" },
];
type HistoryItem = { id: string; text: string; at: number; elapsedMs: number; ok: boolean; mode: string; pinned?: boolean };
type Group = { text: string; response: ExecResponse };

export default function SqlConsole() {
  const [params, setParams] = useSearchParams();
  const snippets = useMemo(() => parseSnippets(), []);
  const { settings, readOnly, selectedCustomer, toast } = useSettings();
  const opts = useExecOptions(readOnly, settings.voltApiUrl);
  const { open } = useInspector();
  const initial = params.get("snippet");
  const [activeSnippet, setActiveSnippet] = useState<string>(initial ?? snippets[1]?.id ?? "");
  const [value, setValue] = useState<string>(() => { const s = snippets.find((x) => x.id === initial) ?? SYSTEM.find((x) => x.id === initial); return s ? s.statement.replace(/100000012345/g, selectedCustomer) : `exec GetRollingFeatures ${selectedCustomer} 1440;\n-- HOT branch · exact aggregates from TXN_RAW · minute-aligned cutoff`; });
  const [filter, setFilter] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState(0);
  const [plan, setPlan] = useState<ExecResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useLocalStorage<HistoryItem[]>("pfsc.sql.history", []);
  const [lower, setLower] = useState("plan");

  useEffect(() => { const s = snippets.find((x) => x.id === initial) ?? SYSTEM.find((x) => x.id === initial); if (s) { setValue(s.statement.replace(/100000012345/g, selectedCustomer)); setActiveSnippet(s.id); } }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (id: string, statement: string) => { setActiveSnippet(id); setValue(statement.replace(/100000012345/g, selectedCustomer)); setParams({ snippet: id }); };
  const statements = useMemo(() => splitStatements(value).map(parseStatement), [value]);
  const blockedStatements = statements.filter((s) => !classify(s).allowedWhenLocked);

  const run = useCallback(async () => {
    if (busy) return;
    const list = splitStatements(value).map(parseStatement);
    if (!list.length) { toast("Nothing to run"); return; }
    setBusy(true); setPlan(null);
    const t0 = performance.now();
    const out: Group[] = [];
    for (const st of list) out.push({ text: st.text, response: await runStatement(st, opts) });
    setGroups(out); setActiveGroup(0); setBusy(false);
    setHistory((h) => [{ id: `${Date.now()}`, text: value.trim(), at: Date.now(), elapsedMs: Math.round(performance.now() - t0), ok: out.every((g) => g.response.ok), mode: opts.readOnly ? "read-only" : "unlocked" }, ...h].slice(0, 50));
  }, [busy, value, opts, setHistory, toast]);

  const explain = async () => {
    const st = statements[activeGroup] ?? statements[0];
    if (!st) return;
    setBusy(true);
    const r = st.kind === "exec" ? await callProcedure("@ExplainProc", [st.procedure], opts) : await callProcedure("@Explain", [st.sql], opts);
    setPlan(r); setLower("plan"); setBusy(false);
  };
  const current = groups[activeGroup]?.response ?? null;
  const planText = plan?.ok ? (plan.results[0].columns.length === 3 ? plan.results[0].rows.map((r) => `-- ${r[0]}\n-- ${String(r[1]).slice(0, 180)}${String(r[1]).length > 180 ? "…" : ""}\n${r[2]}`).join("\n\n") : String(plan.results[0].rows[0]?.[0] ?? "")) : plan ? `-- ${plan.statusstring}` : "";
  const summaryText = current?.ok ? `-- Result shape: ${current.results.length} VoltTable${current.results.length === 1 ? "" : "s"}\n${current.results.map((t, i) => `${i + 1}  ${(t.name ?? `Result ${i + 1}`).padEnd(20)} ${t.rows.length} row${t.rows.length === 1 ? "" : "s"}`).join("\n")}\n\n-- Explain is available through ${statements[activeGroup]?.kind === "exec" ? "@ExplainProc" : "@Explain"}; click Explain.` : "";

  return (
    <div className="sql-page">
      <Card title="Snippet library" info="Demo queries are parsed from queries.sql in repository order (numbered comments become titles). System procedures are a separate group." source={REPO.queries.path} actions={<Badge tone="neutral">{snippets.length + SYSTEM.length}</Badge>} flush footer={<><span className="link">queries.sql</span><LinkButton onClick={() => open({ label: "queries.sql", mode: "repo", endpoint: "GET /api/repo/queries", repositoryPath: REPO.queries.path, sourceId: "queries" })}>Open source ↗</LinkButton></>}>
        <div className="panel-search" style={{ marginTop: 8 }}><Search size={13} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter snippets…" aria-label="Filter snippets" /></div>
        <div className="snippet-group">Demo queries</div>
        {snippets.filter((s) => s.title.toLowerCase().includes(filter.toLowerCase())).map((s) => <button key={s.id} type="button" className={`snippet ${activeSnippet === s.id ? "active" : ""}`} onClick={() => pick(s.id, s.statement)} title={s.description}><span className="snippet-num">{String(s.number).padStart(2, "0")}</span><span>{s.title.replace(/\s*\(.*$/, "").slice(0, 34)}</span></button>)}
        <div className="snippet-group">System</div>
        {SYSTEM.filter((s) => s.label.toLowerCase().includes(filter.toLowerCase())).map((s) => <button key={s.id} type="button" className={`snippet ${activeSnippet === s.id ? "active" : ""}`} onClick={() => pick(s.id, s.statement)}><span className="snippet-num">@</span><span className="mono">{s.label}</span></button>)}
      </Card>
      <div className="sql-main">
        <section className="card">
          <div className="editor-toolbar">
            <div className="inline-row"><Button variant="primary" icon={Play} onClick={run} disabled={busy}>{busy ? "Running…" : "Run ⌘↵"}</Button><Button onClick={explain} disabled={busy || !statements.length}>Explain</Button><Badge tone={readOnly ? "good" : "hygiene"}>{readOnly ? "READ-ONLY LOCKED" : "WRITES UNLOCKED"}</Badge>{blockedStatements.length > 0 && readOnly && <Badge tone="warn">{blockedStatements.length} statement{blockedStatements.length > 1 ? "s" : ""} will be blocked</Badge>}</div>
            <div className="inline-row"><LinkButton onClick={() => setLower("history")}>History</LinkButton><LinkButton onClick={() => current && open(traceFromResponse("SQL console", current))}>Show request</LinkButton><span className="muted">SQL · VoltDB</span></div>
          </div>
          <SqlEditor value={value} onChange={setValue} onRun={run} height={210} />
        </section>
        <section className="card" style={{ minHeight: 420 }}>
          {groups.length > 1 && <div className="tabs" style={{ background: "var(--surface-subtle)" }}>{groups.map((g, i) => <button key={i} type="button" className={`tab ${i === activeGroup ? "active" : ""}`} onClick={() => setActiveGroup(i)}>Statement {i + 1} {g.response.ok ? "" : "· failed"}</button>)}</div>}
          <ResultPanel response={current} loading={busy} emptyTitle="Run a statement to see results" emptyDetail="Each VoltTable becomes a tab. Headers show the field name and Volt type; TIMESTAMP renders ISO with raw µs on hover; DECIMAL stays a string." maxHeight={300} />
          {current?.ok && <Notice tone="info" style={{ margin: "0 14px" }}>DECIMAL values remain strings end-to-end. BFF {current.timing.bffRoundTripMs} ms is round-trip time, not per-call server elapsed.</Notice>}
          {current && statements[activeGroup]?.kind === "sql" && !statements[activeGroup].hasLimit && <Notice tone="warn" style={{ margin: "8px 14px 0" }}>No SQL LIMIT: a live call would materialize the full result set before pagination.</Notice>}
          <div className="tabs" style={{ marginTop: 8 }}>{[["plan", "Plan"], ["history", "History"], ["request", "Request & response"]].map(([id, l]) => <button key={id} type="button" className={`tab ${lower === id ? "active" : ""}`} onClick={() => setLower(id)}>{l}</button>)}</div>
          <div style={{ padding: 12, minHeight: 200 }}>
            {lower === "plan" && <CodeViewer source={plan ? planText : summaryText || "-- Run a statement, then click Explain to fetch its plan (@Explain for SQL, @ExplainProc for procedures)."} lang="sql" title={plan ? (statements[activeGroup]?.kind === "exec" ? `@ExplainProc ${statements[activeGroup].procedure}` : "@Explain") : "Execution summary"} maxHeight={260} wrap />}
            {lower === "history" && <DataTable maxHeight={260} columns={[
              { key: "at", header: "TIME", width: "12%", render: (h) => fmtTime(h.at) },
              { key: "text", header: "STATEMENT", width: "50%", render: (h) => <span className="cell-mono">{h.text.split("\n")[0].slice(0, 90)}</span> },
              { key: "elapsed", header: "ELAPSED", width: "10%", render: (h) => `${h.elapsedMs} ms` },
              { key: "ok", header: "STATUS", width: "10%", render: (h) => <Badge tone={h.ok ? "good" : "hygiene"}>{h.ok ? "OK" : "FAILED"}</Badge> },
              { key: "mode", header: "MODE", width: "10%" },
              { key: "pin", header: "", width: "8%", render: (h) => <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setHistory((list) => list.map((x) => (x.id === h.id ? { ...x, pinned: !x.pinned } : x))); }}>{h.pinned ? "Unpin" : "Pin"}</button> },
            ]} rows={[...history].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))} rowKey={(h) => h.id} onRowClick={(h) => setValue(h.text)} empty="No history yet · statements you run are kept locally (raw responses are not persisted)" />}
            {lower === "request" && (current ? <div className="grid two-col" style={{ gap: 10 }}><CodeViewer source={JSON.stringify(current.request, null, 2)} lang="json" title="Request" maxHeight={260} wrap /><CodeViewer source={JSON.stringify(current.response, null, 2).slice(0, 12_000)} lang="json" title="Response (truncated view)" maxHeight={260} wrap /></div> : <Notice tone="info">Run a statement to inspect its raw request and response.</Notice>)}
          </div>
          <div className="card-footer"><span>Result schema preserved · TIMESTAMP ISO + raw µs · DECIMAL string</span><span className="muted">{history.length} in history</span></div>
        </section>
      </div>
    </div>
  );
}
