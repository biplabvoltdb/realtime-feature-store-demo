/**
 * Telemetry coordinator. One store, one recursive timeout, bounded ring buffers, exposed via useSyncExternalStore.
 * Two providers share the store: the mock provider seeds deterministic history and drifts gently; the live provider
 * polls the BFF (@Statistics PROCEDURE/LATENCY/TABLE, GetCounters, /api/health) and derives rates from deltas.
 * Providers never mix: switching mode clears everything.
 */
import { useSyncExternalStore } from "react";
import type { ExecResponse, VoltTable } from "@/lib/volt";
import type { HealthInfo, ProcStat, TableStat } from "./types";

export type Sample = {
  t: number; ingest: number; merchant: number; reads: number; rejected: number;
  p50: number; p95: number; p99: number; p999: number;
  counters: { dlq_unparseable_created_at: number; dlq_missing_subject_key: number; dropped_late: number; dlq_unparseable_json: number };
  hotRows: number; subjects: number;
};
export type HygieneEvent = { id: string; t: number; name: keyof Sample["counters"]; delta: number };
export type Range = "5m" | "15m" | "1h";
export type Mode = "mock" | "live";
const RANGE_MS: Record<Range, number> = { "5m": 5 * 60_000, "15m": 15 * 60_000, "1h": 60 * 60_000 };
const MAX_SAMPLES = 1200;

type State = {
  mode: Mode; samples: Sample[]; events: HygieneEvent[]; paused: boolean; startedAt: number;
  health: HealthInfo | null; tableStats: TableStat[] | null; procStats: ProcStat[] | null;
  lastError: string | null; lastSuccessAt: number | null; ticks: number; baselineReset: string | null;
};
const empty = (mode: Mode): State => ({ mode, samples: [], events: [], paused: false, startedAt: Date.now(), health: null, tableStats: null, procStats: null, lastError: null, lastSuccessAt: null, ticks: 0, baselineReset: null });
let state: State = empty("mock");
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());
let timer: ReturnType<typeof setTimeout> | null = null;
let intervalMs = 3000;
let generation = 0;

// ------------------------------------------------------------------ mock provider
const BASE = { ingest: 2018, merchant: 2018, reads: 506, p50: 0.7, p95: 1.6, p99: 2.4, p999: 4.8, hotRows: 8_420_118, subjects: 99_842 };
const START_COUNTERS = { dlq_unparseable_created_at: 394, dlq_missing_subject_key: 391, dropped_late: 588, dlq_unparseable_json: 0 };
function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let rnd = mulberry32(20260902);
function mockNext(prev: Sample | undefined, t: number, i: number): Sample {
  const wave = Math.sin(i / 38) * 0.035 + Math.sin(i / 9) * 0.012;
  const jitter = () => (rnd() - 0.5) * 0.02;
  const counters = { ...(prev?.counters ?? START_COUNTERS) };
  const dt = prev ? (t - prev.t) / 1000 : 3;
  const ingest = BASE.ingest * (1 + wave + jitter());
  const rejPerSec = ingest * 0.0069;
  const total = rejPerSec * dt;
  counters.dlq_unparseable_created_at += Math.round(total * 0.28 * (0.6 + rnd()));
  counters.dlq_missing_subject_key += Math.round(total * 0.28 * (0.6 + rnd()));
  counters.dropped_late += Math.round(total * 0.44 * (0.6 + rnd()));
  return { t, ingest, merchant: ingest * 0.998, reads: BASE.reads * (1 + wave * 0.6 + jitter()), rejected: rejPerSec, p50: BASE.p50 * (1 + wave + jitter()), p95: BASE.p95 * (1 + wave * 1.4 + jitter()), p99: BASE.p99 * (1 + wave * 2 + jitter() * 2), p999: BASE.p999 * (1 + wave * 2.5 + jitter() * 3), counters, hotRows: (prev?.hotRows ?? BASE.hotRows) + Math.round(ingest * dt * 0.02), subjects: (prev?.subjects ?? BASE.subjects) + (rnd() < 0.3 ? 1 : 0) };
}
function eventsFrom(prev: Sample | undefined, s: Sample, events: HygieneEvent[]): HygieneEvent[] {
  if (!prev) return events;
  const out = [...events];
  (Object.keys(s.counters) as Array<keyof Sample["counters"]>).forEach((k) => { const d = s.counters[k] - prev.counters[k]; if (d > 0) out.unshift({ id: `${s.t}-${k}`, t: s.t, name: k, delta: d }); });
  return out.slice(0, 60);
}
function mockSeed() {
  rnd = mulberry32(20260902);
  const now = Date.now();
  const samples: Sample[] = [];
  for (let i = 0; i < 300; i++) samples.push(mockNext(samples[i - 1], now - (300 - i) * 3000, i));
  let events: HygieneEvent[] = [];
  for (let i = samples.length - 7; i < samples.length; i++) events = eventsFrom(samples[i - 1], samples[i], events);
  state = { ...state, samples, events, lastSuccessAt: now, health: { ok: true, voltApiUrl: "mock://fixtures", checkedAt: new Date(now).toISOString(), version: "14.0.1", hosts: 3, partitions: 48, kSafety: 1, uptime: "0 days 05:42:11", clusterState: "Running", startTime: now - 5 * 3600_000 - 42 * 60_000 } };
}
function mockTick() {
  const prev = state.samples.at(-1);
  const s = mockNext(prev, Date.now(), state.samples.length + 300);
  state = { ...state, samples: [...state.samples.slice(-MAX_SAMPLES + 1), s], events: eventsFrom(prev, s, state.events), lastSuccessAt: s.t, ticks: state.ticks + 1 };
}

// ------------------------------------------------------------------ live provider
type Fetcher = (procedure: string, params: unknown[]) => Promise<ExecResponse>;
type HealthFetcher = () => Promise<HealthInfo>;
let liveFetch: Fetcher | null = null;
let liveHealth: HealthFetcher | null = null;
type RawSnapshot = { t: number; inv: Map<string, number>; counters: Sample["counters"]; latency: { p50: number; p95: number; p99: number; p999: number }; tables: TableStat[]; procs: ProcStat[] };
let prevRaw: RawSnapshot | null = null;
const idx = (t: VoltTable, n: string) => t.columns.findIndex((c) => c.name === n);
const num = (v: unknown) => (v == null ? 0 : Number(v));

export function aggregateTables(t: VoltTable): TableStat[] {
  const [tn, tc, td, ts, tt] = ["TABLE_NAME", "TUPLE_COUNT", "TUPLE_DATA_MEMORY", "STRING_DATA_MEMORY", "TABLE_TYPE"].map((n) => idx(t, n));
  const m = new Map<string, TableStat>();
  for (const r of t.rows) { if (tt >= 0 && String(r[tt]) !== "PersistentTable") continue; const name = String(r[tn]); const a = m.get(name) ?? { name, rows: 0, tupleKb: 0, stringKb: 0 }; a.rows += num(r[tc]); a.tupleKb += num(r[td]); a.stringKb += num(r[ts]); m.set(name, a); }
  return [...m.values()];
}
export function aggregateProcedures(t: VoltTable): { inv: Map<string, number>; procs: Omit<ProcStat, "ratePerSec">[] } {
  const [pn, pi, mn, mx, av] = ["PROCEDURE", "INVOCATIONS", "MIN_EXECUTION_TIME", "MAX_EXECUTION_TIME", "AVG_EXECUTION_TIME"].map((n) => idx(t, n));
  const acc = new Map<string, { inv: number; min: number; max: number; avgW: number }>();
  for (const r of t.rows) { const name = String(r[pn]).split(".").pop()!; const a = acc.get(name) ?? { inv: 0, min: Infinity, max: 0, avgW: 0 }; const inv = num(r[pi]); a.inv += inv; a.min = Math.min(a.min, num(r[mn])); a.max = Math.max(a.max, num(r[mx])); a.avgW += num(r[av]) * inv; acc.set(name, a); }
  const inv = new Map<string, number>(); const procs: Omit<ProcStat, "ratePerSec">[] = [];
  for (const [name, a] of acc) { inv.set(name, a.inv); procs.push({ name, invocations: a.inv, avgUs: a.inv ? Math.round(a.avgW / a.inv / 1000) : 0, minUs: Math.round((a.min === Infinity ? 0 : a.min) / 1000), maxUs: Math.round(a.max / 1000) }); }
  return { inv, procs };
}
function latencyFrom(t: VoltTable | undefined) {
  if (!t || !t.rows.length) return { p50: 0, p95: 0, p99: 0, p999: 0 };
  const pick = (n: string) => { const i = idx(t, n); return i < 0 ? 0 : Math.max(...t.rows.map((r) => num(r[i]))) / 1000; };
  return { p50: pick("P50"), p95: pick("P95"), p99: pick("P99"), p999: pick("P99.9") };
}
function countersFrom(t: VoltTable | undefined): Sample["counters"] {
  const c = { dlq_unparseable_created_at: 0, dlq_missing_subject_key: 0, dropped_late: 0, dlq_unparseable_json: 0 };
  if (!t) return c;
  const [ni, vi] = [idx(t, "NAME"), idx(t, "VAL")];
  for (const r of t.rows) { const k = String(r[ni]) as keyof Sample["counters"]; if (k in c) c[k] = num(r[vi]); }
  return c;
}
async function liveTick(gen: number) {
  if (!liveFetch || !liveHealth) return;
  const t = Date.now();
  const [proc, lat, tab, cnt, hl] = await Promise.allSettled([liveFetch("@Statistics", ["PROCEDURE", 0]), liveFetch("@Statistics", ["LATENCY", 0]), liveFetch("@Statistics", ["TABLE", 0]), liveFetch("GetCounters", []), liveHealth()]);
  if (gen !== generation) return;
  const ok = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === "fulfilled" ? r.value : null);
  const procR = ok(proc), latR = ok(lat), tabR = ok(tab), cntR = ok(cnt), healthR = ok(hl);
  const failures = [procR, latR, tabR, cntR].filter((r) => !r || !r.ok).map((r) => r?.statusstring ?? "request failed");
  if (!procR?.ok || !tabR?.ok) {
    state = { ...state, health: healthR ?? state.health, lastError: failures[0] ?? "statistics unavailable", ticks: state.ticks + 1 };
    prevRaw = null;
    return;
  }
  const { inv, procs } = aggregateProcedures(procR.results[0]);
  const raw: RawSnapshot = { t, inv, counters: countersFrom(cntR?.ok ? cntR.results[0] : undefined), latency: latencyFrom(latR?.ok ? latR.results[0] : undefined), tables: aggregateTables(tabR.results[0]), procs: procs.map((p) => ({ ...p, ratePerSec: null })) };
  let samples = state.samples, events = state.events, baselineReset = state.baselineReset;
  if (prevRaw) {
    const dt = (t - prevRaw.t) / 1000;
    const rate = (name: string) => { const d = (inv.get(name) ?? 0) - (prevRaw!.inv.get(name) ?? 0); return d / dt; };
    const negative = [...inv.keys()].some((k) => (inv.get(k) ?? 0) < (prevRaw!.inv.get(k) ?? 0));
    if (negative || dt <= 0) { baselineReset = "Cluster changed; collecting a new baseline…"; samples = []; events = []; }
    else {
      const sumC = (c: Sample["counters"]) => c.dlq_unparseable_created_at + c.dlq_missing_subject_key + c.dropped_late + c.dlq_unparseable_json;
      const prevS = samples.at(-1);
      const tableRows = (n: string) => raw.tables.find((x) => x.name === n)?.rows ?? 0;
      const s: Sample = { t, ingest: rate("RecordTxn"), merchant: rate("RecordMerchantTxn"), reads: rate("GetRollingFeatures") + rate("GetMerchantFeatures"), rejected: Math.max(0, (sumC(raw.counters) - sumC(prevRaw.counters)) / dt), ...raw.latency, counters: raw.counters, hotRows: tableRows("TXN_RAW"), subjects: tableRows("CUSTOMER_PROFILE") };
      raw.procs = raw.procs.map((p) => ({ ...p, ratePerSec: rate(p.name) }));
      samples = [...samples.slice(-MAX_SAMPLES + 1), s];
      events = eventsFrom(prevS, s, events);
      baselineReset = null;
    }
  }
  prevRaw = raw;
  state = { ...state, samples, events, health: healthR ?? state.health, tableStats: raw.tables, procStats: raw.procs, lastError: failures.length ? failures[0] : null, lastSuccessAt: t, ticks: state.ticks + 1, baselineReset };
}

// ------------------------------------------------------------------ scheduler
async function tick(gen: number) {
  if (gen !== generation) return;
  if (!state.paused) {
    if (state.mode === "mock") mockTick(); else await liveTick(gen);
    if (gen !== generation) return;
    publish();
  }
  timer = setTimeout(() => tick(gen), intervalMs);
}
export function configureLive(fetcher: Fetcher, healthFetcher: HealthFetcher) { liveFetch = fetcher; liveHealth = healthFetcher; }
export function startTelemetry(mode: Mode, pollMs: number) {
  generation += 1;
  const gen = generation;
  intervalMs = pollMs;
  if (timer) clearTimeout(timer);
  prevRaw = null;
  state = empty(mode);
  if (mode === "mock") mockSeed();
  publish();
  timer = setTimeout(() => tick(gen), mode === "live" ? 50 : intervalMs);
  const onVis = () => { state = { ...state, paused: document.hidden }; publish(); if (!document.hidden) { if (timer) clearTimeout(timer); timer = setTimeout(() => tick(gen), 50); } };
  document.addEventListener("visibilitychange", onVis);
  return () => { generation += 1; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
}
export function setPollInterval(ms: number) { intervalMs = ms; }
export function resetTelemetry() { startTelemetry(state.mode, intervalMs); }

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useTelemetry(): State { return useSyncExternalStore(subscribe, () => state, () => state); }
export function getTelemetryState(): State { return state; }
export function useLatest(): Sample | undefined { return useTelemetry().samples.at(-1); }
export function useSeries(range: Range): Sample[] { const { samples } = useTelemetry(); const from = Date.now() - RANGE_MS[range]; return samples.filter((s) => s.t >= from); }
export const rejectedTotal = (s: Sample | undefined) => (s ? s.counters.dlq_unparseable_created_at + s.counters.dlq_missing_subject_key + s.counters.dropped_late + s.counters.dlq_unparseable_json : null);
export function counterRate(samples: Sample[], key: keyof Sample["counters"], windowMs = 60_000): number | null {
  if (samples.length < 2) return null;
  const last = samples[samples.length - 1];
  const first = samples.find((s) => s.t >= last.t - windowMs) ?? samples[0];
  const dt = (last.t - first.t) / 1000;
  return dt > 0 ? (last.counters[key] - first.counters[key]) / dt : null;
}
