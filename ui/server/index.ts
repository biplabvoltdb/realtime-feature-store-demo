/**
 * NovaPay Feature Store Console — BFF. Localhost-only Fastify server that proxies the VoltDB JSON API,
 * enforces the read-only policy, serves whitelisted repository files and optional Kafka inspection.
 */
import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { callVolt, health, nextRequestId, type VoltClientConfig } from "./volt";
import { evaluateCall, UnlockStore, validateVoltUrl } from "./policy";
import { readRepoFile, REPO_FILES } from "./repo";
import { consumerLag, produceEvents, tailTopic } from "./kafka";
import { controlStatus, resetStatus, startLoadgen, startQuerybench, startReset, stopProc, tailLog, type ControlConfig } from "./control";
import { parseStatement, splitStatements } from "../src/lib/sqlParse";

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const config = {
  port: Number(env.PORT ?? 8787), host: env.HOST ?? "127.0.0.1",
  repoRoot: resolve(env.REPO_ROOT ?? resolve(here, "../..")),
  allowedHosts: new Set((env.VOLT_ALLOWED_HOSTS ?? "localhost,127.0.0.1").split(",").map((s) => s.trim()).filter(Boolean)),
  timeoutMs: Number(env.VOLT_TIMEOUT_MS ?? 15000), maxResponseBytes: Number(env.VOLT_MAX_RESPONSE_BYTES ?? 25 * 1024 * 1024),
  kafkaBootstrap: env.KAFKA_BOOTSTRAP ?? "localhost:9092", kafkaGroup: env.KAFKA_GROUP ?? "novapay-feature-agg", kafkaSourceTopic: env.KAFKA_SOURCE_TOPIC ?? "novapay-txn-events", kafkaDlqTopic: env.KAFKA_DLQ_TOPIC ?? "novapay-txn-dlq",
};
// Memory-only connection override (DESIGN §15.7: environment defaults + session overrides).
const connection = { voltApiUrl: env.VOLT_API_URL ?? "http://localhost:8080", kafkaBootstrap: config.kafkaBootstrap };
const voltCfg = (baseUrl = connection.voltApiUrl): VoltClientConfig => ({ baseUrl, timeoutMs: config.timeoutMs, maxResponseBytes: config.maxResponseBytes });
const unlocks = new UnlockStore(15 * 60_000);

const app = Fastify({ logger: { level: env.LOG_LEVEL ?? "warn" }, bodyLimit: 1024 * 1024 });
const unlockedFor = (req: { headers: Record<string, unknown> }) => unlocks.valid(String(req.headers["x-console-unlock"] ?? "") || undefined);

app.get("/api/health", async () => ({ ...(await health(voltCfg())), bff: { version: "0.1.0", repoRoot: config.repoRoot, allowedHosts: [...config.allowedHosts], unlockSessions: unlocks.activeCount() } }));

app.post<{ Body: { procedure?: string; params?: unknown[] } }>("/api/volt/call", async (req, reply) => {
  const { procedure, params = [] } = req.body ?? {};
  if (!procedure || typeof procedure !== "string") return reply.code(400).send({ error: "procedure is required" });
  if (!Array.isArray(params)) return reply.code(400).send({ error: "params must be an array" });
  const d = evaluateCall(procedure, params, unlockedFor(req));
  if (!d.allowed) return reply.code(403).send(denied(d.procedure, d.params, d.reason!));
  return callVolt(voltCfg(), d.procedure, d.params, nextRequestId());
});

app.post<{ Body: { statement?: string; sql?: string } }>("/api/volt/sql", async (req, reply) => {
  const parts = splitStatements(req.body?.statement ?? req.body?.sql ?? "");
  if (parts.length === 0) return reply.code(400).send({ error: "statement is required" });
  if (parts.length > 1) return reply.code(400).send({ error: "one statement per request; the console splits multi-statement input client-side" });
  const text = parts[0];
  const st = parseStatement(text);
  const d = st.kind === "exec" ? evaluateCall(st.procedure, st.params, unlockedFor(req)) : evaluateCall("@AdHoc", [st.sql], unlockedFor(req));
  if (!d.allowed) return reply.code(403).send(denied(d.procedure, d.params, d.reason!));
  return callVolt(voltCfg(), d.procedure, d.params, nextRequestId());
});

app.post<{ Body: { sql?: string; procedure?: string } }>("/api/volt/explain", async (req, reply) => {
  const { sql, procedure } = req.body ?? {};
  if (procedure) return callVolt(voltCfg(), "@ExplainProc", [procedure.replace(/^com\.novapay\.poc\.procedures\./, "")]);
  if (!sql) return reply.code(400).send({ error: "sql or procedure is required" });
  const st = parseStatement(sql);
  if (st.kind === "exec") return callVolt(voltCfg(), "@ExplainProc", [st.procedure]);
  return callVolt(voltCfg(), "@Explain", [st.sql]);
});

app.get<{ Params: { selector: string }; Querystring: { interval?: string } }>("/api/volt/stats/:selector", async (req, reply) => {
  const d = evaluateCall("@Statistics", [req.params.selector, req.query.interval === "1" ? 1 : 0], false);
  if (!d.allowed) return reply.code(400).send({ error: d.reason });
  return callVolt(voltCfg(), d.procedure, d.params);
});
app.get<{ Params: { selector: string } }>("/api/volt/catalog/:selector", async (req, reply) => {
  const d = evaluateCall("@SystemCatalog", [req.params.selector], false);
  if (!d.allowed) return reply.code(400).send({ error: d.reason });
  return callVolt(voltCfg(), d.procedure, d.params);
});

app.get("/api/repo", async () => ({ root: config.repoRoot, files: Object.entries(REPO_FILES).map(([id, f]) => ({ id, ...f })) }));
app.get<{ Params: { id: string } }>("/api/repo/:id", async (req, reply) => {
  const f = await readRepoFile(config.repoRoot, req.params.id).catch((e: Error) => { reply.code(500); return { error: e.message }; });
  if (!f) return reply.code(404).send({ error: `Unknown repository file id ${req.params.id}` });
  return f;
});

app.get<{ Querystring: { bootstrap?: string } }>("/api/kafka/lag", async (req, reply) => {
  const bootstrap = req.query.bootstrap ?? connection.kafkaBootstrap;
  try { return { source: "live", capturedAt: new Date().toISOString(), bootstrap, ...(await consumerLag(bootstrap, config.kafkaGroup, config.kafkaSourceTopic)) }; }
  catch (e) { return reply.code(502).send({ error: `Kafka admin request failed: ${e instanceof Error ? e.message : String(e)}`, bootstrap }); }
});
app.get<{ Querystring: { n?: string; bootstrap?: string } }>("/api/kafka/dlq/tail", async (req, reply) => {
  const n = Math.min(200, Math.max(1, Number(req.query.n ?? 50) || 50));
  const bootstrap = req.query.bootstrap ?? connection.kafkaBootstrap;
  try { return { source: "live", capturedAt: new Date().toISOString(), bootstrap, ...(await tailTopic(bootstrap, config.kafkaDlqTopic, n)) }; }
  catch (e) { return reply.code(502).send({ error: `Kafka tail failed: ${e instanceof Error ? e.message : String(e)}`, bootstrap }); }
});

// Decay Story reactivation: inject a handful of real events onto the SOURCE topic (never arbitrary topics),
// so they travel Kafka → VoltSP → RecordTxn like production traffic. Write path → requires the unlock.
app.post<{ Body: { events?: { key?: string; value?: string }[] } }>("/api/kafka/produce", async (req, reply) => {
  if (!unlockedFor(req)) return reply.code(403).send({ error: "Producing events requires the write unlock (Settings → Safety)" });
  const events = req.body?.events;
  if (!Array.isArray(events) || events.length === 0 || events.length > 10) return reply.code(400).send({ error: "events must be an array of 1–10 items" });
  const prepared: { key: string | null; value: string }[] = [];
  for (const e of events) {
    const value = e?.value;
    if (typeof value !== "string" || value.length > 8192) return reply.code(400).send({ error: "each event needs a JSON string `value` ≤ 8 KB" });
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { return reply.code(400).send({ error: "event value must be valid JSON (the pipeline's §2.1 contract)" }); }
    if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) return reply.code(400).send({ error: "event value must be a JSON object" });
    const key = e.key ?? (typeof (parsed as { customer_id?: unknown }).customer_id === "number" ? String((parsed as { customer_id: number }).customer_id) : null);
    prepared.push({ key, value });
  }
  try { return { source: "live", capturedAt: new Date().toISOString(), ...(await produceEvents(connection.kafkaBootstrap, config.kafkaSourceTopic, prepared)) }; }
  catch (e) { return reply.code(502).send({ error: `Kafka produce failed: ${e instanceof Error ? e.message : String(e)}` }); }
});

app.get("/api/settings/connection", async () => ({ ...connection, allowedHosts: [...config.allowedHosts] }));
app.put<{ Body: { voltApiUrl?: string; kafkaBootstrap?: string } }>("/api/settings/connection", async (req, reply) => {
  if (req.body?.voltApiUrl) { const v = validateVoltUrl(req.body.voltApiUrl, config.allowedHosts); if (!v.ok) return reply.code(400).send({ error: v.reason }); connection.voltApiUrl = v.url; }
  if (req.body?.kafkaBootstrap) connection.kafkaBootstrap = req.body.kafkaBootstrap.trim();
  return { ...connection };
});
app.post<{ Body: { voltApiUrl?: string } }>("/api/settings/test", async (req, reply) => {
  const v = validateVoltUrl(req.body?.voltApiUrl ?? connection.voltApiUrl, config.allowedHosts);
  if (!v.ok) return reply.code(400).send({ ok: false, error: v.reason });
  return health(voltCfg(v.url));
});

// Demo control-plane (see control.ts). Reads are open; every action needs the write unlock.
const controlCfg = (): ControlConfig => ({ repoRoot: config.repoRoot, kafkaBootstrap: connection.kafkaBootstrap, kafkaGroup: config.kafkaGroup });
const requireUnlock = (req: { headers: Record<string, unknown> }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) =>
  unlockedFor(req) ? null : reply.code(403).send({ error: "Control actions require the write unlock (Settings → Safety, or the unlock button on this page)" });

app.get("/api/control/status", async () => controlStatus(controlCfg()));
app.get("/api/control/reset", async () => resetStatus());
app.get<{ Params: { name: string }; Querystring: { n?: string } }>("/api/control/log/:name", async (req, reply) => {
  try { return await tailLog(controlCfg(), req.params.name, Number(req.query.n ?? 15) || 15); } catch (e) { return reply.code(404).send({ error: e instanceof Error ? e.message : String(e) }); }
});
app.post<{ Body: { eps?: number; customers?: number } }>("/api/control/loadgen", async (req, reply) => {
  if (requireUnlock(req, reply)) return;
  try { return await startLoadgen(controlCfg(), req.body?.eps, req.body?.customers); } catch (e) { return reply.code(409).send({ error: e instanceof Error ? e.message : String(e) }); }
});
app.delete("/api/control/loadgen", async (req, reply) => { if (requireUnlock(req, reply)) return; return stopProc("loadgen"); });
app.post<{ Body: { qps?: number; customers?: number } }>("/api/control/querybench", async (req, reply) => {
  if (requireUnlock(req, reply)) return;
  try { return await startQuerybench(controlCfg(), req.body?.qps, req.body?.customers); } catch (e) { return reply.code(409).send({ error: e instanceof Error ? e.message : String(e) }); }
});
app.delete("/api/control/querybench", async (req, reply) => { if (requireUnlock(req, reply)) return; return stopProc("querybench"); });
app.post("/api/control/reset", async (req, reply) => {
  if (requireUnlock(req, reply)) return;
  try { return startReset(controlCfg()); } catch (e) { return reply.code(409).send({ error: e instanceof Error ? e.message : String(e) }); }
});

app.post("/api/security/unlock", async () => ({ ...unlocks.issue(), ttlMinutes: 15 }));
app.delete("/api/security/unlock", async (req) => { unlocks.revoke(String(req.headers["x-console-unlock"] ?? "") || undefined); return { locked: true }; });
app.get("/api/security/unlock", async (req) => ({ unlocked: unlockedFor(req) }));

function denied(procedure: string, params: unknown[], reason: string) {
  return { ok: false, source: "live", results: [], timing: { bffRoundTripMs: 0 }, capturedAt: new Date().toISOString(), request: { method: "POST", url: `${connection.voltApiUrl}/api/1.0/`, body: { Procedure: procedure, Parameters: JSON.stringify(params) }, blocked: true }, response: { status: -9, statusstring: reason }, statusstring: reason };
}

app.listen({ port: config.port, host: config.host }).then(() => {
  console.log(`[bff] listening on http://${config.host}:${config.port} → VoltDB ${connection.voltApiUrl} · repo ${config.repoRoot} · kafka ${connection.kafkaBootstrap}`);
}).catch((e) => { console.error(e); process.exit(1); });
