#!/usr/bin/env bash
# Continuous Kafka load generator (foreground; Ctrl-C to stop).
#   ./scripts/05_run_loadgen.sh                       -> defaults from settings.env
#   ./scripts/05_run_loadgen.sh 15000                 -> 15,000 eps, default customer pool
#   ./scripts/05_run_loadgen.sh 15000 10000000        -> 15k eps, 10M customer key-space
#
# Positional args override settings.env:  [eps] [numCustomers] [bootstrap] [topic]
# NOTE: numCustomers is the SIZE OF THE RANDOM CUSTOMER-ID POOL, not a count of rows
# to pre-create; profiles materialize lazily as distinct customers are first seen.
set -euo pipefail
. "$(dirname "$0")/00_env.sh"
cd "$ROOT"
require_app_jar

EPS="${1:-$DEFAULT_EPS}"
CUSTOMERS="${2:-$DEFAULT_CUSTOMERS}"
BOOTSTRAP="${3:-$KAFKA_BOOTSTRAP}"
TOPIC="${4:-$TOPIC_EVENTS}"

exec java -cp "$APP_JAR" com.novapay.poc.loadgen.TxnLoadGenerator \
  "$EPS" "$CUSTOMERS" "$BOOTSTRAP" "$TOPIC"
