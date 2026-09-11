#!/usr/bin/env bash
# Run the VoltSP ingest pipeline (foreground; Ctrl-C to stop).
# Reads Kafka at $KAFKA_BOOTSTRAP and writes VoltDB at $VOLTDB_SERVERS (via config/pipeline-config.yaml).
set -euo pipefail
. "$(dirname "$0")/00_env.sh"
cd "$ROOT"
require_app_jar

[ -f "${VOLTSP_LICENSE:-}" ] || {
  echo "ERROR: VoltSP license not found at '$VOLTSP_LICENSE'." >&2
  echo "       Set VOLTSP_LICENSE in settings.env — request an Enterprise trial from Volt Active Data (see README)." >&2
  exit 1; }

export CP="$APP_JAR"
exec "$VOLTSP_HOME/voltsp" -l "$VOLTSP_LICENSE" --config config/pipeline-config.yaml \
  com.novapay.poc.pipeline.TxnFeaturePipeline
