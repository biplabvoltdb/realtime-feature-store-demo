#!/usr/bin/env bash
# Compile and run the JSON gateway (needed for VoltDB 14+ where the server no longer embeds the JSON HTTP API).
#   ./gateway/run.sh [servers=localhost:21212] [port=8080]
set -euo pipefail
VOLTDB_HOME="${VOLTDB_HOME:-$HOME/voltdb-ent-14.0.1}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CLIENT_JAR="$(ls "$VOLTDB_HOME"/voltdb/voltdbclient-*.jar | head -1)"
mkdir -p "$HERE/out"
javac -cp "$CLIENT_JAR" -d "$HERE/out" "$HERE/VoltJsonGateway.java"
exec java -cp "$CLIENT_JAR:$VOLTDB_HOME/lib/*:$HERE/out" VoltJsonGateway "${1:-localhost:21212}" "${2:-8080}"
