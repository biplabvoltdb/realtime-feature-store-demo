#!/usr/bin/env bash
# Feature-read latency benchmark (foreground; Ctrl-C to stop).
#   ./scripts/06_run_querybench.sh                    -> defaults from settings.env
#   ./scripts/06_run_querybench.sh 2000               -> 2,000 qps
#
# Positional args override settings.env:  [qps] [numCustomers] [servers host:port]
set -euo pipefail
. "$(dirname "$0")/00_env.sh"
cd "$ROOT"
require_app_jar

[ -n "$VOLTDBCLIENT" ] || { echo "ERROR: voltdbclient jar not found under $VOLTDB_HOME/voltdb/" >&2; exit 1; }

QPS="${1:-$DEFAULT_QPS}"
CUSTOMERS="${2:-$DEFAULT_CUSTOMERS}"
SERVERS="${3:-$VOLTDB_SERVERS}"

exec java -cp "$APP_JAR:$VOLTDBCLIENT" com.novapay.poc.query.FeatureQueryBench \
  "$QPS" "$CUSTOMERS" "$SERVERS"
