/**
 * ConsoleDataSource facade. Pages call `callProcedure` / `runStatement` and never know which provider answers:
 * mock fixtures (src/data/mock.ts) or the live BFF (/api/*). The provider is chosen by the global data mode.
 */
import { useMemo } from "react";
import type { ExecResponse } from "@/lib/volt";
import type { ParsedStatement } from "@/lib/sqlParse";
import * as mock from "./mock";
import { useSettings, type DataMode } from "./settings";
import { configureLive, useTelemetry } from "./telemetry";
import type { HealthInfo, ProcStat, TableStat } from "./types";

export type ExecOptions = mock.ExecOptions & { mode?: DataMode; unlockToken?: string | null };
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function failure(procedure: string, params: unknown[], statusstring: string): ExecResponse {
  return { ok: false, source: "live", results: [], timing: { bffRoundTripMs: 0 }, capturedAt: new Date().toISOString(), request: { method: "POST", url: `${API_BASE}/api/volt/call`, body: { procedure, params } }, response: null, statusstring };
}

async function post<T>(path: string, body: unknown, token?: string | null): Promise<{ status: number; json: T | null; text: string }> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-console-unlock": token } : {}) }, body: JSON.stringify(body) });
  const text = await res.text();
  let json: T | null = null;
  try { json = JSON.parse(text) as T; } catch { /* non-JSON error body */ }
  return { status: res.status, json, text };
}

export async function liveCall(procedure: string, params: unknown[], token?: string | null): Promise<ExecResponse> {
  const t0 = performance.now();
  try {
    const r = await post<ExecResponse>("/api/volt/call", { procedure, params }, token);
    if (r.json && "results" in r.json) return { ...r.json, timing: { ...r.json.timing, bffRoundTripMs: Math.round((performance.now() - t0) * 10) / 10 } };
    return failure(procedure, params, `BFF error ${r.status}: ${r.text.slice(0, 300)}`);
  } catch (e) { return failure(procedure, params, `BFF unreachable at ${API_BASE || location.origin}/api — is \`npm run server\` running? (${e instanceof Error ? e.message : String(e)})`); }
}
export async function liveHealth(): Promise<HealthInfo> {
  try { const res = await fetch(`${API_BASE}/api/health`); const j = (await res.json()) as HealthInfo; return j; }
  catch (e) { return { ok: false, voltApiUrl: "", checkedAt: new Date().toISOString(), error: `BFF unreachable (${e instanceof Error ? e.message : String(e)})` }; }
}
configureLive((p, a) => liveCall(p, a), liveHealth);

export async function callProcedure(procedure: string, params: unknown[], opts: ExecOptions): Promise<ExecResponse> {
  if (opts.mode === "live") return liveCall(procedure, params, opts.readOnly ? null : opts.unlockToken);
  return mock.callProcedure(procedure, params, opts);
}
export async function runStatement(st: ParsedStatement, opts: ExecOptions): Promise<ExecResponse> {
  if (opts.mode === "live") {
    const t0 = performance.now();
    try {
      const r = await post<ExecResponse>("/api/volt/sql", { statement: st.text }, opts.readOnly ? null : opts.unlockToken);
      if (r.json && "results" in r.json) return { ...r.json, timing: { ...r.json.timing, bffRoundTripMs: Math.round((performance.now() - t0) * 10) / 10 } };
      return failure("@AdHoc", [st.text], `BFF error ${r.status}: ${r.text.slice(0, 300)}`);
    } catch (e) { return failure("@AdHoc", [st.text], `BFF unreachable (${e instanceof Error ? e.message : String(e)})`); }
  }
  return mock.runStatement(st, opts);
}

/** Option bag pages pass to the data source. Includes the active mode and unlock token. */
export function useExecOptions(readOnly: boolean, voltApiUrl: string): ExecOptions {
  const { settings, unlockToken } = useSettings();
  const latest = useTelemetry().samples.at(-1);
  return useMemo(() => ({ readOnly, voltApiUrl, latest, mode: settings.dataMode, unlockToken }), [readOnly, voltApiUrl, latest, settings.dataMode, unlockToken]);
}
export function useMode(): DataMode { return useSettings().settings.dataMode; }
export function useTableStats(): TableStat[] { const t = useTelemetry(); return t.mode === "live" ? (t.tableStats ?? []) : mock.TABLE_STATS; }
export function useProcStats(): ProcStat[] | null { const t = useTelemetry(); return t.mode === "live" ? t.procStats : mock.PROCEDURES.map((p) => ({ name: p.name, invocations: p.calls, avgUs: p.avgUs, minUs: p.minUs, maxUs: p.maxUs, ratePerSec: p.invPerSec })); }
export function useHealth(): HealthInfo | null { return useTelemetry().health; }

export async function unlockOnServer(): Promise<{ token: string; expiresAt: string } | { error: string }> {
  try { const r = await post<{ token: string; expiresAt: string }>("/api/security/unlock", {}); return r.json ?? { error: `BFF error ${r.status}` }; } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}
export async function lockOnServer(token: string | null) { try { await fetch(`${API_BASE}/api/security/unlock`, { method: "DELETE", headers: token ? { "x-console-unlock": token } : {} }); } catch { /* ignore */ } }
export async function testConnection(voltApiUrl: string): Promise<HealthInfo & { error?: string }> {
  try { const r = await post<HealthInfo & { error?: string }>("/api/settings/test", { voltApiUrl }); return r.json ?? { ok: false, voltApiUrl, checkedAt: new Date().toISOString(), error: `BFF error ${r.status}: ${r.text.slice(0, 200)}` }; }
  catch (e) { return { ok: false, voltApiUrl, checkedAt: new Date().toISOString(), error: `BFF unreachable (${e instanceof Error ? e.message : String(e)})` }; }
}
export async function saveConnection(voltApiUrl: string, kafkaBootstrap: string): Promise<{ ok: boolean; error?: string }> {
  try { const res = await fetch(`${API_BASE}/api/settings/connection`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ voltApiUrl, kafkaBootstrap }) }); if (!res.ok) return { ok: false, error: ((await res.json()) as { error?: string }).error ?? `HTTP ${res.status}` }; return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
// --------------------------------------------------------------- demo control --
export type ControlProc = { running: boolean; pid?: number; startedAt?: string; args?: Record<string, number> };
export type ResetStep = { id: string; label: string; state: "pending" | "running" | "ok" | "failed" | "skipped"; output: string; ms?: number };
export type ResetJob = { state: "idle" | "running" | "ok" | "failed"; startedAt?: string; finishedAt?: string; steps: ResetStep[] };
export type ControlStatus = {
  targets: { voltdb: string; voltsp: string; kafkaBootstrap: string };
  loadgen: ControlProc; querybench: ControlProc;
  pipeline: { running: boolean; error?: string };
  reset: { state: ResetJob["state"]; startedAt?: string; finishedAt?: string };
};
async function getJson<T>(path: string): Promise<{ ok: boolean; data?: T; error?: string }> {
  try { const res = await fetch(`${API_BASE}${path}`); const j = await res.json(); return res.ok ? { ok: true, data: j as T } : { ok: false, error: (j as { error?: string }).error ?? `HTTP ${res.status}` }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
export const controlStatus = () => getJson<ControlStatus>("/api/control/status");
export const controlResetStatus = () => getJson<ResetJob>("/api/control/reset");
export const controlLog = (name: "loadgen" | "querybench", n = 12) => getJson<{ lines: string[] }>(`/api/control/log/${name}?n=${n}`);
export async function controlAction(path: string, method: "POST" | "DELETE", body: unknown, token: string | null): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    // Only send a JSON content-type when there is a body; a DELETE with `content-type: application/json`
    // and no body is rejected by Fastify as a 400 (empty JSON body).
    const headers: Record<string, string> = { ...(token ? { "x-console-unlock": token } : {}) };
    if (method === "POST") headers["content-type"] = "application/json";
    const res = await fetch(`${API_BASE}${path}`, { method, headers, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
    const j = await res.json().catch(() => null);
    return res.ok ? { ok: true, data: j } : { ok: false, error: (j as { error?: string } | null)?.error ?? `HTTP ${res.status}` };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function kafkaLag(): Promise<{ ok: boolean; data?: { groupId: string; topic: string; rows: { partition: number; endOffset: number; committed: number | null; lag: number | null }[]; totalLag: number | null; groupState?: string }; error?: string }> {
  try { const res = await fetch(`${API_BASE}/api/kafka/lag`); const j = await res.json(); return res.ok ? { ok: true, data: j } : { ok: false, error: j.error }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
export async function produceEvents(events: { key?: string; value: string }[], token: string | null): Promise<{ ok: boolean; data?: { topic: string; count: number; partitions: { partition: number; baseOffset?: string }[] }; error?: string }> {
  try {
    const r = await post<{ topic: string; count: number; partitions: { partition: number; baseOffset?: string }[]; error?: string }>("/api/kafka/produce", { events }, token);
    if (r.status >= 200 && r.status < 300 && r.json) return { ok: true, data: r.json };
    return { ok: false, error: (r.json as { error?: string } | null)?.error ?? `HTTP ${r.status}: ${r.text.slice(0, 200)}` };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function dlqTail(n = 20): Promise<{ ok: boolean; data?: { messages: { partition: number; offset: number; timestamp: number; key: string | null; value: string }[] }; error?: string }> {
  try { const res = await fetch(`${API_BASE}/api/kafka/dlq/tail?n=${n}`); const j = await res.json(); return res.ok ? { ok: true, data: j } : { ok: false, error: j.error }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
