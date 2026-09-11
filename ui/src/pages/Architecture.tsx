import { useMemo, useState } from "react";
import { Maximize2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, Chip, Badge, Kv, SectionLabel, Notice, LinkButton, TierBadge } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Overlay";
import { Tabs } from "@/components/ui/Tabs";
import { CodeViewer } from "@/components/ui/CodeViewer";
import { DataTable } from "@/components/ui/DataTable";
import { ArchitectureDiagram, ARCH_NODES, nodeSourceExcerpt } from "@/components/domain/ArchitectureDiagram";
import { useLatest, useTelemetry } from "@/data/telemetry";
import { useInspector } from "@/components/shell/Inspector";
import { fmtAgo } from "@/lib/format";
import { useNow } from "@/data/hooks";
import { useTableStats } from "@/data/api";
import { REPO } from "@/repo";

const TIER_ROWS = [
  { tier: "hot" as const, name: "Customer hot", storage: "TXN_RAW", retention: "7 d", serves: "Exact aggregates from raw events; minute-aligned procedure cutoff" },
  { tier: "warm" as const, name: "Customer warm", storage: "CUSTOMER_DAILY", retention: "90 d", serves: "Long windows; live leading edge, day-granular trailing edge" },
  { tier: "life" as const, name: "Lifetime", storage: "CUSTOMER_PROFILE", retention: "∞", serves: "Last accepted write, lifetime totals, materialized AVG_TICKET" },
  { tier: "merchant" as const, name: "Merchant", storage: "MERCHANT_MINUTE + MERCHANT_TXN_SEEN", retention: "7 d / 48 h", serves: "Minute-exact merchant windows" },
  { tier: "hygiene" as const, name: "Ingest hygiene", storage: "COUNTERS + novapay-txn-dlq", retention: "—", serves: "Unparseable / missing-key / late events dead-lettered or dropped and counted" },
];

export default function Architecture() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("node") ?? "voltsp";
  const node = ARCH_NODES.find((n) => n.id === selectedId) ?? ARCH_NODES[2];
  const [view, setView] = useState<"live" | "contract" | "partition">("live");
  const [tab, setTab] = useState("runtime");
  const [expanded, setExpanded] = useState(false);
  const latest = useLatest();
  const { samples } = useTelemetry();
  const now = useNow(1000);
  const tableStats = useTableStats();
  const ctx = { latest, hasRates: samples.length >= 1, view, tableStats };
  const excerpt = useMemo(() => nodeSourceExcerpt(node), [node]);
  const { open } = useInspector();
  const precision = useMemo(() => { const m = /## Precision statement[^\n]*\n\n([\s\S]*?)\n\n## /.exec(REPO.readme.source); return m ? m[1].replace(/\s+/g, " ") : ""; }, []);

  return (
    <>
      <div className="toolbar">
        <div className="chip-list">
          <Chip label="Live rates" dot="green" selected={view === "live"} onClick={() => setView("live")} />
          <Chip label="Repository contract" dot="slate" selected={view === "contract"} onClick={() => setView("contract")} />
          <Chip label="Partition paths" dot="blue" selected={view === "partition"} onClick={() => setView("partition")} />
        </div>
        <div className="inline-row"><span className="muted tiny">Updated {latest ? fmtAgo(latest.t, now) : "—"}</span><LinkButton className="small-control" onClick={() => open({ label: "Architecture sources", mode: "repo", endpoint: "GET /api/repo/source/README · /api/repo/config · /api/repo/scripts", repositoryPath: "README.md · config/pipeline-config.yaml · scripts/01_create_topic.sh", sourceId: "config", request: { files: ["README.md", "config/pipeline-config.yaml", "scripts/01_create_topic.sh"] }, caveat: "Partition counts come from the topic script; names, group and lateness come from pipeline-config.yaml." })}>Open source map ↗</LinkButton></div>
      </div>
      <div className="architecture-layout">
        <Card title="Kafka → VoltSP → VoltDB" info="Semantic SVG: every node is a focusable button and edges have text equivalents. Live rates are overlays; zero is Idle only after two valid samples." actions={<button type="button" className="small-control" style={{ minHeight: 28 }} onClick={() => setExpanded(true)} aria-label="Expand diagram to full screen"><Maximize2 size={13} /> Expand</button>} flush>
          <div className="architecture-stage" style={{ padding: "12px 8px 4px" }}><ArchitectureDiagram selected={node.id} onSelect={(id) => setParams({ node: id })} ctx={ctx} /></div>
          <ol className="sr-only">{ARCH_NODES.map((n) => <li key={n.id}>{n.title}: {n.meta(ctx)}</li>)}</ol>
        </Card>
        <Card title={node.id === "voltsp" ? "novapay-txn-feature-ingest-v4" : node.title} info="Node details: runtime from statistics, contract from repository files, source excerpt with line numbers, and the trace of every call used." actions={<Badge tone="hot">SELECTED</Badge>} flush>
          <Tabs items={[{ id: "runtime", label: "Runtime" }, { id: "contract", label: "Contract" }, { id: "source", label: "Source", disabled: !excerpt }, { id: "trace", label: "Trace" }]} active={tab} onChange={setTab} />
          {tab === "runtime" && <div className="drawer-section" style={{ borderTop: "none" }}><SectionLabel>Runtime</SectionLabel>{node.runtime(ctx).map(([k, v]) => <Kv key={k} k={k} v={v === "FLOWING" ? <Badge tone="good">FLOWING</Badge> : v} />)}{node.tier && <Kv k="Tier" v={<TierBadge tier={node.tier} />} />}{!ctx.hasRates && <Notice tone="info" style={{ marginTop: 10 }}>Rates require two statistics samples. Values render — until then.</Notice>}</div>}
          {tab === "contract" && <div className="drawer-section" style={{ borderTop: "none" }}><SectionLabel>{node.id === "voltsp" ? "Pipeline contract" : "Repository contract"}</SectionLabel>{node.contract.map(([k, v]) => <Kv key={k} k={k} v={v} mono />)}{node.caveat && <Notice tone="warn" style={{ marginTop: 10 }}>{node.caveat}</Notice>}{node.table && <div style={{ marginTop: 10 }}><LinkButton onClick={() => nav(`/schema?table=${node.table}`)}>Open in Schema & DDL ›</LinkButton></div>}{node.procedure && <div style={{ marginTop: 10 }}><LinkButton onClick={() => nav(`/procedures?name=${node.procedure}`)}>Open in Procedures ›</LinkButton></div>}</div>}
          {tab === "source" && excerpt && <div className="drawer-section" style={{ borderTop: "none" }}><SectionLabel>Source</SectionLabel><CodeViewer source={excerpt.text} lang={excerpt.lang} path={excerpt.path} startLine={excerpt.start} highlightLines={[excerpt.highlight]} actions={<button type="button" onClick={() => open({ label: excerpt.path, mode: "repo", endpoint: `GET /api/repo/source/${node.source!.id}`, repositoryPath: excerpt.path, sourceId: node.source!.id })}>Open full ↗</button>} /></div>}
          {tab === "trace" && <div className="drawer-section" style={{ borderTop: "none" }}><SectionLabel>Calls behind this node</SectionLabel><Kv k="Rates" v="@Statistics PROCEDURE 0 · INVOCATIONS deltas" mono />{node.table && <Kv k="Rows" v="@Statistics TABLE 0 · TUPLE_COUNT sum" mono />}{(node.id === "dlq" || node.id === "bump") && <Kv k="Counters" v="exec GetCounters" mono />}<Kv k="Contract" v={node.source ? REPO[node.source.id].path : "README.md"} mono /><div style={{ marginTop: 10 }}><LinkButton onClick={() => open({ label: node.title, mode: "mock", endpoint: "GET /api/volt/stats/PROCEDURE", request: { Procedure: "@Statistics", Parameters: ["PROCEDURE", 0] }, response: latest ? { sampleAt: new Date(latest.t).toISOString(), ingest: latest.ingest, rejected: latest.rejected } : null, fields: ["INVOCATIONS", "TIMESTAMP"], formula: "rate = ΔINVOCATIONS ÷ Δseconds between two samples", sourceId: node.source?.id })}>Show request</LinkButton></div></div>}
        </Card>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.7fr) minmax(360px,420px)" }}>
        <Card title="Tier design" info="README tier table; identifiers unchanged and linked to Schema or Procedures." source="README.md · The tier design">
          <DataTable columns={[
            { key: "tier", header: "TIER", width: "20%", render: (r: typeof TIER_ROWS[number]) => <span className="inline-row" style={{ flexWrap: "nowrap" }}><TierBadge tier={r.tier} /> {r.name}</span> },
            { key: "storage", header: "STORAGE", width: "30%", render: (r) => <span className="cell-mono link" style={{ cursor: "pointer" }} onClick={() => nav(`/schema?table=${r.storage.split(" ")[0]}`)}>{r.storage}</span> },
            { key: "retention", header: "RETENTION", width: "12%" },
            { key: "serves", header: "SERVES", width: "38%", className: "" },
          ]} rows={TIER_ROWS} rowKey={(r) => r.tier} />
        </Card>
        <Card title="Precision & why tiers" info="Repository wording with a flagged discrepancy: README says exact to the second while GetRollingFeatures floors the cutoff to the minute." actions={<LinkButton onClick={() => open({ label: "README precision statement", mode: "repo", endpoint: "GET /api/repo/source/README", repositoryPath: "README.md", sourceId: "readme", caveat: "GetRollingFeatures floors the cutoff to the minute (nowMs - nowMs % 60_000)." })}>Open source ↗</LinkButton>}>
          <Notice tone="warn"><strong>Exact aggregates from raw events · minute-aligned cutoff.</strong><br />README says “exact to the second”; GetRollingFeatures floors the cutoff to the minute.</Notice>
          <div className="grid two-col" style={{ gap: 10, marginTop: 12 }}>
            <div className="stat-tile"><div className="label">CUSTOMERS</div><div className="value">0.94</div><div className="label">bucket / event</div></div>
            <div className="stat-tile"><div className="label">MERCHANTS</div><div className="value">~50:1</div><div className="label">bucket compression</div></div>
          </div>
          {precision && <p className="muted" style={{ fontSize: 10, lineHeight: 1.5, margin: "12px 0 0" }}>“{precision}”</p>}
          <div className="muted tiny" style={{ marginTop: 10 }}>Partition counts traced to scripts/01_create_topic.sh · names and lateness traced to pipeline-config.yaml</div>
        </Card>
      </div>
      <Modal open={expanded} title="Kafka → VoltSP → VoltDB" subtitle="Full-screen view · every node is clickable · Esc or ✕ to close" onClose={() => setExpanded(false)}>
        <div className="architecture-stage"><ArchitectureDiagram selected={node.id} onSelect={(id) => setParams({ node: id })} ctx={ctx} /></div>
      </Modal>
    </>
  );
}
