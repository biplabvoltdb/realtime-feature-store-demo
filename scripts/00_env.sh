#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Sourced by every scripts/0N_*.sh (never run directly). Loads settings.env if
# present, fills in defaults, resolves build artifacts with version-agnostic
# globs, and exports everything the Kafka / VoltDB / VoltSP tools read.
# ---------------------------------------------------------------------------
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 1. user settings (optional) — exported for the child tools
if [ -f "$ROOT/settings.env" ]; then set -a; . "$ROOT/settings.env"; set +a; fi

# 2. defaults — only applied when not already set by settings.env / environment
: "${KAFKA_HOME:=$HOME/kafka_2.13-3.7.0}"
: "${VOLTDB_HOME:=$HOME/voltdb-ent-14.0.1}"
: "${VOLTSP_HOME:=$HOME/voltsp-1.7.1}"
: "${VOLTDB_LICENSE:=$VOLTDB_HOME/license.xml}"
: "${VOLTSP_LICENSE:=$VOLTSP_HOME/license.xml}"
: "${KAFKA_BOOTSTRAP:=localhost:9092}"
: "${VOLTDB_SERVERS:=localhost:21212}"
: "${VOLTDB_CONFIG:=}"
: "${TOPIC_EVENTS:=novapay-txn-events}"
: "${TOPIC_DLQ:=novapay-txn-dlq}"
: "${CONSUMER_GROUP:=novapay-feature-agg}"
: "${SOURCE_PARTITIONS:=50}"
: "${DLQ_PARTITIONS:=4}"
: "${REPLICATION_FACTOR:=1}"
: "${DEFAULT_EPS:=2000}"
: "${DEFAULT_CUSTOMERS:=10000000}"
: "${DEFAULT_QPS:=500}"

# 3. build artifacts (version-agnostic — survive a version bump)
APP_JAR="$(ls "$ROOT"/target/*-all.jar 2>/dev/null | head -1 || true)"
PROC_JAR="$ROOT/target/novapay-feature-store-procedures.jar"
VOLTDBCLIENT="$(ls "$VOLTDB_HOME"/voltdb/voltdbclient-*.jar 2>/dev/null | head -1 || true)"

# 4. VoltDB client endpoint split (host / port) for sqlcmd
VOLTDB_HOST="${VOLTDB_SERVERS%%:*}"
VOLTDB_PORT="${VOLTDB_SERVERS##*:}"; [ "$VOLTDB_PORT" = "$VOLTDB_HOST" ] && VOLTDB_PORT=21212

export ROOT KAFKA_HOME VOLTDB_HOME VOLTSP_HOME VOLTDB_LICENSE VOLTSP_LICENSE \
       KAFKA_BOOTSTRAP VOLTDB_SERVERS VOLTDB_HOST VOLTDB_PORT VOLTDB_CONFIG \
       TOPIC_EVENTS TOPIC_DLQ CONSUMER_GROUP SOURCE_PARTITIONS DLQ_PARTITIONS \
       REPLICATION_FACTOR DEFAULT_EPS DEFAULT_CUSTOMERS DEFAULT_QPS \
       APP_JAR PROC_JAR VOLTDBCLIENT

require_app_jar() {
  [ -n "$APP_JAR" ] && [ -f "$APP_JAR" ] || {
    echo "ERROR: application jar (target/*-all.jar) not found." >&2
    echo "       Build it first:  mvn -q -DskipTests package" >&2
    exit 1; }
}
