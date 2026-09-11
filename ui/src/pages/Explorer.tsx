import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, Badge, Chip, Notice, Button, LinkButton, Sparkline } from "@/components/ui/primitives";
import { DataTable, formatCell } from "@/components/ui/DataTable";
import { DailyBucketsChart } from "@/components/domain/charts";
import { WindowFeatureCard, ShrinkProof, type Snapshot } from "@/components/domain/WindowFeatureCard";
import { callProcedure, useExecOptions } from "@/data/api";
import { useSettings } from "@/data/settings";
import { useCall } from "@/data/hooks";
import { parseSnippets } from "@/repo";
import { useInspector, traceFromResponse } from "@/components/shell/Inspector";
import { fmtDate, fmtTime, fmtDecimal, fmtInt, fmtCompact, shortId } from "@/lib/format";
import { windowTier } from "@/lib/tier";
import { T, type VoltTable } from "@/lib/volt";

const cell = (t: VoltTable | undefined, name: string) => { if (!t || !t.rows[0]) return null; const i = t.columns.findIndex((c) => c.name === name); return i < 0 ? null : t.rows[0][i]; };

export default function Explorer() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const subject = (params.get("subject") as "customer" | "merchant") ?? "customer";
  const { settings, readOnly, selectedCustomer, setSelectedCustomer, selectedMerchant, setSelectedMerchant } = useSettings();
  const id = params.get("id") ?? (subject === "customer" ? selectedCustomer : selectedMerchant);
  const [draft, setDraft] = useState(id);
  const [custom, setCustom] = useState(params.get("window") ?? (subject === "customer" ? "10081" : "180"));
  const [picker, setPicker] = useState(false);
  const [metric, setMetric] = useState("TXN_COUNT");
  const opts = useExecOptions(readOnly, settings.voltApiUrl);
  const { open } = useInspector();
  const snippet1 = useMemo(() => parseSnippets()[0], []);
  const busiest = useCall(() => callProcedure("@AdHoc", [snippet1.statement], opts), [snippet1.statement], subject === "customer");
  const busiestRows = (busiest.table?.rows ?? []).map((r) => ({ id: String(r[0]), hint: `${fmtInt(Number(r[1]))} txns · ₹${fmtCompact(Number(r[2]))}` }));
  useEffect(() => { setDraft(id); }, [id]);
  const valid = subject === "customer" ? /^\d{12}$/.test(draft.trim()) : /^M-\d{5}$/i.test(draft.trim());
  const load = () => { const v = subject === "customer" ? draft.trim() : draft.trim().toUpperCase(); if (subject === "customer") setSelectedCustomer(v); else setSelectedMerchant(v); setParams({ subject, id: v }); };
  const switchSubject = (s: "customer" | "merchant") => setParams({ subject: s, id: s === "customer" ? selectedCustomer : selectedMerchant });
  const customMinutes = Math.max(1, Number(custom) || 1);

  // customer calls
  const isCust = subject === "customer";
  const profile = useCall(() => callProcedure("GetProfile", [id], opts), [id, subject], isCust);
  const w5 = useCall(() => callProcedure("GetRollingFeatures", [id, 5], opts), [id, subject], isCust);
  const w60 = useCall(() => callProcedure("GetRollingFeatures", [id, 60], opts), [id, subject], isCust);
  const w1440 = useCall(() => callProcedure("GetRollingFeatures", [id, 1440], opts), [id, subject], isCust);
  const w30d = useCall(() => callProcedure("GetRollingFeatures", [id, 43200], opts), [id, subject], isCust);
  const wCustom = useCall(() => callProcedure(isCust ? "GetRollingFeatures" : "GetMerchantFeatures", [id, customMinutes], opts), [id, subject, customMinutes]);
  const daily = useCall(() => callProcedure("GetDailyBuckets", [id], opts), [id, subject], isCust);
  const recent = useCall(() => callProcedure("GetRecentTxns", [id], opts), [id, subject], isCust);
  // merchant calls
  const m5 = useCall(() => callProcedure("GetMerchantFeatures", [id, 5], opts), [id, subject], !isCust);
  const m60 = useCall(() => callProcedure("GetMerchantFeatures", [id, 60], opts), [id, subject], !isCust);
  const m1440 = useCall(() => callProcedure("GetMerchantFeatures", [id, 1440], opts), [id, subject], !isCust);
  const buckets = useCall(() => callProcedure("@AdHoc", [`SELECT BUCKET_START, ATTEMPT_COUNT, TXN_COUNT, AMOUNT_SUM FROM MERCHANT_MINUTE WHERE MERCHANT_ID = '${id}' ORDER BY BUCKET_START DESC LIMIT 60`], opts), [id, subject], !isCust);

  const [baseline, setBaseline] = useState<Snapshot | null>(null);
  const [followUp, setFollowUp] = useState<Snapshot | null>(null);
  useEffect(() => { setBaseline(null); setFollowUp(null); }, [id, subject]);
  const capture = async (kind: "baseline" | "follow") => {
    const r = await callProcedure("GetRollingFeatures", [id, 5], opts);
    const t = r.ok ? r.results[0] : undefined;
    const snap: Snapshot = { at: Date.now(), raw: cell(t, "RAW_EVENTS") as number | null, txn: cell(t, "TXN_COUNT") as number | null, sum: cell(t, "TXN_AMOUNT_SUM") as string | null, response: r, ingestAt: Date.now() };
    if (kind === "baseline") { setBaseline(snap); setFollowUp(null); } else setFollowUp(snap);
  };
  const hasActivity = Number(cell(w5.table, "RAW_EVENTS") ?? 0) > 0;
  const pt = profile.table;
  const prof = useMemo(() => pt ? Object.fromEntries(pt.columns.map((c, i) => [c.name, pt.rows[0]?.[i]])) : null, [pt]);
  const recentTable = recent.table;
  const bucketTable = buckets.table;
  const bucketVals = bucketTable ? [...bucketTable.rows].reverse().map((r) => Number(r[2])) : [];

  return (
    <>
      <div className="toolbar">
        <div className="inline-row">
          <Chip label="Customer" selected={isCust} onClick={() => switchSubject("customer")} /><Chip label="Merchant" selected={!isCust} onClick={() => switchSubject("merchant")} />
          <input className={`input mono ${draft && !valid ? "invalid" : ""}`} style={{ width: 225 }} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valid && load()} aria-label={isCust ? "Customer id" : "Merchant id"} placeholder={isCust ? "12-digit customer id" : "M-00042"} />
          <div style={{ position: "relative" }}>
            <Button onClick={() => setPicker((p) => !p)}>{isCust ? "Pick a busy customer" : "Pick active merchant"}</Button>
            {picker && <div className="palette" style={{ position: "absolute", top: 38, left: 0, width: 360, zIndex: 20 }}><div className="palette-group">{isCust ? "Query 1 · busiest customers (daily-bucket cutoff)" : "Hot merchants · 80% of traffic"}</div><div className="palette-list" style={{ maxHeight: 260 }}>{(isCust ? (busiestRows.length ? busiestRows : [{ id: "", hint: busiest.loading ? "running query 1…" : busiest.error ?? "no rows in CUSTOMER_DAILY yet" }]) : ["M-00042", "M-00007", "M-00112", "M-00308", "M-00499", "M-01234"].map((m) => ({ id: m, hint: Number(m.slice(2)) < 500 ? "hot merchant" : "cold merchant" }))).map((o) => <button key={o.id} type="button" className="palette-item" onClick={() => { setDraft(o.id); setPicker(false); if (isCust) setSelectedCustomer(o.id); else setSelectedMerchant(o.id); setParams({ subject, id: o.id }); }}><span>·</span><span className="mono">{o.id}</span><span className="hint">{o.hint}</span></button>)}</div></div>}
          </div>
          <Button variant="primary" onClick={load} disabled={!valid}>Load</Button>
          {draft && !valid && <span className="field-error" style={{ marginTop: 0 }}>{isCust ? "Exactly 12 digits (PoV §2.1 numeric contract)" : "Format M-00000"}</span>}
        </div>
        <div className="inline-row"><span className="muted tiny">{isCust ? "Carried into runbook steps 2–5, 8, 9" : "Runbook example M-00042"} · updated {fmtTime(Date.now())}</span><Button onClick={() => (isCust ? profile.response : m60.response) && open(traceFromResponse(isCust ? "GetProfile" : "GetMerchantFeatures", (isCust ? profile.response : m60.response)!))}>Show all traces</Button></div>
      </div>

      {isCust && (
        <>
          <Card title="Customer Profile" info="GetProfile returns the full CUSTOMER_PROFILE row. LAST_TXN_AT and LAST_CITY are overwritten by every accepted RecordTxn write (including retries and non-TXN events), so they are 'last accepted write', not event-time MAX." source="exec GetProfile <customerId>" actions={<LinkButton onClick={() => profile.response && open(traceFromResponse("GetProfile", profile.response, { sourceId: "ddl" }))}>GetProfile · Show request</LinkButton>} flush>
            {profile.error && <div style={{ padding: 14 }}><Notice tone="error">{profile.error}</Notice></div>}
            {!prof && !profile.error && <div style={{ padding: 14 }}><div className="skeleton" style={{ height: 60 }} /></div>}
            {prof && <div className="profile-strip">
              <div className="profile-cell"><div className="profile-label">CUSTOMER_ID</div><div className="profile-value mono">{String(prof.CUSTOMER_ID)}</div><div style={{ marginTop: 8 }}><Badge tone="life">LIFETIME</Badge></div></div>
              <div className="profile-cell"><div className="profile-label">FIRST_SEEN</div><div className="profile-value small">{fmtDate(Number(prof.FIRST_SEEN) / 1000)}</div></div>
              <div className="profile-cell"><div className="profile-label">LAST_TXN_AT</div><div className="profile-value small">{fmtTime(Number(prof.LAST_TXN_AT) / 1000)}</div><div className="muted" style={{ fontSize: 8, marginTop: 4 }} title="Overwritten by every accepted RecordTxn write">last accepted write ⓘ</div></div>
              <div className="profile-cell"><div className="profile-label">LAST_CITY</div><div className="profile-value">{String(prof.LAST_CITY ?? "—")}</div></div>
              <div className="profile-cell"><div className="profile-label">LIFETIME TXNS</div><div className="profile-value">{fmtInt(Number(prof.LIFETIME_TXN_COUNT))}</div></div>
              <div className="profile-cell"><div className="profile-label">LIFETIME AMOUNT</div><div className="profile-value small">₹{fmtDecimal(prof.LIFETIME_AMOUNT_SUM as string)}</div></div>
              <div className="profile-cell"><div className="profile-label">24H COUNT / SUM</div><div className="profile-value small">{fmtInt(Number(prof.TXN_COUNT_24H))} · ₹{fmtCompact(Number(prof.TXN_AMOUNT_SUM_24H))}</div></div>
              <div className="profile-cell" style={{ background: "var(--teal-soft)" }}><div className="profile-label">AVG_TICKET</div><div className="profile-value">{prof.AVG_TICKET == null ? "—" : `₹${fmtDecimal(prof.AVG_TICKET as string)}`}</div><div className="muted" style={{ fontSize: 8, marginTop: 4 }}>materialized in ingest txn</div></div>
            </div>}
          </Card>
          <div className="window-grid">
            <WindowFeatureCard title="5 min" windowMinutes={5} response={w5.response} loading={w5.loading} />
            <WindowFeatureCard title="1 hour" windowMinutes={60} response={w60.response} loading={w60.loading} />
            <WindowFeatureCard title="24 hours" windowMinutes={1440} response={w1440.response} loading={w1440.loading} />
            <WindowFeatureCard title="30 days" windowMinutes={43200} response={w30d.response} loading={w30d.loading} />
            <section className="card window-card" style={{ padding: 0 }}>
              <div style={{ padding: "10px 13px 0", display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 11, fontWeight: 720 }}>Custom</span><input className="input mono" style={{ width: 84, height: 26 }} value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))} aria-label="Custom window in minutes" /><span className="muted tiny">min</span><span className="spacer" /><Badge tone={windowTier(customMinutes).tier}>{windowTier(customMinutes).tier.toUpperCase()}</Badge></div>
              <div style={{ padding: "0 13px 13px" }}><WindowBody response={wCustom.response} loading={wCustom.loading} windowMinutes={customMinutes} /></div>
            </section>
          </div>
          <div className="explorer-bottom">
            <Card title="Rolling-window shrink proof" info="Two GetRollingFeatures(id, 5) snapshots. The 5-minute window shrinks as old events cross the moving minute-aligned cutoff; no batch job runs. This is not physical TTL deletion (see Ingest Hygiene)." source="exec GetRollingFeatures <customerId> 5 · twice" actions={<Button onClick={() => { setBaseline(null); setFollowUp(null); }} disabled={!baseline}>Capture again</Button>}>
              <ShrinkProof capture={capture} hasActivity={hasActivity || !!baseline} baseline={baseline} followUp={followUp} onReset={() => { setBaseline(null); setFollowUp(null); }} />
            </Card>
            <Card title="Daily buckets" info="GetDailyBuckets returns up to 30 CUSTOMER_DAILY rows. Today's bucket (highlighted) is the live leading edge of every warm window." source="exec GetDailyBuckets <customerId>" actions={<><select className="small-control select-control" style={{ minHeight: 28 }} value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Bucket metric">{["TXN_COUNT", "ATTEMPT_COUNT", "TXN_AMOUNT_SUM", "SUCCESS_COUNT", "CARD_COUNT", "MANDATE_COUNT"].map((m) => <option key={m}>{m}</option>)}</select><LinkButton onClick={() => daily.response && open(traceFromResponse("GetDailyBuckets", daily.response, { sourceId: "ddl" }))}>GetDailyBuckets</LinkButton></>}>
              {daily.table ? <DailyBucketsChart table={daily.table} metric={metric} height={150} /> : <div className="skeleton" style={{ height: 150 }} />}
            </Card>
          </div>
          <Card title="Recent Transactions" info="GetRecentTxns: latest 20 TXN_RAW rows. ATTEMPT_COUNT > 1 marks a retried txn_id that was counted once — supporting evidence; RecordTxn source proves the aggregate semantics." source="exec GetRecentTxns <customerId>" actions={<LinkButton onClick={() => recent.response && open(traceFromResponse("GetRecentTxns", recent.response, { sourceId: "ddl" }))}>GetRecentTxns · Show request</LinkButton>} footer={<><span>Rows with ATTEMPT_COUNT &gt; 1 are supporting dedupe evidence.</span><LinkButton onClick={() => nav("/procedures?name=RecordTxn")}>Open procedure source ↗</LinkButton></>}>
            {recentTable ? <DataTable maxHeight={320} columns={[
              { key: "at", header: "CREATED_AT", width: "10%", render: (r: (string | number | null)[]) => fmtTime(Number(r[1]) / 1000) },
              { key: "id", header: "TXN_ID", width: "13%", render: (r) => <span className="cell-mono" title={String(r[0])}>{shortId(String(r[0]), 8, 4)}</span> },
              { key: "et", header: "EVENT_TYPE", width: "10%", render: (r) => String(r[2]) }, { key: "tt", header: "TXN_TYPE", width: "12%", render: (r) => String(r[3]) },
              { key: "amt", header: "AMOUNT", width: "12%", align: "right", render: (r) => `₹${fmtDecimal(r[4])}` }, { key: "res", header: "RESULT", width: "10%", render: (r) => String(r[5]) },
              { key: "m", header: "MERCHANT_ID", width: "12%", render: (r) => <button type="button" className="link cell-mono" onClick={() => setParams({ subject: "merchant", id: String(r[6]) })}>{String(r[6])}</button> }, { key: "city", header: "CITY", width: "9%", render: (r) => String(r[7]) },
              { key: "att", header: "ATTEMPT_COUNT", width: "12%", render: (r) => <>{String(r[8])} {Number(r[8]) > 1 && <Badge tone="warn">retry deduplicated</Badge>}</> },
            ]} rows={recentTable.rows} rowKey={(r) => String(r[0])} /> : <div className="skeleton" style={{ height: 120 }} />}
          </Card>
        </>
      )}

      {!isCust && (
        <>
          <div className="window-grid" style={{ marginTop: 0 }}>
            <WindowFeatureCard title="5 min" windowMinutes={5} response={m5.response} loading={m5.loading} subject="merchant" />
            <WindowFeatureCard title="60 min" windowMinutes={60} response={m60.response} loading={m60.loading} subject="merchant" />
            <WindowFeatureCard title="1440 min" windowMinutes={1440} response={m1440.response} loading={m1440.loading} subject="merchant" />
            <section className="card window-card" style={{ padding: 0 }}>
              <div style={{ padding: "10px 13px 0", display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 11, fontWeight: 720 }}>Custom</span><input className="input mono" style={{ width: 84, height: 26 }} value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))} aria-label="Custom window in minutes" /><span className="muted tiny">min</span><span className="spacer" /><Badge tone="merchant">MERCHANT</Badge></div>
              <div style={{ padding: "0 13px 13px" }}><WindowBody response={wCustom.response} loading={wCustom.loading} windowMinutes={customMinutes} merchant /></div>
            </section>
            <Card title="Boundary" info="GetMerchantFeatures floors 'now' to the minute and sums MERCHANT_MINUTE buckets newer than the cutoff; minute-exact at any span within the 7-day TTL." className="window-card"><div className="muted" style={{ fontSize: 10.5, lineHeight: 1.5 }}>Minute buckets pay off here: hot merchants receive ~50 events/min, so one bucket replaces ~50 raw rows. Dedupe is per merchant via MERCHANT_TXN_SEEN (48 h TTL).</div><div style={{ marginTop: 8 }}><LinkButton onClick={() => nav("/procedures?name=GetMerchantFeatures")}>Open GetMerchantFeatures ›</LinkButton></div></Card>
          </div>
          <Card title="Last 60 minute buckets" subtitle="MERCHANT_MINUTE" info="Ad-hoc, parameterized by the validated merchant id: SELECT BUCKET_START, ATTEMPT_COUNT, TXN_COUNT, AMOUNT_SUM FROM MERCHANT_MINUTE WHERE MERCHANT_ID = ? ORDER BY BUCKET_START DESC LIMIT 60." actions={<LinkButton onClick={() => buckets.response && open(traceFromResponse("Merchant buckets", buckets.response))}>Show request</LinkButton>}>
            {bucketTable ? (
              <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", gap: 18 }}>
                <div><div className="muted tiny" style={{ marginBottom: 6 }}>TXN_COUNT per minute · {bucketTable.rows.length} buckets returned</div><Sparkline values={bucketVals} color="#ea580c" height={90} /><div className="muted tiny" style={{ marginTop: 8 }}>Total TXN_COUNT {fmtInt(bucketVals.reduce((a, b) => a + b, 0))} · avg {bucketVals.length ? (bucketVals.reduce((a, b) => a + b, 0) / bucketVals.length).toFixed(1) : "—"} / min</div></div>
                <DataTable maxHeight={220} columns={bucketTable.columns.map((c, i) => ({ key: c.name, header: c.name, type: c.typeName, align: i > 0 ? "right" as const : "left" as const, render: (r: (string | number | null)[]) => formatCell(r[i], c.typeCode) }))} rows={bucketTable.rows.slice(0, 60)} rowKey={(r) => String(r[0])} />
              </div>
            ) : <div className="skeleton" style={{ height: 120 }} />}
          </Card>
        </>
      )}
    </>
  );
}

function WindowBody({ response, loading, windowMinutes, merchant }: { response: ReturnType<typeof useCall>["response"]; loading: boolean; windowMinutes: number; merchant?: boolean }) {
  const t = response?.ok ? response.results[0] : undefined;
  const names = merchant ? ["BUCKETS", "TXN_COUNT", "AMOUNT_SUM", "SUCCESS_COUNT"] : windowTier(windowMinutes).tier === "hot" ? ["RAW_EVENTS", "TXN_COUNT", "TXN_AMOUNT_SUM", "SUCCESS_COUNT"] : ["DAYS", "TXN_COUNT", "ATTEMPT_COUNT", "TXN_AMOUNT_SUM"];
  if (loading && !t) return <div className="skeleton" style={{ height: 80, marginTop: 10 }} />;
  return <div style={{ marginTop: 6 }}>{names.map((n) => { const v = cell(t, n); const i = t?.columns.findIndex((c) => c.name === n) ?? -1; return <div key={n} className="metric-line"><span className="mono">{n}</span><strong>{v == null ? "—" : t!.columns[i].typeCode === T.DECIMAL ? `₹${fmtDecimal(v)}` : fmtInt(Number(v))}</strong></div>; })}<div style={{ fontSize: 8, color: merchant ? "var(--orange)" : windowTier(windowMinutes).tier === "hot" ? "var(--accent)" : "var(--purple)", marginTop: 7 }}>{merchant ? "MERCHANT_MINUTE · minute-floored cutoff" : windowTier(windowMinutes).note}</div></div>;
}
