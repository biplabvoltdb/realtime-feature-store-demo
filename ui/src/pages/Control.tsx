import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square, RotateCcw } from "lucide-react";
import { Badge, Button, Card, Kv, Notice, SectionLabel } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/Overlay";
import { useSettings } from "@/data/settings";
import { controlAction, controlLog, controlResetStatus, controlStatus, unlockOnServer, type ControlStatus, type ResetJob } from "@/data/api";
import { fmtTime } from "@/lib/format";

const STEP_TONE = { pending: "neutral", running: "warn", ok: "good", failed: "hygiene", skipped: "neutral" } as const;

export default function Control() {
  const { settings, readOnly, unlockToken, unlockWrites, toast } = useSettings();
  const live = settings.dataMode === "live";
  const [status, setStatus] = useState<ControlStatus | null>(null);
  const [reset, setReset] = useState<ResetJob | null>(null);
  const [logs, setLogs] = useState<{ loadgen: string[]; querybench: string[] }>({ loadgen: [], querybench: [] });
  const [eps, setEps] = useState(2000);
  const [customers, setCustomers] = useState(100000);
  const [qps, setQps] = useState(500);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockConfirm, setUnlockConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const refresh = useCallback(async () => {
    if (!live) return;
    const [s, r, lg, qb] = await Promise.all([controlStatus(), controlResetStatus(), controlLog("loadgen"), controlLog("querybench")]);
    if (s.ok && s.data) setStatus(s.data);
    if (r.ok && r.data) setReset(r.data);
    setLogs({ loadgen: lg.data?.lines ?? [], querybench: qb.data?.lines ?? [] });
  }, [live]);

  useEffect(() => {
    let stop = false;
    const tick = async () => { await refresh(); if (!stop) timer.current = setTimeout(tick, reset?.state === "running" ? 1500 : 3000); };
    void tick();
    return () => { stop = true; clearTimeout(timer.current); };
  }, [refresh, reset?.state]);

  const act = async (label: string, path: string, method: "POST" | "DELETE", body?: unknown) => {
    setBusy(label);
    const r = await controlAction(path, method, body, unlockToken);
    setBusy(null);
    toast(r.ok ? `${label}: ok` : `${label} failed: ${r.error}`);
    await refresh();
    return r.ok;
  };
  const doUnlock = async () => {
    const r = await unlockOnServer();
    if ("error" in r) { toast(`Unlock failed: ${r.error}`); return; }
    unlockWrites(r.token);
    toast(`Writes unlocked until ${fmtTime(Date.parse(r.expiresAt))}`);
    setUnlockOpen(false);
  };

  if (!live) return <Notice tone="mock" style={{ margin: 18 }}>Demo Control drives real processes and is available in <strong>Live cluster</strong> mode only. Switch it on under Settings → Review mode.</Notice>;

  const resetRunning = reset?.state === "running";
  const anyBusy = busy !== null || resetRunning;

  return (
    <>
      <div className="toolbar">
        <div className="inline-row" style={{ gap: 8 }}>
          <StatusBadge label="VoltSP pipeline" on={status?.pipeline.running ?? false} err={status?.pipeline.error} />
          <StatusBadge label="Loadgen" on={status?.loadgen.running ?? false} />
          <StatusBadge label="Query bench" on={status?.querybench.running ?? false} />
          {status && <span className="muted tiny">voltdb: {status.targets.voltdb} · voltsp: {status.targets.voltsp} · kafka: {status.targets.kafkaBootstrap}</span>}
        </div>
        {readOnly
          ? <Button variant="danger" onClick={() => { setUnlockConfirm(""); setUnlockOpen(true); }}>Unlock control…</Button>
          : <Badge tone="hygiene">UNLOCKED</Badge>}
      </div>
      {readOnly && <Notice tone="warn" style={{ margin: "0 0 14px" }}>The read-only guard is locked. Starting benchmarks or resetting the demo needs the same 15-minute write unlock as mutating SQL.</Notice>}

      <div className="settings-layout">
        <div className="settings-stack">
          <Card title="Load generator" subtitle="Kafka producer on this host" info="Runs TxnLoadGenerator from target/…-all.jar against the local broker. §7 edge cases (bad timestamps, missing keys, late events, retries) are injected automatically." flush>
            <div className="settings-group" style={{ paddingTop: 4 }}>
              <div className="inline-row" style={{ gap: 10, marginBottom: 10 }}>
                <label className="muted tiny">events/sec <input className="input mono" style={{ width: 90 }} type="number" value={eps} min={1} max={50000} onChange={(e) => setEps(Number(e.target.value))} /></label>
                <label className="muted tiny">customers <input className="input mono" style={{ width: 110 }} type="number" value={customers} min={1} onChange={(e) => setCustomers(Number(e.target.value))} /></label>
                {status?.loadgen.running
                  ? <Button variant="danger" icon={Square} disabled={anyBusy} onClick={() => act("Stop loadgen", "/api/control/loadgen", "DELETE")}>Stop</Button>
                  : <Button variant="primary" icon={Play} disabled={anyBusy || readOnly} onClick={() => act(`Start loadgen ${eps} eps`, "/api/control/loadgen", "POST", { eps, customers })}>Start</Button>}
              </div>
              <div className="inline-row" style={{ gap: 6, marginBottom: 10 }}>
                {[2000, 15000].map((v) => <Button key={v} variant="small" disabled={anyBusy || readOnly || status?.loadgen.running} onClick={() => { setEps(v); void act(`Start loadgen ${v} eps`, "/api/control/loadgen", "POST", { eps: v, customers }); }}>{v === 15000 ? "§8 peak · 15K eps" : "Demo · 2K eps"}</Button>)}
              </div>
              <LogTail lines={logs.loadgen} empty="No loadgen output yet — start it to see sent counts here." />
            </div>
          </Card>
          <Card title="Query bench" subtitle="Reads against VoltDB while ingest runs" info="Runs FeatureQueryBench (mixed hot/warm/merchant reads) from this host against the VoltDB client port. Latency percentiles print in the log tail." flush>
            <div className="settings-group" style={{ paddingTop: 4 }}>
              <div className="inline-row" style={{ gap: 10, marginBottom: 10 }}>
                <label className="muted tiny">queries/sec <input className="input mono" style={{ width: 90 }} type="number" value={qps} min={1} max={20000} onChange={(e) => setQps(Number(e.target.value))} /></label>
                {status?.querybench.running
                  ? <Button variant="danger" icon={Square} disabled={anyBusy} onClick={() => act("Stop query bench", "/api/control/querybench", "DELETE")}>Stop</Button>
                  : <Button variant="primary" icon={Play} disabled={anyBusy || readOnly} onClick={() => act(`Start query bench ${qps} qps`, "/api/control/querybench", "POST", { qps, customers })}>Start</Button>}
              </div>
              <LogTail lines={logs.querybench} empty="No query-bench output yet." />
            </div>
          </Card>
        </div>
        <div className="settings-stack">
          <Card title="Reset demo" subtitle="Back to zero, cleanly" info="Stops clients and the pipeline, deletes and recreates the Kafka topics AND the consumer group (stale group offsets after a topic recreation wedge the consumer), redeploys the batched DDL (wipes all VoltDB data), restarts the pipeline and verifies it subscribed." actions={<Badge tone={reset?.state === "ok" ? "good" : reset?.state === "failed" ? "hygiene" : "neutral"}>{(reset?.state ?? "idle").toUpperCase()}</Badge>} flush>
            <div className="settings-group" style={{ paddingTop: 4 }}>
              <Notice tone="warn" style={{ marginBottom: 12 }}><strong>Destructive.</strong> All rows in VoltDB and all Kafka topic data are deleted. The schema is redeployed from <span className="mono">src/main/resources/ddl.sql</span>.</Notice>
              <Button variant="danger" icon={RotateCcw} disabled={anyBusy || readOnly} onClick={() => { setConfirmText(""); setConfirmReset(true); }}>{resetRunning ? "Reset running…" : "Reset entire demo…"}</Button>
              {reset && reset.steps.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <SectionLabel>Steps {reset.startedAt && `· started ${fmtTime(Date.parse(reset.startedAt))}`}</SectionLabel>
                  {reset.steps.map((s) => (
                    <div key={s.id} style={{ margin: "7px 0" }}>
                      <Kv k={<span>{s.label}{s.ms != null && <span className="muted tiny"> · {(s.ms / 1000).toFixed(1)}s</span>}</span>} v={<Badge tone={STEP_TONE[s.state]}>{s.state.toUpperCase()}</Badge>} />
                      {(s.state === "failed" || (s.state === "ok" && s.id === "verify")) && s.output && <pre className="mono tiny" style={{ whiteSpace: "pre-wrap", margin: "3px 0 0", opacity: 0.75 }}>{s.output.split("\n").slice(-4).join("\n")}</pre>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
          <Notice tone="info">Benchmark processes started here keep running if you close the browser; this page re-attaches to them. The pipeline itself runs on the VoltSP host and is only touched by the reset.</Notice>
        </div>
      </div>

      <Dialog open={confirmReset} title="Reset the entire demo" onClose={() => setConfirmReset(false)}>
        <p>This deletes <strong>every row in VoltDB</strong>, both Kafka topics and the consumer group, then redeploys the schema and restarts the pipeline. Type <strong>RESET</strong> to confirm.</p>
        <input className="input" autoFocus value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESET" aria-label="Type RESET to confirm" />
        <div className="inline-row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button variant="danger" disabled={confirmText !== "RESET"} onClick={async () => { setConfirmReset(false); await act("Reset demo", "/api/control/reset", "POST"); }}>Reset demo</Button>
        </div>
      </Dialog>
      <Dialog open={unlockOpen} title="Unlock demo control" onClose={() => setUnlockOpen(false)}>
        <p>Type the environment name <strong>{settings.environmentName}</strong> to confirm. This issues the same 15-minute write-unlock token as Settings → Safety.</p>
        <input className="input" autoFocus value={unlockConfirm} onChange={(e) => setUnlockConfirm(e.target.value)} placeholder={settings.environmentName} aria-label="Confirm environment name" />
        <div className="inline-row" style={{ justifyContent: "flex-end", marginTop: 14 }}><Button onClick={() => setUnlockOpen(false)}>Cancel</Button><Button variant="danger" disabled={unlockConfirm !== settings.environmentName} onClick={doUnlock}>Unlock</Button></div>
      </Dialog>
    </>
  );
}

function StatusBadge({ label, on, err }: { label: string; on: boolean; err?: string }) {
  return <Badge tone={on ? "good" : "hygiene"} title={err}>{label}: {on ? "RUNNING" : err ? "UNREACHABLE" : "STOPPED"}</Badge>;
}
function LogTail({ lines, empty }: { lines: string[]; empty: string }) {
  return (
    <pre className="mono tiny" style={{ background: "var(--panel-2, #f6f8fa)", borderRadius: 6, padding: "8px 10px", minHeight: 64, maxHeight: 150, overflow: "auto", whiteSpace: "pre-wrap", margin: 0 }}>
      {lines.length ? lines.join("\n") : <span className="muted">{empty}</span>}
    </pre>
  );
}
