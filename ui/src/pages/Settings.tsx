import { useState } from "react";
import { Card, Badge, Notice, Button, Toggle, SectionLabel } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/Overlay";
import { useSettings, DEFAULT_SETTINGS, type Settings as S } from "@/data/settings";
import { useHealth, testConnection, saveConnection, unlockOnServer, lockOnServer } from "@/data/api";
import { fmtTime } from "@/lib/format";
import type { HealthInfo } from "@/data/types";

export default function Settings() {
  const { settings, update, reset, readOnly, unlockToken, unlockWrites, lockWrites, toast } = useSettings();
  const health = useHealth();
  const [draft, setDraft] = useState<S>(settings);
  const [tested, setTested] = useState<{ at: number; ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [unlock, setUnlock] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = <K extends keyof S>(k: K, v: S[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const live = settings.dataMode === "live";

  const test = async () => {
    if (!/^https?:\/\//.test(draft.voltApiUrl)) { setTested({ at: Date.now(), ok: false, text: "Only http(s) URLs are allowed (SSRF boundary)." }); return; }
    if (/@/.test(draft.voltApiUrl)) { setTested({ at: Date.now(), ok: false, text: "Embedded credentials are rejected." }); return; }
    if (draft.dataMode === "mock") { setTested({ at: Date.now(), ok: true, text: `Mock mode: no request sent. Switch Review mode to Live cluster to test ${draft.voltApiUrl} through the BFF.` }); return; }
    setTesting(true);
    const r: HealthInfo & { error?: string } = await testConnection(draft.voltApiUrl);
    setTesting(false);
    setTested(r.ok ? { at: Date.now(), ok: true, text: `Connected · VoltDB ${r.version} · ${r.hosts} host${r.hosts === 1 ? "" : "s"} · ${r.partitions ?? "—"} partitions · ${r.clusterState} · up ${r.uptime}` } : { at: Date.now(), ok: false, text: r.error ?? "Connection failed" });
  };
  const save = async () => {
    setSaving(true);
    if (draft.dataMode === "live" && (draft.voltApiUrl !== settings.voltApiUrl || draft.kafkaBootstrap !== settings.kafkaBootstrap || settings.dataMode !== "live")) {
      const r = await saveConnection(draft.voltApiUrl, draft.kafkaBootstrap);
      if (!r.ok) { setSaving(false); toast(`BFF rejected connection: ${r.error}`); return; }
    }
    update(draft);
    setSaving(false);
    toast("Settings saved");
  };
  const doUnlock = async () => {
    if (settings.dataMode === "live") {
      const r = await unlockOnServer();
      if ("error" in r) { toast(`Unlock failed: ${r.error}`); return; }
      unlockWrites(r.token);
      toast(`Writes unlocked until ${fmtTime(Date.parse(r.expiresAt))}`);
    } else { unlockWrites(null); toast("Writes unlocked for this session (mock)"); }
    setUnlock(false);
  };
  const doLock = async () => { if (settings.dataMode === "live") await lockOnServer(unlockToken); lockWrites(); toast("Read-only guard locked"); };

  return (
    <>
      <div className="toolbar">
        {live
          ? <Notice tone={health?.ok ? "good" : health ? "error" : "info"} style={{ padding: "7px 11px" }}>{health?.ok ? `Connected · VoltDB ${health.version} · ${health.hosts} host${health.hosts === 1 ? "" : "s"} · ${health.partitions ?? "—"} partitions · checked ${fmtTime(Date.parse(health.checkedAt))}` : health ? `Not connected · ${health.error}` : "Connecting to the BFF…"}</Notice>
          : <Notice tone="mock" style={{ padding: "7px 11px" }}>Mock data · not connected · fixtures deterministic · last tested {tested ? fmtTime(tested.at) : "—"}</Notice>}
        <div className="inline-row"><Button onClick={() => { setDraft(DEFAULT_SETTINGS); reset(); toast("Defaults restored"); }}>Reset</Button><Button variant="primary" onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</Button></div>
      </div>
      <div className="settings-layout">
        <div className="settings-stack">
          <Card title="Connection" info="The BFF is the only process that talks to VoltDB. Changes activate after a successful test and Save. Hostnames must be on the BFF allowlist (VOLT_ALLOWED_HOSTS)." actions={<Badge tone={live ? (health?.ok ? "good" : "hygiene") : "mock"}>{live ? (health?.ok ? "CONNECTED" : "DISCONNECTED") : "MOCK"}</Badge>} flush>
            <div className="settings-group" style={{ paddingTop: 4 }}>
              <Row label="Environment name" sub="Shown in the global header"><input className="input" value={draft.environmentName} onChange={(e) => set("environmentName", e.target.value)} /></Row>
              <Row label="VoltDB JSON API" sub="BFF upstream · HTTP(S) allowlist · VMC service (volt-vmc-svc) /api/1.0/" action={<Button onClick={test} disabled={testing}>{testing ? "Testing…" : "Test connection"}</Button>}><input className="input mono" value={draft.voltApiUrl} onChange={(e) => set("voltApiUrl", e.target.value)} /></Row>
              {tested && <div style={{ padding: "4px 0 8px" }}><Notice tone={tested.ok ? "good" : "error"}>{tested.text}</Notice></div>}
              <Row label="Client port" sub="Display only · pipeline client"><div className="input mono readonly">21212</div></Row>
              <Row label="Volt Management Center" sub="Opens in a separate tab"><input className="input mono" value={draft.vmcUrl} onChange={(e) => set("vmcUrl", e.target.value)} /></Row>
              <Row label="Kafka bootstrap" sub="Optional lag and DLQ features"><input className="input mono" value={draft.kafkaBootstrap} onChange={(e) => set("kafkaBootstrap", e.target.value)} /></Row>
              <Row label="Kafka consumer lag" sub="Admin API · no offset changes" action={<Toggle on={draft.kafkaLag} onChange={(v) => set("kafkaLag", v)} label="Kafka consumer lag" />}><span /></Row>
              <Row label="DLQ tail" sub="Isolated console consumer · never joins novapay-feature-agg" action={<Toggle on={draft.dlqTail} onChange={(v) => set("dlqTail", v)} label="DLQ tail" />}><span /></Row>
            </div>
          </Card>
          <Card title="Telemetry" info="One shared coordinator polls @Statistics PROCEDURE/LATENCY/TABLE, GetCounters and /api/health on a recursive timeout so requests never overlap. Stale begins at 2× the interval." flush>
            <div className="settings-group" style={{ paddingTop: 4 }}>
              <Row label="Polling interval" sub="One shared telemetry coordinator"><select className="input select-control" value={draft.pollMs} onChange={(e) => set("pollMs", Number(e.target.value))}>{[2000, 3000, 5000, 10000].map((v) => <option key={v} value={v}>{v / 1000} seconds</option>)}</select></Row>
              <Row label="Pause when hidden" sub="Refresh immediately on return" action={<Toggle on={draft.pauseHidden} onChange={(v) => set("pauseHidden", v)} label="Pause when hidden" />}><span /></Row>
              <Row label="Stale threshold" sub="Derived at 2× poll interval"><div className="input readonly">{(draft.pollMs * 2) / 1000} seconds</div></Row>
            </div>
          </Card>
        </div>
        <div className="settings-stack">
          <Card title="Safety" info="Locked mode allows SELECT, the six read procedures and read-only system/catalog/statistics/explain calls. The BFF enforces the same policy with a 15-minute memory-only unlock token; cluster-control system procedures stay denied even when unlocked." actions={<Badge tone={readOnly ? "good" : "hygiene"}>{readOnly ? "LOCKED" : "UNLOCKED"}</Badge>} flush>
            <div className="settings-group" style={{ paddingTop: 4 }}>
              <Notice tone={readOnly ? "good" : "error"} style={{ margin: "2px 0 12px" }}><strong>{readOnly ? "Read-only guard locked." : "Writes unlocked for this session."}</strong> {readOnly ? (live ? "Server enforcement is active." : "Server enforcement applies in live mode.") : live ? "The BFF holds a 15-minute unlock token. Mutating procedures and DML will execute against the cluster." : "Mock mode: nothing is mutated."}</Notice>
              <SectionLabel>Mutating procedures {readOnly ? "blocked" : "allowed"}</SectionLabel>
              <div className="inline-row" style={{ marginBottom: 13 }}>{["RecordTxn", "RecordMerchantTxn", "BumpCounter"].map((p) => <Badge key={p} tone="hygiene">{p}</Badge>)}</div>
              {readOnly ? <Button variant="danger" onClick={() => { setConfirm(""); setUnlock(true); }}>Unlock writes…</Button> : <Button variant="primary" onClick={doLock}>Lock writes</Button>}
              <div className="muted tiny" style={{ marginTop: 9 }}>Unlock is short-lived, session-scoped, and never persisted.</div>
            </div>
          </Card>
          <Card title="Review mode" info="Mock data is a single global mode. It never merges with live responses; switching clears all cached telemetry and reloads route data." flush>
            <div className="settings-group" style={{ paddingTop: 4 }}>
              <button type="button" className={`mode-card ${draft.dataMode === "live" ? "selected" : ""}`} onClick={() => set("dataMode", "live")}><span className="radio" /><div><strong>Live cluster</strong><div className="muted tiny">Real VoltDB through the BFF (npm run server) and optional Kafka sources only</div></div></button>
              <button type="button" className={`mode-card ${draft.dataMode === "mock" ? "selected" : ""}`} onClick={() => set("dataMode", "mock")}><span className="radio" /><div><strong>Mock data</strong><div className="muted tiny">Complete deterministic fixtures for visual review</div></div></button>
              <Notice tone="info" style={{ marginTop: 12 }}>Mock data is never merged with live responses. Switching clears all cached telemetry. Repository sources (DDL, Java, scripts) are real files in both modes.</Notice>
            </div>
          </Card>
          <Card title="Presenter" info="Stored in this browser only." flush>
            <div className="settings-group" style={{ paddingTop: 4 }}>
              <Row label="Name" sub="Global avatar menu"><input className="input" value={draft.presenter.name} onChange={(e) => set("presenter", { ...draft.presenter, name: e.target.value })} /></Row>
              <Row label="Initials" sub="Two characters"><input className="input" maxLength={2} value={draft.presenter.initials} onChange={(e) => set("presenter", { ...draft.presenter, initials: e.target.value.toUpperCase() })} /></Row>
              <Row label="Role" sub="Supporting identity line"><input className="input" value={draft.presenter.role} onChange={(e) => set("presenter", { ...draft.presenter, role: e.target.value })} /></Row>
            </div>
          </Card>
          <Notice tone="info">Connection changes activate only after a successful test and Save. Credentials are never returned to the browser or request inspector.</Notice>
        </div>
      </div>
      <Dialog open={unlock} title="Unlock writes for this session" onClose={() => setUnlock(false)}>
        <p>Type the environment name <strong>{settings.environmentName}</strong> to confirm. While unlocked, console calls may mutate the cluster (RecordTxn, RecordMerchantTxn, BumpCounter, DML). {live ? "The BFF issues a 15-minute token held in memory only." : "In mock mode nothing is mutated."}</p>
        <input className="input" autoFocus value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={settings.environmentName} aria-label="Confirm environment name" />
        <div className="inline-row" style={{ justifyContent: "flex-end", marginTop: 14 }}><Button onClick={() => setUnlock(false)}>Cancel</Button><Button variant="danger" disabled={confirm !== settings.environmentName} onClick={doUnlock}>Unlock writes</Button></div>
      </Dialog>
    </>
  );
}

function Row({ label, sub, children, action }: { label: string; sub: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="settings-row"><div className="settings-label"><strong>{label}</strong><span>{sub}</span></div><div>{children}</div>{action ?? <span />}</div>;
}
