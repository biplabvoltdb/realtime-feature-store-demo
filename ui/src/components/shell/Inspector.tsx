import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Drawer } from "@/components/ui/Overlay";
import { Tabs } from "@/components/ui/Tabs";
import { Badge, Kv, SectionLabel, CopyButton } from "@/components/ui/primitives";
import { CodeViewer } from "@/components/ui/CodeViewer";
import type { ExecResponse } from "@/lib/volt";
import { REPO } from "@/repo";

/** Trace attached to every metric/result: what produced it, with the raw transport payloads. */
export type Trace = {
  label: string; mode: "mock" | "live" | "repo"; endpoint: string; request?: unknown; response?: unknown;
  fields?: string[]; formula?: string; repositoryPath?: string; caveat?: string; collectedAt?: string;
  timing?: { bffRoundTripMs: number; upstreamMs?: number }; sourceId?: string;
};
export function traceFromResponse(label: string, r: ExecResponse, extra: Partial<Trace> = {}): Trace {
  const req = r.request as { url?: string } | undefined;
  return { label, mode: r.source, endpoint: req?.url ?? "POST /api/volt/call", request: r.request, response: r.response, collectedAt: r.capturedAt, timing: r.timing, caveat: r.warnings?.join(" "), ...extra };
}

type Ctx = { open: (t: Trace) => void; close: () => void };
const InspectorContext = createContext<Ctx | null>(null);
export const useInspector = () => { const c = useContext(InspectorContext); if (!c) throw new Error("InspectorProvider missing"); return c; };

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [tab, setTab] = useState("summary");
  const open = useCallback((t: Trace) => { setTrace(t); setTab("summary"); }, []);
  const close = useCallback(() => setTrace(null), []);
  const value = useMemo(() => ({ open, close }), [open, close]);
  const src = trace?.sourceId ? REPO[trace.sourceId] : undefined;
  return (
    <InspectorContext.Provider value={value}>
      {children}
      <Drawer open={!!trace} title={trace ? <span>Request inspector · {trace.label}</span> : ""} subtitle={trace?.endpoint} onClose={close} actions={trace && <Badge tone={trace.mode === "mock" ? "mock" : trace.mode === "repo" ? "neutral" : "good"}>{trace.mode.toUpperCase()}</Badge>}>
        {trace && (
          <>
            <Tabs items={[{ id: "summary", label: "Summary" }, { id: "request", label: "Request" }, { id: "response", label: "Response" }, { id: "formula", label: "Formula", disabled: !trace.formula }, { id: "source", label: "Source", disabled: !src }]} active={tab} onChange={setTab} />
            {tab === "summary" && (
              <div className="drawer-section" style={{ borderTop: "none" }}>
                <SectionLabel>Source</SectionLabel>
                <Kv k="Mode" v={trace.mode === "mock" ? "Mock fixture · not connected to a cluster" : trace.mode === "repo" ? "Repository file · exact text" : "Live VoltDB"} />
                <Kv k="Endpoint" v={trace.endpoint} mono />
                {trace.collectedAt && <Kv k="Collected" v={trace.collectedAt} mono />}
                {trace.timing && <Kv k="Timing" v={`BFF round trip ${trace.timing.bffRoundTripMs} ms${trace.timing.upstreamMs != null ? ` · upstream ${trace.timing.upstreamMs} ms` : ""} · server elapsed —`} />}
                {trace.repositoryPath && <Kv k="Repository" v={trace.repositoryPath} mono />}
                {trace.fields && <><SectionLabel style={{ marginTop: 14 }}>Fields used</SectionLabel><div className="inline-row">{trace.fields.map((f) => <span key={f} className="badge neutral mono">{f}</span>)}</div></>}
                {trace.caveat && <div className="notice warn" style={{ marginTop: 14 }}><span className="notice-icon">!</span><span>{trace.caveat}</span></div>}
                <div className="notice info" style={{ marginTop: 14 }}><span className="notice-icon">i</span><span>Server elapsed is shown only when a live response supplies it; the VoltDB JSON API contract does not guarantee a per-call duration.</span></div>
              </div>
            )}
            {tab === "request" && <JsonBlock value={trace.request ?? { note: "No request payload — derived client-side" }} />}
            {tab === "response" && <JsonBlock value={trace.response ?? { note: "No response payload" }} />}
            {tab === "formula" && trace.formula && <div className="drawer-section" style={{ borderTop: "none" }}><div className="formula">{trace.formula}</div></div>}
            {tab === "source" && src && <div style={{ padding: 12 }}><CodeViewer source={src.source} lang={src.lang} path={src.path} maxHeight="calc(100vh - 160px)" /></div>}
          </>
        )}
      </Drawer>
    </InspectorContext.Provider>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const truncated = text.length > 60_000 ? `${text.slice(0, 60_000)}\n… (${text.length - 60_000} more characters)` : text;
  return <div><div className="code-toolbar" style={{ background: "#fff" }}><span>{text.length.toLocaleString()} characters</span><CopyButton value={text} /></div><pre className="json-view" style={{ margin: 0 }}>{truncated}</pre></div>;
}

export function TraceLink({ trace, label = "Show request" }: { trace: Trace | null | undefined; label?: string }) {
  const { open } = useInspector();
  return <button type="button" className="link" disabled={!trace} onClick={() => trace && open(trace)} style={{ opacity: trace ? 1 : .5 }}>{label}</button>;
}
