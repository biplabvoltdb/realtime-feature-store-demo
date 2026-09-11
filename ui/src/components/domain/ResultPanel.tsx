import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { VoltTableView } from "@/components/ui/DataTable";
import { Notice, Button, EmptyState } from "@/components/ui/primitives";
import type { ExecResponse, VoltTable } from "@/lib/volt";
import { tableToCsv, tableToMarkdown, downloadText, copyText } from "@/lib/csv";
import { useSettings } from "@/data/settings";
import { fmtInt } from "@/lib/format";
import { Download, Copy } from "lucide-react";

export type ExtraTab = { id: string; label: ReactNode; content: ReactNode };

/** One tab per returned VoltTable (schema-first), plus caller-provided tabs such as Plan, Source, History. */
export function ResultPanel({ response, loading, extras = [], emptyTitle = "Run a statement to see results", emptyDetail, footerLeft, footerRight, maxRows = 200, maxHeight, defaultTab }: {
  response: ExecResponse | null; loading?: boolean; extras?: ExtraTab[]; emptyTitle?: string; emptyDetail?: ReactNode; footerLeft?: ReactNode; footerRight?: ReactNode; maxRows?: number; maxHeight?: number; defaultTab?: string;
}) {
  const { toast } = useSettings();
  const tables = response?.ok ? response.results : [];
  const items = useMemo<TabItem[]>(() => [
    ...(tables.length === 0 ? [{ id: "results", label: "Results" }] : []),
    ...tables.map((t, i) => ({ id: `t${i}`, label: t.name ?? `Result ${i + 1}`, badge: t.rows.length === 1 && t.columns.length === 1 && typeof t.rows[0][0] === "number" ? fmtInt(t.rows[0][0] as number) : undefined })),
    ...extras.map((e) => ({ id: e.id, label: e.label })),
  ], [tables, extras]);
  const [active, setActive] = useState(defaultTab ?? items[0]?.id ?? "");
  useEffect(() => { if (!items.find((i) => i.id === active)) setActive(defaultTab && items.find((i) => i.id === defaultTab) ? defaultTab : items[0]?.id ?? ""); }, [items, active, defaultTab]);
  useEffect(() => { if (response?.ok && tables.length) setActive("t0"); }, [response]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeTable: VoltTable | undefined = active.startsWith("t") ? tables[Number(active.slice(1))] : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <Tabs items={items.length ? items : [{ id: "none", label: "Results" }]} active={items.length ? active : "none"} onChange={setActive} right={activeTable && (
        <span style={{ display: "inline-flex", gap: 10 }}>
          <Button variant="small" icon={Download} style={{ minHeight: 26, fontSize: 10.5 }} onClick={() => downloadText(`${activeTable.name ?? "result"}.csv`, tableToCsv(activeTable), "text/csv")}>Export CSV</Button>
          <Button variant="small" icon={Copy} style={{ minHeight: 26, fontSize: 10.5 }} onClick={async () => { toast((await copyText(tableToMarkdown(activeTable))) ? "Markdown copied" : "Clipboard unavailable"); }}>Copy Markdown</Button>
        </span>
      )} />
      {response && (
        <div className="result-summary">
          {loading && <span className="busy-dot" />}
          {response.ok ? <><strong>{response.results.length} result set{response.results.length === 1 ? "" : "s"}</strong><span>·</span><span>{fmtInt(response.results.reduce((a, t) => a + t.rows.length, 0))} rows</span><span>·</span><span>BFF round trip {response.timing.bffRoundTripMs} ms{response.timing.upstreamMs != null && ` · upstream ${response.timing.upstreamMs} ms`}</span><span>·</span><span>server elapsed —</span><span>·</span><span className="badge mock">{response.source.toUpperCase()}</span></> : <span style={{ color: "var(--red)" }}>Call failed</span>}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {response && !response.ok && <div style={{ padding: 14 }}><Notice tone="error"><strong>statusstring:</strong> {response.statusstring}</Notice></div>}
        {response?.warnings?.map((w) => <div key={w} style={{ padding: "10px 14px 0" }}><Notice tone="mock">{w}</Notice></div>)}
        {!response && !loading && (active === "results" || active === "none") && <EmptyState title={emptyTitle} detail={emptyDetail} minHeight={160} />}
        {!response && loading && (active === "results" || active === "none") && <div style={{ padding: 16, display: "grid", gap: 8 }}><div className="skeleton" style={{ height: 14 }} /><div className="skeleton" style={{ height: 14, width: "70%" }} /><div className="skeleton" style={{ height: 14, width: "85%" }} /></div>}
        {activeTable && <div style={{ padding: "6px 14px 10px" }}><VoltTableView table={activeTable} maxRows={maxRows} maxHeight={maxHeight} /></div>}
        {extras.find((e) => e.id === active)?.content}
      </div>
      {(footerLeft || footerRight) && <div className="card-footer"><span>{footerLeft}</span><span>{footerRight}</span></div>}
    </div>
  );
}
