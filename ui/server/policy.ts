/** Server-side read-only policy. The browser classification is UX only; this is the authority. */
import { randomBytes } from "node:crypto";
import { classify, parseStatement } from "../src/lib/sqlParse";

/** Destructive or cluster-control system procedures that are never callable through the console. */
const PERMANENT_DENY = new Set(["@SHUTDOWN", "@PAUSE", "@RESUME", "@PROMOTE", "@UPDATECLASSES", "@UPDATEAPPLICATIONCATALOG", "@QUIESCE", "@SNAPSHOTRESTORE", "@SNAPSHOTSAVE", "@SNAPSHOTDELETE", "@STOPNODE", "@PREPARESHUTDOWN", "@SWAPTABLES", "@UPDATELOGGING", "@UPDATELICENSE", "@JSTACK", "@ELASTICREMOVENT", "@ADHOC_RW"]);
export const STATS_SELECTORS = new Set(["TABLE", "INDEX", "PROCEDURE", "PROCEDUREPROFILE", "PROCEDUREDETAIL", "PROCEDUREINPUT", "PROCEDUREOUTPUT", "LATENCY", "LATENCY_HISTOGRAM", "MEMORY", "TTL", "INITIATOR", "IOSTATS", "PARTITIONCOUNT", "CPU", "IDLETIME", "LIVECLIENTS", "GC", "QUEUE", "TOPIC", "IMPORTER", "EXPORT", "PLANNER", "MANAGEMENT", "SNAPSHOTSTATUS", "COMMANDLOG", "DRPRODUCER", "DRCONSUMER", "DRROLE", "TASK", "LIMITS", "CLOCKSKEW"]);
export const CATALOG_SELECTORS = new Set(["TABLES", "COLUMNS", "INDEXINFO", "PRIMARYKEYS", "PROCEDURES", "PROCEDURECOLUMNS", "FUNCTIONS", "TASKS", "TYPEINFO", "CLASSES"]);

export type Decision = { allowed: boolean; mutating: boolean; reason?: string; procedure: string; params: unknown[] };

export function evaluateCall(procedure: string, params: unknown[], unlocked: boolean): Decision {
  const name = procedure.replace(/^com\.novapay\.poc\.procedures\./, "");
  const upper = name.toUpperCase();
  if (PERMANENT_DENY.has(upper)) return { allowed: false, mutating: true, reason: `${name} is permanently denied for the console (cluster control / destructive)`, procedure, params };
  if (upper === "@ADHOC") {
    const st = parseStatement(String(params[0] ?? ""));
    if (st.kind === "exec") return evaluateCall(st.procedure, st.params, unlocked);
    const cls = classify(st);
    const mutating = !cls.allowedWhenLocked;
    return { allowed: !mutating || unlocked, mutating, reason: mutating && !unlocked ? `Blocked by read-only guard: ${cls.reason}` : undefined, procedure: "@AdHoc", params: [st.sql] };
  }
  if (upper === "@STATISTICS") {
    const sel = String(params[0] ?? "").toUpperCase();
    if (!STATS_SELECTORS.has(sel)) return { allowed: false, mutating: false, reason: `Unsupported @Statistics selector ${sel || "(none)"}`, procedure, params };
    return { allowed: true, mutating: false, procedure: "@Statistics", params: [sel, Number(params[1] ?? 0) ? 1 : 0] };
  }
  if (upper === "@SYSTEMCATALOG") {
    const sel = String(params[0] ?? "").toUpperCase();
    if (!CATALOG_SELECTORS.has(sel)) return { allowed: false, mutating: false, reason: `Unsupported @SystemCatalog selector ${sel || "(none)"}`, procedure, params };
    return { allowed: true, mutating: false, procedure: "@SystemCatalog", params: [sel] };
  }
  const cls = classify({ kind: "exec", procedure: name, params: params as (string | number)[], text: "" });
  const mutating = !cls.allowedWhenLocked;
  return { allowed: !mutating || unlocked, mutating, reason: mutating && !unlocked ? `Blocked by read-only guard: ${cls.reason}` : undefined, procedure: name, params };
}

/** Short-lived, memory-only unlock tokens. Never persisted; lost on BFF restart. */
export class UnlockStore {
  private tokens = new Map<string, number>();
  constructor(private ttlMs = 15 * 60_000) {}
  issue(): { token: string; expiresAt: string } {
    const token = randomBytes(24).toString("base64url");
    const exp = Date.now() + this.ttlMs;
    this.tokens.set(token, exp);
    return { token, expiresAt: new Date(exp).toISOString() };
  }
  valid(token: string | undefined): boolean {
    if (!token) return false;
    const exp = this.tokens.get(token);
    if (!exp) return false;
    if (exp < Date.now()) { this.tokens.delete(token); return false; }
    return true;
  }
  revoke(token: string | undefined) { if (token) this.tokens.delete(token); }
  activeCount() { const now = Date.now(); for (const [k, v] of this.tokens) if (v < now) this.tokens.delete(k); return this.tokens.size; }
}

/** SSRF boundary for the editable VoltDB base URL. */
export function validateVoltUrl(raw: string, allowedHosts: Set<string>): { ok: true; url: string } | { ok: false; reason: string } {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: "Not a valid URL" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "Only http(s) URLs are allowed" };
  if (u.username || u.password) return { ok: false, reason: "Embedded credentials are rejected" };
  if (!allowedHosts.has(u.hostname)) return { ok: false, reason: `Host ${u.hostname} is not on the allowlist (${[...allowedHosts].join(", ")})` };
  return { ok: true, url: `${u.protocol}//${u.host}` };
}
