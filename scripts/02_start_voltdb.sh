#!/usr/bin/env bash
# Initialize (first run only) and start a single-node VoltDB in the background.
# For sites-per-host tuning or a cluster, set VOLTDB_CONFIG in settings.env to a
# deployment.xml (see deploy/voltdb-cluster-deployment.xml and docs/DEPLOYMENT.md).
set -euo pipefail
. "$(dirname "$0")/00_env.sh"
DIR="$ROOT/voltdbroot"

if [ ! -d "$DIR/voltdbroot" ]; then
  echo "Initializing VoltDB root at $DIR ..."
  INIT_ARGS=()
  [ -n "$VOLTDB_CONFIG" ] && INIT_ARGS+=(--config="$VOLTDB_CONFIG")
  [ -n "${VOLTDB_LICENSE:-}" ] && [ -f "$VOLTDB_LICENSE" ] && INIT_ARGS+=(--license="$VOLTDB_LICENSE")
  "$VOLTDB_HOME/bin/voltdb" init --dir="$DIR" "${INIT_ARGS[@]}"
fi

echo "Starting single-node VoltDB (background)..."
"$VOLTDB_HOME/bin/voltdb" start --dir="$DIR" --background
echo "Wait ~15s, then check:  $VOLTDB_HOME/bin/sqlcmd --query='exec @SystemInformation OVERVIEW;'"
