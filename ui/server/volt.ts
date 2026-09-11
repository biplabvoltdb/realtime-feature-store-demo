/** VoltDB JSON API client. Normalizes `/api/1.0/` responses into the console's ExecResponse shape. */
import { VOLT_TYPE_NAMES, type ExecResponse, type VoltTable } from "../src/lib/volt";

export type VoltClientConfig = { baseUrl: string; timeoutMs: number; maxResponseBytes: number };
type RawResult = { status: number; schema: { name: string; type: number }[]; data: (string | number | null)[][] };
type RawEnvelope = { status: number; statusstring: string | null; appstatus: number; appstatusstring: string | null; results?: RawResult[] };

let requestSeq = 0;
export const nextRequestId = () => `bff-${Date.now().toString(36)}-${(++requestSeq).toString(36)}`;

export function normalizeResult(r: RawResult): VoltTable {
  return { columns: (r.schema ?? []).map((s) => ({ name: s.name, typeCode: s.type, typeName: VOLT_TYPE_NAMES[s.type] ?? `TYPE_${s.type}` })), rows: r.data ?? [] };
}

export async function callVolt(cfg: VoltClientConfig, procedure: string, params: unknown[], requestId = nextRequestId()): Promise<ExecResponse> {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/api/1.0/`;
  const parameters = JSON.stringify(params);
  const request = { method: "POST", url, body: { Procedure: procedure, Parameters: parameters }, requestId };
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  const fail = (statusstring: string, response: unknown = null, upstreamMs?: number): ExecResponse => ({
    ok: false, source: "live", results: [], timing: { bffRoundTripMs: round(performance.now() - t0), upstreamMs }, capturedAt: new Date().toISOString(), request, response, statusstring,
  });
  try {
    const res = await fetch(url, { method: "POST", body: new URLSearchParams({ Procedure: procedure, Parameters: parameters }), signal: ctrl.signal, headers: { "content-type": "application/x-www-form-urlencoded" } });
    const text = await res.text();
    const upstreamMs = round(performance.now() - t0);
    if (text.length > cfg.maxResponseBytes) return fail(`Upstream response exceeds ${cfg.maxResponseBytes} bytes (${text.length}); narrow the statement`, { truncated: text.slice(0, 500) }, upstreamMs);
    let json: RawEnvelope;
    try { json = JSON.parse(text) as RawEnvelope; } catch { return fail(`Upstream returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`, { httpStatus: res.status, body: text.slice(0, 2000) }, upstreamMs); }
    if (json.status !== 1) return fail(json.statusstring ?? `VoltDB status ${json.status}`, json, upstreamMs);
    const results = (json.results ?? []).map(normalizeResult);
    return { ok: true, source: "live", results, timing: { bffRoundTripMs: round(performance.now() - t0), upstreamMs }, capturedAt: new Date().toISOString(), request, response: json };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(ctrl.signal.aborted ? `Timed out after ${cfg.timeoutMs} ms waiting for ${url}` : `Upstream unreachable at ${url}: ${msg}`);
  } finally { clearTimeout(timer); }
}

const round = (n: number) => Math.round(n * 10) / 10;

export function rowsAsObjects(t: VoltTable): Record<string, string | number | null>[] {
  return t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c.name, r[i]])));
}

export type Health = { ok: boolean; voltApiUrl: string; checkedAt: string; version?: string; hosts?: number; partitions?: number; kSafety?: number; uptime?: string; clusterState?: string; startTime?: number; httpPort?: string; error?: string; bffRoundTripMs: number };

export async function health(cfg: VoltClientConfig): Promise<Health> {
  const t0 = performance.now();
  const r = await callVolt(cfg, "@SystemInformation", ["OVERVIEW"]);
  if (!r.ok) return { ok: false, voltApiUrl: cfg.baseUrl, checkedAt: new Date().toISOString(), error: r.statusstring, bffRoundTripMs: round(performance.now() - t0) };
  const rows = rowsAsObjects(r.results[0]);
  const byKey = (k: string) => rows.find((x) => x.KEY === k)?.VALUE;
  const hosts = new Set(rows.map((x) => x.HOST_ID)).size;
  let partitions: number | undefined;
  const pc = await callVolt(cfg, "@Statistics", ["PARTITIONCOUNT", 0]);
  if (pc.ok && pc.results[0]?.rows.length) { const o = rowsAsObjects(pc.results[0])[0]; partitions = Number(o.PARTITION_COUNT ?? o.PARTITIONCOUNT ?? undefined) || undefined; }
  return { ok: true, voltApiUrl: cfg.baseUrl, checkedAt: new Date().toISOString(), version: String(byKey("VERSION") ?? ""), hosts, partitions, kSafety: Number(byKey("KSAFETY") ?? 0), uptime: String(byKey("UPTIME") ?? ""), clusterState: String(byKey("CLUSTERSTATE") ?? ""), startTime: Number(byKey("STARTTIME") ?? 0) || undefined, httpPort: String(byKey("HTTPPORT") ?? ""), bffRoundTripMs: round(performance.now() - t0) };
}
