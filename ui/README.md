# NovaPay Feature Store Console — UI

Operator console for this PoC, designed in `DESIGN.md` and `design-screens/`. Two data modes, never mixed:

- **Mock data** (default): deterministic fixtures in `src/data/mock.ts`, purple "Mock data · not connected" pill.
- **Live cluster**: the browser talks only to the local BFF (`server/`), which proxies the VoltDB JSON API,
  enforces the read-only policy server-side, serves whitelisted repository files and (optionally) inspects Kafka.

Repository sources (`ddl.sql`, `queries.sql`, the Java procedures, `pipeline-config.yaml`, scripts, README) are
imported as raw text at build time, so everything shown under "source" is the real file in both modes.

## Run it against the local stack

```bash
# 1. Bring up the stack first (see ../docs/DEPLOYMENT.md): configure settings.env,
#    build the jar, then create topics, start VoltDB, deploy the schema, and run
#    the pipeline + loadgen. The scripts read kit paths / endpoints from settings.env.

# 2. Volt Management Center service — on VoltDB 13+/14+ the JSON API (/api/1.0/) is served by VMC, not the server
cd ui && npm install
npm run vmc                # VMC_HOME defaults to ~/Downloads/voltdb-vmc-<version>; config in ui/vmc-server.yaml → http://localhost:8080

# 3. BFF + web
VOLT_API_URL=http://127.0.0.1:8080 npm run dev    # web http://localhost:5173 · BFF http://127.0.0.1:8787
```

Then open Settings → Review mode → **Live cluster** → Save (or "Test connection" first). Enable *Kafka consumer
lag* and *DLQ tail* there if Kafka is reachable.

Notes from bringing this up on VoltDB 14.2.0 / VoltSP 1.8.0:

- `voltdb 14.2` starts no HTTP listener and `@SystemInformation OVERVIEW` has no `HTTPPORT`: the classic
  `/api/1.0/` JSON API moved to the standalone **VMC service** (`volt-vmc-svc.jar`, also shipped as the
  `voltdb/volt-vmc-svc` image). VMC keeps the exact contract (`Procedure`, `Parameters` → `{status, statusstring,
  results:[{schema,data}]}`, GET or POST), so the BFF talks to VMC. `gateway/VoltJsonGateway.java` is a fallback
  that serves the same contract over the Java client when no VMC kit is available.
- The pipeline compiles against VoltSP API 1.6.0; the 1.8.0 runtime lacks `org.voltdb.stream.api.kafka.KafkaRequest`,
  so run it on a 1.6.x/1.7.x runtime (the repo README used 1.7.1).
- Port 8081 on this machine is Homebrew ZooKeeper's admin server, not VoltDB.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite (5173, proxies `/api` → BFF) + BFF with reload, together |
| `npm run web` / `npm run mock` | Vite only (mock mode works without a BFF) |
| `npm run server` | BFF only (`tsx watch server/index.ts`) |
| `npm run vmc` | Start the VMC service for the local cluster (`VMC_HOME`, default `~/Downloads/voltdb-vmc-14.2.0`) |
| `npm run gateway` | Fallback: compile + run the Java JSON gateway (`VOLTDB_HOME` must point at a kit) |
| `npm run typecheck` | Strict TypeScript for web and server |
| `npm run build` | typecheck + `vite build` → `dist/` |

BFF environment: `PORT` (8787), `HOST` (127.0.0.1), `VOLT_API_URL` (http://localhost:8080), `VOLT_ALLOWED_HOSTS`
(localhost,127.0.0.1), `KAFKA_BOOTSTRAP` (localhost:9092), `REPO_ROOT` (auto), `LOG_LEVEL` (warn).

## BFF routes (server/index.ts)

`GET /api/health` · `POST /api/volt/call {procedure, params}` · `POST /api/volt/sql {statement}` (sqlcmd-style
`exec` or SQL, one statement) · `POST /api/volt/explain {sql|procedure}` · `GET /api/volt/stats/:selector` ·
`GET /api/volt/catalog/:selector` · `GET /api/repo/:id` · `GET /api/kafka/lag` · `GET /api/kafka/dlq/tail?n=` ·
`GET|PUT /api/settings/connection` · `POST /api/settings/test` · `POST|DELETE /api/security/unlock`.

Locked mode allows SELECT, the six read procedures and read-only `@Statistics/@SystemCatalog/@SystemInformation/
@Explain/@ExplainProc` calls; `RecordTxn`, `RecordMerchantTxn`, `BumpCounter`, DML and DDL need a 15-minute
memory-only unlock token (`x-console-unlock`). Cluster-control system procedures are denied even when unlocked.

## What is implemented

| Route | Content |
|---|---|
| `/overview` | Tier chips, six KPIs, tier-storage donut, ingest/reads chart, live pipeline mini-map, busiest customers (query 1), hygiene feed |
| `/architecture` | Interactive SVG of Kafka → VoltSP → VoltDB with a node drawer (Runtime · Contract · Source · Trace), tier table, precision statement |
| `/schema` | Six tables parsed from `ddl.sql`, columns with F01…F38 collapsed, storage contract, readers/writers, `ddl.sql` / `remove_db.sql` / deployed-diff tabs |
| `/procedures` | Nine procedures, generated parameter forms, Execute, Explain (`@ExplainProc`), result tabs, Java/DDL source, read-only lock on mutators |
| `/sql` | CodeMirror editor, snippets parsed from `queries.sql` + system procedures, `exec` parsing, result tabs, plan/history/request panes, CSV & Markdown export |
| `/explorer` | Customer profile, 5m/1h/24h/30d/custom window cards with HOT/WARM badges at the 10080-minute boundary, rolling-window shrink proof, daily buckets, recent transactions; merchant tab |
| `/hygiene` | Counter cards with sparklines, expected vs observed ratios, DLQ tail state, dedupe evidence (query 8), `@Statistics TTL` |
| `/benchmarks` | `@Statistics PROCEDURE` aggregation, cluster latency percentiles, loadgen/querybench commands, Kafka lag state |
| `/sizing` | `@Statistics TABLE` aggregated with the README awk formula, bytes/subject projection with sliders, assumptions |
| `/runbook` | Pre-flight checks, ten source-linked steps with inline execution, shrink-proof step, manual commands drawer |
| `/settings` | Connection, telemetry, safety (unlock dialog), review mode, presenter |

Global: `⌘K` command palette, request inspector drawer on every metric/result, mock banner + purple status pill
(mock mode never shows a green Live pill), local persistence of settings/runbook progress/SQL history.

## Layout

```
src/
  app/            router + route table
  components/     ui primitives · shell (sidebar, header, palette, inspector) · domain (charts, diagram, editor, results)
  data/           settings context · mock telemetry store · MockDataSource (procedure/SQL/system-procedure fixtures)
  lib/            formatting · Volt type decoding · sqlcmd-style statement parser · highlighter · CSV
  repo/           raw imports of repository files + DDL parser
  pages/          11 routes
  styles/         tokens.css + console.css
```

## Layout additions for live mode

```
server/    Fastify BFF: volt.ts (JSON client) · policy.ts (read-only, unlock, URL allowlist) · repo.ts · kafka.ts
vmc-server.yaml  VMC service config (voltdbHost/voltdbPort/voltdbAdminPort) → JSON API + web UI on :8080
gateway/   fallback: VoltJsonGateway.java + run.sh (same JSON API contract over the VoltDB Java client)
src/data/api.ts        ConsoleDataSource facade: mock or live behind one callProcedure/runStatement contract
src/data/telemetry.ts  one store, two providers (mock seed/drift · live @Statistics/GetCounters/health deltas)
```

Not in scope yet: launching loadgen/querybench from the console, a querybench stdout adapter, authentication.
