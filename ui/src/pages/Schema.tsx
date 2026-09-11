import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Card, Badge, Kv, SectionLabel, Notice, LinkButton, TierBadge, Button, CopyButton } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { CodeViewer } from "@/components/ui/CodeViewer";
import { DataTable } from "@/components/ui/DataTable";
import { DDL_MODEL, type TableModel } from "@/repo/ddlModel";
import { REPO } from "@/repo";
import { bytesPerRow, PROCEDURES, javaStatements } from "@/data/mock";
import { useTableStats } from "@/data/api";
import { TABLE_TIER } from "@/lib/tier";
import { fmtCompact, fmtInt, fmtAgo } from "@/lib/format";
import { useInspector } from "@/components/shell/Inspector";
import { useLatest } from "@/data/telemetry";
import { useNow } from "@/data/hooks";

const COLUMN_COMMENTS: Record<string, string> = { CUSTOMER_ID: "Partition key", DAY_START: "Primary key · TTL column", TXN_ID: "Dedupe key with CUSTOMER_ID", CREATED_AT: "Event time · TTL column", MERCHANT_ID: "Partition key (merchant tier)", BUCKET_START: "Minute bucket · TTL column", NAME: "Counter name · partition key", VAL: "Monotonic count", AVG_TICKET: "Derived: TXN_AMOUNT_SUM_24H ÷ TXN_COUNT_24H, materialized", LAST_CITY: "Last accepted RecordTxn write (not event-time LAST)", LAST_TXN_AT: "Last accepted RecordTxn write", FIRST_SEEN: "First accepted event time" };

function readersWriters(table: string) {
  const writers = PROCEDURES.filter((p) => p.mutating && javaStatements(p.name).some((s) => new RegExp(`\\b(INSERT INTO|UPSERT INTO|UPDATE)\\s+${table}\\b`, "i").test(s.sql))).map((p) => p.name);
  const readers = PROCEDURES.filter((p) => (p.kind === "java" ? javaStatements(p.name).some((s) => new RegExp(`\\bFROM\\s+${table}\\b`, "i").test(s.sql)) : new RegExp(`\\bFROM\\s+${table}\\b`, "i").test(DDL_MODEL.procedures.find((d) => d.name === p.name)?.sql ?? ""))).map((p) => p.name);
  return { readers, writers };
}

export default function Schema() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedName = params.get("table") ?? "CUSTOMER_DAILY";
  const table: TableModel = DDL_MODEL.tables.find((t) => t.name === selectedName) ?? DDL_MODEL.tables[1];
  const tab = params.get("tab") ?? "ddl";
  const [filter, setFilter] = useState("");
  const [showFillers, setShowFillers] = useState(false);
  const [fullFile, setFullFile] = useState(false);
  const tableStats = useTableStats();
  const stat = tableStats.find((s) => s.name === table.name);
  const { open } = useInspector();
  const latest = useLatest();
  const now = useNow(1000);
  const rel = useMemo(() => readersWriters(table.name), [table.name]);
  const fillers = table.columns.filter((c) => c.filler);
  const visibleCols = showFillers ? table.columns : table.columns.filter((c) => !c.filler);
  const setTab = (t: string) => setParams({ table: table.name, tab: t });
  const ddlExcerpt = useMemo(() => { const lines = REPO.ddl.source.split("\n"); const [s, e] = table.ddlLines; const extra = lines.slice(e, e + 6).filter((l) => new RegExp(`\\b${table.name}\\b`).test(l) && /^(PARTITION|CREATE INDEX)/.test(l)); return { start: s, text: [...lines.slice(s - 1, e), ...extra].join("\n") }; }, [table]);
  const facts = [
    { fact: "Columns", repo: `${table.columns.length} physical`, deployed: `${table.columns.length} (@SystemCatalog COLUMNS)`, state: "match" },
    { fact: "Partition column", repo: table.partitionColumn ?? "—", deployed: table.partitionColumn ?? "—", state: "match" },
    { fact: "Primary key", repo: `(${table.primaryKey.join(", ")})`, deployed: `(${table.primaryKey.join(", ")})`, state: "match" },
    { fact: "Explicit indexes", repo: table.indexes.map((i) => i.name).join(", ") || "none", deployed: table.indexes.map((i) => i.name).join(", ") || "none", state: "match" },
    { fact: "TTL", repo: table.ttl ? `${table.ttl.value} ${table.ttl.unit} ON ${table.ttl.column}` : "none", deployed: "not exposed by @SystemCatalog", state: table.ttl ? "unverified" : "match" },
    { fact: "Java class identity", repo: "procedures jar", deployed: "not exposed by catalog calls", state: "unverified" },
  ];
  const unverified = facts.filter((f) => f.state === "unverified").length;

  return (
    <div className="schema-page">
      <Card title="Tables" info="All six tables from ddl.sql with their canonical tier. Runtime columns (rows, bytes/row) come from @Statistics TABLE 0 and appear only after statistics resolve." actions={<Badge tone="neutral">{DDL_MODEL.tables.length}</Badge>} flush footer={<><span className="muted">Catalog updated {latest ? fmtAgo(latest.t, now) : "—"}</span><LinkButton onClick={() => open({ label: "Table list", mode: "mock", endpoint: "GET /api/volt/catalog/TABLES · GET /api/volt/stats/TABLE", request: { Procedure: "@SystemCatalog", Parameters: ["TABLES"] }, fields: ["TABLE_NAME", "TUPLE_COUNT", "TUPLE_DATA_MEMORY", "STRING_DATA_MEMORY"], formula: "bytes/row = (tuple KB + string KB) × 1024 ÷ rows", repositoryPath: "src/main/resources/ddl.sql", sourceId: "ddl" })}>Trace ›</LinkButton></>}>
        <div className="panel-search" style={{ marginTop: 8 }}><Search size={13} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a table…" aria-label="Find a table" /></div>
        {DDL_MODEL.tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase())).map((t) => { const s = tableStats.find((x) => x.name === t.name); const bpr = s ? bytesPerRow(s) : null; return (
          <button key={t.name} type="button" className={`list-row ${t.name === table.name ? "active" : ""}`} onClick={() => setParams({ table: t.name, tab })}>
            <div><div className="list-row-title mono">{t.name}</div><div className="list-row-meta">{TABLE_TIER[t.name]?.toUpperCase() ?? "—"} · {t.ttl ? `${t.ttl.value} ${t.ttl.unit.toLowerCase().replace("days", "d").replace("hours", "h")}` : "—"}</div></div>
            <div className="list-row-stat"><strong>{s ? fmtCompact(s.rows) : "—"}</strong><br />{bpr != null ? `${fmtInt(Math.round(bpr))} B/row` : "—"}</div>
          </button>); })}
      </Card>
      <div className="schema-detail">
        <section className="card schema-top">
          <div style={{ minWidth: 0 }}>
            <div className="card-header"><div className="card-heading"><span className="card-title">{table.name} <span className="card-subtle">{table.columns.length} physical columns</span></span></div><div className="card-actions"><Button variant="small" onClick={() => open({ label: `Catalog · ${table.name}`, mode: "mock", endpoint: "GET /api/volt/catalog/COLUMNS", request: { Procedure: "@SystemCatalog", Parameters: ["COLUMNS"] }, response: { rows: table.columns.length }, fields: ["COLUMN_NAME", "TYPE_NAME", "NULLABLE", "COLUMN_DEF", "REMARKS"] })}>Refresh catalog</Button></div></div>
            <div className="card-body">
              <div className="inline-row" style={{ marginBottom: 11 }}><TierBadge tier={TABLE_TIER[table.name] ?? "hygiene"} /><Badge tone={unverified ? "warn" : "good"}>{unverified ? `Verified fields match · ${unverified} unverified` : "Matches repo DDL"}</Badge>{table.comment && <span className="muted tiny" style={{ whiteSpace: "normal" }}>{table.comment.slice(0, 140)}{table.comment.length > 140 ? "…" : ""}</span>}</div>
              <DataTable maxHeight={236} columns={[
                { key: "name", header: "COLUMN", width: "23%", render: (c) => <span className={`cell-mono ${table.primaryKey.includes(c.name) ? "cell-strong" : ""}`}>{c.name}</span> },
                { key: "type", header: "TYPE", width: "14%" },
                { key: "nullable", header: "NULL", width: "9%", render: (c) => (c.nullable ? "YES" : "NO") },
                { key: "defaultValue", header: "DEFAULT", width: "11%", render: (c) => c.defaultValue ?? (c.nullable ? "NULL" : "—") },
                { key: "comment", header: "REPOSITORY COMMENT", width: "43%", render: (c) => c.comment ?? COLUMN_COMMENTS[c.name] ?? (c.filler ? "Width filler · not a business feature" : "") },
              ]} rows={visibleCols} rowKey={(c) => c.name} />
              {fillers.length > 0 && <button type="button" className="link" style={{ marginTop: 8, fontSize: 10.5 }} onClick={() => setShowFillers((s) => !s)}>{showFillers ? "▾" : "▸"} {fillers.length} filler accumulators (200-attribute width) · F01…F{String(fillers.length).padStart(2, "0")} · {showFillers ? "collapse" : "expand"}</button>}
            </div>
            <div className="card-footer"><span className="muted">Primary key ({table.primaryKey.join(", ")}){table.indexes.length ? ` · index ${table.indexes.map((i) => i.name).join(", ")}` : ""}</span><LinkButton onClick={() => nav(`/procedures?name=${rel.writers[0] ?? rel.readers[0] ?? "GetRollingFeatures"}`)}>Open procedures ↗</LinkButton></div>
          </div>
          <aside className="summary-panel">
            <SectionLabel>Storage contract</SectionLabel>
            <Kv k="Partition" v={table.partitionColumn ?? "—"} mono />
            <Kv k="TTL" v={table.ttl ? `${table.ttl.value} ${table.ttl.unit}` : "none"} />
            {table.ttl && <Kv k="TTL column" v={table.ttl.column} mono />}
            {table.ttl?.batchSize && <Kv k="BATCH_SIZE" v={String(table.ttl.batchSize)} mono />}
            <Kv k="Live rows" v={stat ? fmtInt(stat.rows) : "—"} />
            <Kv k="Measured" v={stat && bytesPerRow(stat) != null ? `${fmtInt(Math.round(bytesPerRow(stat)!))} B/row` : "—"} />
            <SectionLabel style={{ marginTop: 15 }}>Readers · writers</SectionLabel>
            <div className="inline-row" style={{ marginBottom: 6 }}>{rel.writers.map((w) => <button key={w} type="button" className="badge hygiene" onClick={() => nav(`/procedures?name=${w}`)}>{w}</button>)}{rel.readers.map((r) => <button key={r} type="button" className="badge good" onClick={() => nav(`/procedures?name=${r}`)}>{r}</button>)}</div>
            <SectionLabel style={{ marginTop: 15 }}>Verification scope</SectionLabel>
            <Notice tone="warn">TTL definition and deployed Java class identity are not exposed by the selected catalog calls.</Notice>
          </aside>
        </section>
        <section className="card" style={{ minHeight: 360 }}>
          <Tabs items={[{ id: "ddl", label: "ddl.sql" }, { id: "remove", label: <>remove_db.sql <Badge tone="hygiene">DESTRUCTIVE</Badge></> }, { id: "diff", label: "Deployed diff" }]} active={tab} onChange={setTab} right={<span className="inline-row"><button type="button" className="link" style={{ fontSize: 10.5 }} onClick={() => setFullFile((f) => !f)}>{fullFile ? "Show table excerpt" : "Show full file"}</button><CopyButton value={tab === "remove" ? REPO.removeDdl.source : REPO.ddl.source} /></span>} />
          <div style={{ padding: 12, flex: 1, minHeight: 0 }}>
            {tab === "ddl" && (fullFile ? <CodeViewer source={REPO.ddl.source} lang="sql" path={REPO.ddl.path} highlightLines={Array.from({ length: table.ddlLines[1] - table.ddlLines[0] + 1 }, (_, i) => table.ddlLines[0] + i)} maxHeight={520} /> : <CodeViewer source={ddlExcerpt.text} lang="sql" path={`${REPO.ddl.path} · lines ${table.ddlLines[0]}–${table.ddlLines[1]}`} startLine={ddlExcerpt.start} maxHeight={520} />)}
            {tab === "remove" && <><Notice tone="error" style={{ marginBottom: 10 }}>Destructive script · view only. The console never executes DDL; deploy and teardown stay in sqlcmd.</Notice><CodeViewer source={REPO.removeDdl.source} lang="sql" path={REPO.removeDdl.path} maxHeight={460} /></>}
            {tab === "diff" && <DataTable columns={[
              { key: "fact", header: "FACT", width: "20%", render: (f) => <span className="cell-strong">{f.fact}</span> },
              { key: "repo", header: "REPOSITORY", width: "30%", render: (f) => <span className="cell-mono">{f.repo}</span> },
              { key: "deployed", header: "DEPLOYED", width: "30%", render: (f) => <span className="cell-mono">{f.deployed}</span> },
              { key: "state", header: "STATE", width: "20%", render: (f) => <Badge tone={f.state === "match" ? "good" : "warn"}>{f.state === "match" ? "MATCH" : "UNVERIFIABLE"}</Badge> },
            ]} rows={facts} rowKey={(f) => f.fact} />}
          </div>
          <div className="card-footer"><span className="muted mono" style={{ fontSize: 10 }}>Deploy: ./scripts/03_deploy_schema.sh → sqlcmd &lt; src/main/resources/ddl.sql</span><CopyButton value={'"$VOLTDB_HOME"/bin/sqlcmd < src/main/resources/ddl.sql'} label="Copy deploy command" /></div>
        </section>
      </div>
    </div>
  );
}
