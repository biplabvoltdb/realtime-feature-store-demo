#!/usr/bin/env bash
# Deploy (or redeploy) the schema + stored procedures. Runs from the project root so
# the "LOAD CLASSES target/novapay-feature-store-procedures.jar" path in ddl.sql resolves;
# the procedures jar must be present on the machine where this runs (sqlcmd ships it to the server).
set -euo pipefail
. "$(dirname "$0")/00_env.sh"
cd "$ROOT"

[ -f "$PROC_JAR" ] || { echo "ERROR: $PROC_JAR not found — build first: mvn -q -DskipTests package" >&2; exit 1; }

sqlc() { "$VOLTDB_HOME/bin/sqlcmd" --servers="$VOLTDB_HOST" --port="$VOLTDB_PORT" "$@"; }

echo "Dropping any previous schema..."
sqlc < src/main/resources/remove_db.sql || true
echo "Deploying schema + procedures (batched)..."
sqlc < src/main/resources/ddl.sql
echo "Done."
