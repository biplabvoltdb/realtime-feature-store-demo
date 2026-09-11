/**
 * Demo control-plane: benchmark process management and the full demo reset.
 *
 * Every action is a fixed command template — user input is limited to validated
 * integers (eps/customers/qps), never interpolated as shell text. Components on
 * other hosts are reached over SSH; on a single-machine setup leave the
 * CONTROL_*_SSH variables unset and the same commands run locally.
 *
 * Environment:
 *   CONTROL_VOLTDB_SSH / CONTROL_VOLTSP_SSH   user@host for remote components (unset = local)
 *   CONTROL_SSH_KEY                           private key for those hops
 *   CONTROL_REMOTE_REPO                       project root on the remote hosts (default ~/Downloads/novapay-feature-store)
 *   CONTROL_VOLTDB_HOME                       VoltDB kit on the VoltDB host (sqlcmd)
 *   CONTROL_VOLTSP_HOME                       VoltSP kit on the VoltSP host
 *   CONTROL_KAFKA_HOME                        Kafka kit on this host (topic scripts)
 *   CONTROL_PIPELINE_KAFKA_BOOTSTRAP          bootstrap the pipeline should use (default: BFF's KAFKA_BOOTSTRAP)
 *   CONTROL_PIPELINE_VOLTDB_SERVERS           VoltDB client address the pipeline should use (default localhost:21212)
 */
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { open, mkdir, readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const pExecFile = promisify(execFile);
const env = process.env;

/** Resolve a built jar by filename pattern (version-agnostic), falling back to a default name. */
function findJar(dir: string, pattern: RegExp, fallback: string): string {
  try { const hit = readdirSync(dir).find((f) => pattern.test(f)); if (hit) return resolve(dir, hit); } catch { /* dir may not exist yet */ }
  return resolve(dir, fallback);
}

export type ControlConfig = {
  repoRoot: string;
  kafkaBootstrap: string;
  kafkaGroup: string;
};

const cc = {
  voltdbSsh: env.CONTROL_VOLTDB_SSH ?? "",
  voltspSsh: env.CONTROL_VOLTSP_SSH ?? "",
  sshKey: env.CONTROL_SSH_KEY ?? "",
  remoteRepo: env.CONTROL_REMOTE_REPO ?? "$HOME/Downloads/novapay-feature-store",
  voltdbHome: env.CONTROL_VOLTDB_HOME ?? "$HOME/Downloads/voltdb-ent-14.0.1-x86_64",
  voltspHome: env.CONTROL_VOLTSP_HOME ?? "$HOME/Downloads/voltsp-1.7.1",
  kafkaHome: env.CONTROL_KAFKA_HOME ?? `${env.HOME}/Downloads/kafka_2.13-3.7.0`,
  pipelineKafka: env.CONTROL_PIPELINE_KAFKA_BOOTSTRAP ?? env.KAFKA_BOOTSTRAP ?? "localhost:9092",
  pipelineVolt: env.CONTROL_PIPELINE_VOLTDB_SERVERS ?? "localhost:21212",
};

const sshArgs = (sshTarget: string) => ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", ...(cc.sshKey ? ["-i", cc.sshKey] : []), sshTarget];

/** Run a bash command locally or on a remote host (sshTarget = "user@host") and wait for it. */
async function run(cmd: string, sshTarget = "", timeoutMs = 60_000): Promise<{ ok: boolean; output: string }> {
  const argv = sshTarget ? ["ssh", ...sshArgs(sshTarget), cmd] : ["bash", "-lc", cmd];
  try {
    const { stdout, stderr } = await pExecFile(argv[0], argv.slice(1), { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${err.stdout ?? ""}${err.stderr ?? ""}`.trim() || (err.message ?? String(e)) };
  }
}

/**
 * Launch a long-running remote/local process without waiting. A non-PTY ssh session keeps its
 * channel open until the backgrounded process group ends (redirection and setsid don't change this),
 * so we spawn ssh detached and return immediately; a following poll/verify step is the real readiness gate.
 */
function fireAndForget(cmd: string, sshTarget = ""): { ok: boolean; output: string } {
  const argv = sshTarget ? ["ssh", ...sshArgs(sshTarget), cmd] : ["bash", "-lc", cmd];
  const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: "ignore" });
  child.unref();
  return { ok: true, output: "launch dispatched (readiness confirmed by the next step)" };
}

// ---------------------------------------------------------------- processes --
type Proc = { child: ReturnType<typeof spawn> | null; startedAt: string; args: Record<string, number>; log: string };
const procs: Record<"loadgen" | "querybench", Proc | null> = { loadgen: null, querybench: null };

const int = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

async function startJava(kind: "loadgen" | "querybench", cfg: ControlConfig, mainClass: string, argv: string[], args: Record<string, number>) {
  if (procs[kind]?.child && procs[kind]!.child!.exitCode === null) throw new Error(`${kind} is already running (pid ${procs[kind]!.child!.pid})`);
  const runDir = resolve(cfg.repoRoot, "ui/run");
  await mkdir(runDir, { recursive: true });
  const log = resolve(runDir, `${kind}.log`);
  const out = await open(log, "w");
  const jar = findJar(resolve(cfg.repoRoot, "target"), /-all\.jar$/, "novapay-feature-store-all.jar");
  const clientDir = `${cc.voltdbHome.replace(/^\$HOME/, env.HOME ?? "~")}/voltdb`;
  const cp = kind === "querybench" ? `${jar}:${findJar(clientDir, /^voltdbclient-.*\.jar$/, "voltdbclient.jar")}` : jar;
  const child = spawn("java", ["-cp", cp, mainClass, ...argv], { cwd: cfg.repoRoot, detached: true, stdio: ["ignore", out.fd, out.fd] });
  child.unref();
  await out.close();
  procs[kind] = { child, startedAt: new Date().toISOString(), args, log };
  return { pid: child.pid, log };
}

export async function startLoadgen(cfg: ControlConfig, epsIn: unknown, customersIn: unknown) {
  const eps = int(epsIn, 1, 50_000, 2000);
  const customers = int(customersIn, 1, 100_000_000, 100_000);
  return { eps, customers, ...(await startJava("loadgen", cfg, "com.novapay.poc.loadgen.TxnLoadGenerator", [String(eps), String(customers), cfg.kafkaBootstrap], { eps, customers })) };
}
export async function startQuerybench(cfg: ControlConfig, qpsIn: unknown, customersIn: unknown) {
  const qps = int(qpsIn, 1, 20_000, 500);
  const customers = int(customersIn, 1, 100_000_000, 100_000);
  return { qps, customers, ...(await startJava("querybench", cfg, "com.novapay.poc.query.FeatureQueryBench", [String(qps), String(customers), cc.pipelineVolt], { qps, customers })) };
}
export async function stopProc(kind: "loadgen" | "querybench") {
  const pattern = kind === "loadgen" ? "TxnLoadGenerator" : "FeatureQueryBench";
  const p = procs[kind];
  if (p?.child?.pid && p.child.exitCode === null) { try { process.kill(-p.child.pid, "SIGTERM"); } catch { try { process.kill(p.child.pid, "SIGTERM"); } catch { /* gone */ } } }
  procs[kind] = null;
  await run(`pkill -f '[${pattern[0]}]${pattern.slice(1)}' || true`); // also catch instances started outside the console
  return { stopped: true };
}

async function procStatus(kind: "loadgen" | "querybench") {
  const pattern = kind === "loadgen" ? "TxnLoadGenerator" : "FeatureQueryBench";
  const p = procs[kind];
  const tracked = !!(p?.child && p.child.exitCode === null);
  const external = (await run(`pgrep -f '[${pattern[0]}]${pattern.slice(1)}' | head -1`)).output !== "";
  return { running: tracked || external, pid: tracked ? p!.child!.pid : undefined, startedAt: tracked ? p!.startedAt : undefined, args: tracked ? p!.args : undefined };
}

export async function tailLog(cfg: ControlConfig, name: string, n = 15): Promise<{ lines: string[] }> {
  if (name !== "loadgen" && name !== "querybench") throw new Error("unknown log");
  try {
    const text = await readFile(resolve(cfg.repoRoot, "ui/run", `${name}.log`), "utf8");
    return { lines: text.split("\n").filter(Boolean).slice(-Math.min(200, Math.max(1, n))) };
  } catch { return { lines: [] }; }
}

// -------------------------------------------------------------------- reset --
export type ResetStep = { id: string; label: string; state: "pending" | "running" | "ok" | "failed" | "skipped"; output: string; ms?: number };
export type ResetJob = { state: "idle" | "running" | "ok" | "failed"; startedAt?: string; finishedAt?: string; steps: ResetStep[] };
let job: ResetJob = { state: "idle", steps: [] };
export const resetStatus = (): ResetJob => job;

export function startReset(cfg: ControlConfig): ResetJob {
  if (job.state === "running") throw new Error("a reset is already running");
  const steps: ResetStep[] = [
    { id: "stop-clients", label: "Stop loadgen and query bench", state: "pending", output: "" },
    { id: "stop-pipeline", label: "Stop the VoltSP pipeline", state: "pending", output: "" },
    { id: "kafka-teardown", label: "Delete Kafka topics and consumer group", state: "pending", output: "" },
    { id: "kafka-create", label: "Recreate topics (50 + 4 partitions)", state: "pending", output: "" },
    { id: "voltdb-reset", label: "Redeploy VoltDB schema (batched DDL, wipes data)", state: "pending", output: "" },
    { id: "start-pipeline", label: "Start the VoltSP pipeline", state: "pending", output: "" },
    { id: "verify", label: "Verify pipeline subscribed to all partitions", state: "pending", output: "" },
  ];
  job = { state: "running", startedAt: new Date().toISOString(), steps };
  void runReset(cfg, steps).then(
    () => { job.state = steps.some((s) => s.state === "failed") ? "failed" : "ok"; job.finishedAt = new Date().toISOString(); },
    (e) => { job.state = "failed"; job.finishedAt = new Date().toISOString(); const r = steps.find((s) => s.state === "running"); if (r) { r.state = "failed"; r.output += `\n${e instanceof Error ? e.message : String(e)}`; } },
  );
  return job;
}

async function step(steps: ResetStep[], id: string, fn: () => Promise<{ ok: boolean; output: string }>): Promise<boolean> {
  const s = steps.find((x) => x.id === id)!;
  s.state = "running";
  const t0 = Date.now();
  const r = await fn();
  s.ms = Date.now() - t0;
  s.output = r.output.slice(-2000);
  s.state = r.ok ? "ok" : "failed";
  return r.ok;
}

async function runReset(cfg: ControlConfig, steps: ResetStep[]) {
  const k = `${cc.kafkaHome}/bin`;
  const bail = (from: string) => steps.filter((s) => s.state === "pending").forEach((s) => { s.state = "skipped"; s.output = `skipped: ${from} failed`; });

  await step(steps, "stop-clients", async () => {
    await stopProc("loadgen"); await stopProc("querybench");
    return { ok: true, output: "stopped (including externally started instances)" };
  });

  if (!(await step(steps, "stop-pipeline", () => run("pkill -f '[T]xnFeaturePipeline' || true; sleep 2; pgrep -f '[T]xnFeaturePipeline' >/dev/null && echo 'still running' && exit 1; echo stopped", cc.voltspSsh)))) return bail("stop-pipeline");

  if (!(await step(steps, "kafka-teardown", () => run(
    `${k}/kafka-topics.sh --bootstrap-server ${cfg.kafkaBootstrap} --delete --topic novapay-txn-events 2>&1 | grep -v 'does not exist' || true
${k}/kafka-topics.sh --bootstrap-server ${cfg.kafkaBootstrap} --delete --topic novapay-txn-dlq 2>&1 | grep -v 'does not exist' || true
for i in $(seq 1 15); do OUT=$(${k}/kafka-consumer-groups.sh --bootstrap-server ${cfg.kafkaBootstrap} --delete --group ${cfg.kafkaGroup} 2>&1) && break; echo "$OUT" | grep -q "does not exist\\|GROUP_ID_NOT_FOUND" && break; sleep 4; done
echo "teardown done"`, "", 120_000)))) return bail("kafka-teardown");

  if (!(await step(steps, "kafka-create", () => run(`cd '${cfg.repoRoot}' && KAFKA_HOME='${cc.kafkaHome}' KAFKA_BOOTSTRAP='${cfg.kafkaBootstrap}' bash scripts/01_create_topic.sh`, "", 120_000)))) return bail("kafka-create");

  if (!(await step(steps, "voltdb-reset", () => run(
    `cd ${cc.remoteRepo} && ${cc.voltdbHome}/bin/sqlcmd < src/main/resources/remove_db.sql && ${cc.voltdbHome}/bin/sqlcmd < src/main/resources/ddl.sql && echo 'schema deployed'`, cc.voltdbSsh, 180_000)))) return bail("voltdb-reset");

  // Clear the old log synchronously, then dispatch the pipeline without waiting (see fireAndForget).
  // The verify step is the authoritative readiness gate.
  await step(steps, "start-pipeline", async () => {
    await run(`cd ${cc.remoteRepo} && mkdir -p logs && rm -f logs/voltsp.log`, cc.voltspSsh, 15_000);
    return fireAndForget(`cd ${cc.remoteRepo} && KAFKA_BOOTSTRAP='${cc.pipelineKafka}' VOLTDB_SERVERS='${cc.pipelineVolt}' VOLTSP_HOME=${cc.voltspHome} setsid bash scripts/04_run_pipeline.sh > logs/voltsp.log 2>&1 < /dev/null`, cc.voltspSsh);
  });

  await step(steps, "verify", () => run(
    `for i in $(seq 1 25); do grep -q 'Adding newly assigned partitions: novapay-txn-events' ${cc.remoteRepo}/logs/voltsp.log 2>/dev/null && { echo 'pipeline subscribed to novapay-txn-events'; exit 0; }; sleep 3; done; echo 'pipeline did not subscribe within 75s'; tail -5 ${cc.remoteRepo}/logs/voltsp.log 2>/dev/null; exit 1`, cc.voltspSsh, 120_000));
}

// ------------------------------------------------------------------- status --
export async function controlStatus(cfg: ControlConfig) {
  const [loadgen, querybench, pipeline] = await Promise.all([
    procStatus("loadgen"), procStatus("querybench"),
    run("pgrep -f '[T]xnFeaturePipeline' >/dev/null && echo running || echo stopped", cc.voltspSsh, 15_000),
  ]);
  return {
    targets: { voltdb: cc.voltdbSsh || "local", voltsp: cc.voltspSsh || "local", kafkaBootstrap: cfg.kafkaBootstrap },
    loadgen, querybench,
    pipeline: pipeline.ok ? { running: pipeline.output.includes("running") } : { running: false, error: pipeline.output },
    reset: { state: job.state, startedAt: job.startedAt, finishedAt: job.finishedAt },
  };
}
