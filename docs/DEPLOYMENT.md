# Deployment Guide

One codebase, five topologies. The **only** thing that changes between them is a handful of endpoints
in `settings.env` — the scripts, schema, pipeline, and jars are identical everywhere.

- [1. Prerequisites](#1-prerequisites)
- [2. Configure `settings.env`](#2-configure-settingsenv)
- [3. Build](#3-build)
- [4. Topology A — Laptop / single node](#4-topology-a--laptop--single-node)
- [5. Topology B — One VM (all components)](#5-topology-b--one-vm-all-components)
- [6. Topology C — One VM per component](#6-topology-c--one-vm-per-component)
- [7. Topology D — Kafka and/or VoltDB clusters](#7-topology-d--kafka-andor-voltdb-clusters)
- [8. Topology E — Docker](#8-topology-e--docker)
- [9. The operator console (UI)](#9-the-operator-console-ui)
- [10. Reset & teardown](#10-reset--teardown)

---

## 1. Prerequisites

| Need | Notes |
|---|---|
| **JDK 21** | VoltSP needs ≥ 21; the build targets release 17 so procedure classes stay loadable by VoltDB 14 |
| **Maven 3.9+** | build tool |
| **Kafka** kit | e.g. `kafka_2.13-3.7.0` (KRaft mode) |
| **VoltDB Enterprise** kit | e.g. `voltdb-ent-14.0.1` — provides `voltdb`, `sqlcmd`, and the client/server jars |
| **VoltSP** kit | e.g. `voltsp-1.7.1` — provides the `voltsp` CLI and runtime |
| **Enterprise trial license** | request from [voltactivedata.com](https://www.voltactivedata.com/); required by VoltDB and VoltSP |
| **Node 20** | only for the optional operator console (`ui/`) |

### One-time: make the Volt jars resolvable to Maven

The `org.voltdb.*` and `org.voltdb:volt-stream-*` dependencies are **not on Maven Central** — they ship
inside your licensed kits. Install them into your local Maven cache once (adjust paths/versions to your kits):

```bash
# from the VoltDB kit
mvn install:install-file -Dfile="$VOLTDB_HOME/voltdb/voltdb-14.0.1.jar" \
    -DgroupId=org.voltdb -DartifactId=voltdb -Dversion=14.0.1 -Dpackaging=jar
mvn install:install-file -Dfile="$VOLTDB_HOME/voltdb/voltdbclient-14.0.1.jar" \
    -DgroupId=org.voltdb -DartifactId=voltdbclient -Dversion=14.0.1 -Dpackaging=jar

# from the VoltSP kit (volt-stream API 1.6.0 — proven against the 1.7.x runtime)
for a in volt-stream-api volt-stream-connectors-api volt-stream-plugin-volt-api volt-stream-plugin-kafka-api; do
  mvn install:install-file -Dfile="$VOLTSP_HOME/lib/$a-1.6.0.jar" \
      -DgroupId=org.voltdb -DartifactId=$a -Dversion=1.6.0 -Dpackaging=jar
done
```

> Exact jar filenames vary by kit version — list `"$VOLTSP_HOME"/lib` and match the artifact names in `pom.xml`.

## 2. Configure `settings.env`

```bash
cp settings.env.example settings.env
$EDITOR settings.env
```

Everything is here: kit locations, license paths, **endpoints** (`KAFKA_BOOTSTRAP`, `VOLTDB_SERVERS`),
topic/partition/replication knobs, an optional `VOLTDB_CONFIG` (deployment.xml), and run defaults. Every
`scripts/0N_*.sh` sources `scripts/00_env.sh`, which loads this file. **Switching topology = editing the
endpoints here.**

## 3. Build

```bash
mvn -q -DskipTests package
```

Produces `target/novapay-feature-store-all.jar` (pipeline + loadgen + bench) and
`target/novapay-feature-store-procedures.jar` (stored-procedure classes for `LOAD CLASSES`). The scripts
locate these with version-agnostic globs, so a version bump needs no script edits.

---

## 4. Topology A — Laptop / single node

Leave the localhost defaults in `settings.env` (`KAFKA_BOOTSTRAP=localhost:9092`,
`VOLTDB_SERVERS=localhost:21212`). Start your local Kafka broker, then run the numbered scripts in order
from the project root (see the Quick Start in the [README](../README.md)). Start `04_run_pipeline.sh`
**before** `05_run_loadgen.sh` — the pipeline consumes from `LATEST`.

## 5. Topology B — One VM (all components)

Identical to Topology A, on a VM. Install the three kits, keep localhost endpoints, run the scripts.
Give the VM enough RAM for VoltDB's in-memory tables plus headroom (the tables grow with retention).

## 6. Topology C — One VM per component

Three VMs: **kafka**, **voltdb**, **voltsp**. Internal/private IPs are stable; use those, not public ones.

On **every** box, `settings.env` points at that box's kit and the shared endpoints:

```bash
# settings.env (same endpoints on all three boxes)
KAFKA_BOOTSTRAP="10.0.0.10:9092"     # the kafka box's internal address
VOLTDB_SERVERS="10.0.0.20:21212"     # the voltdb box's internal address
```

Then run each script **on the box that owns its component**:

| Box | Runs |
|---|---|
| kafka | `01_create_topic.sh`, then `05_run_loadgen.sh` / `06_run_querybench.sh` |
| voltdb | `02_start_voltdb.sh`, `03_deploy_schema.sh` |
| voltsp | `04_run_pipeline.sh` |

Notes:
- The **Kafka broker must advertise its internal address** (`advertised.listeners=PLAINTEXT://<internal-ip>:9092`) so the other boxes can reach it.
- `03_deploy_schema.sh` ships the procedures jar to VoltDB via `sqlcmd`, so the built jar must be present on the box where you run it (typically the voltdb box; or run it from the kafka box with the jar built there — it connects using `VOLTDB_SERVERS`).
- Open ports between boxes: Kafka `9092`, VoltDB `21212` (client) and `21211` (admin), and `8080` if you use the VoltDB HTTP/JSON API or the console.

## 7. Topology D — Kafka and/or VoltDB clusters

**Kafka cluster.** Point `KAFKA_BOOTSTRAP` at a broker list and raise durability:

```bash
KAFKA_BOOTSTRAP="broker1:9092,broker2:9092,broker3:9092"
REPLICATION_FACTOR="3"          # 01_create_topic.sh uses this
```

Partition count (`SOURCE_PARTITIONS`, default 50) sets consumer parallelism — keep it ≥ the number of
VoltSP consumer instances. Re-run `01_create_topic.sh` against the cluster.

**VoltDB cluster (HA).** Use a multi-host deployment. Edit `deploy/voltdb-cluster-deployment.xml`:

```xml
<cluster hostcount="3" sitesperhost="8" kfactor="1"/>
```

- `hostcount` = number of VoltDB nodes; `kfactor` = replicas you can lose (k=1 survives one node down; needs `hostcount ≥ kfactor+1`).
- `sitesperhost` = execution sites per node. On an N-vCPU host that is 2 hyperthreads/core, start near **N/2** and leave cores for network / command-log / TTL / GC threads (e.g. 16 vCPU → 8). Too many sites oversubscribes cores and adds scheduling jitter.

Point `settings.env` at it and start every node with the same config:

```bash
VOLTDB_CONFIG="$PWD/deploy/voltdb-cluster-deployment.xml"
# on each node:
voltdb init  --dir=<root> --config="$VOLTDB_CONFIG" --license="$VOLTDB_LICENSE" --force
voltdb start --dir=<root> --count=3 --host=node1,node2,node3
```

Then `VOLTDB_SERVERS="node1:21212,node2:21212,node3:21212"` and deploy the schema once. **Changing
`sitesperhost` on an existing database requires a snapshot → re-init → restore** (it changes the
partition count); take a snapshot first (`voltadmin save`), re-init with the new config, then
`voltadmin restore`.

**VoltSP scale-out.** Run multiple pipeline instances in the same consumer group
(`CONSUMER_GROUP=novapay-feature-agg`); Kafka rebalances the 50 partitions across them. Keep total
instances ≤ partition count.

## 8. Topology E — Docker

`docker/docker-compose.yml` runs Kafka + VoltDB + VoltSP + an on-demand load generator on one network —
the containerized form of Topology B.

**Prerequisites specific to Docker:**
1. **License:** copy `docker/.env.example` → `docker/.env` and set `LICENSE_FILE` to your Enterprise license (mounted read-only into the VoltDB and VoltSP containers).
2. **App jar:** the Maven build needs the licensed Volt jars in `~/.m2` (see §1), so build once on the host — `mvn -q -DskipTests package` — and the compose mounts `../target`. (Or build the `novapay-app` image from `docker/Dockerfile.app` after making the kit jars resolvable.)
3. **Image tags:** adjust the `voltdb/voltdb-enterprise` and `voltdb/volt-stream` tags in the compose to versions you are licensed for.

```bash
cd docker
cp .env.example .env && $EDITOR .env      # set LICENSE_FILE
docker compose up -d kafka voltdb         # start infra
docker compose run --rm topics            # create topics
docker compose run --rm schema            # deploy schema + procedures
docker compose up -d voltsp               # start the ingest pipeline
docker compose --profile tools run --rm loadgen   # generate load
```

This is a **reference topology to adapt**, not a turnkey one-liner — the license mount, the host-built
jar, and the image tags are environment-specific. For clusters, scale the compose (multiple brokers /
VoltDB nodes) following Topology D.

## 9. The operator console (UI)

Optional React console with a localhost BFF that proxies the VoltDB JSON API (served by the Volt
Management Center service), enforces a read-only policy, and can start/stop load and reset the demo.

```bash
cd ui && npm install
npm run vmc                                        # VMC: VoltDB web UI + JSON API on :8080
VOLT_API_URL=http://127.0.0.1:8080 npm run dev     # console on :5173, BFF on :8787
```

See `ui/README.md` for BFF environment variables (including the `CONTROL_*` variables that let the Demo
Control page reach remote VoltDB/VoltSP boxes over SSH in Topology C).

## 10. Reset & teardown

- **Fresh data, same schema:** re-run `03_deploy_schema.sh` (drops + redeploys; the pipeline reads `LATEST`, so old Kafka data isn't replayed).
- **Full reset incl. Kafka:** stop loadgen → stop pipeline → delete topics **and the consumer group** (stale group offsets after recreating a topic will wedge the consumer) → `01_create_topic.sh` → `03_deploy_schema.sh` → restart pipeline → restart loadgen. The console's **Demo Control** page does exactly this in one click.
- **Stop VoltDB:** `voltadmin shutdown`. **Restart an initialized node:** `voltdb start --dir=<root> --background` (recovers from the command log; don't re-run `init`).
