#!/usr/bin/env bash
# Create the source topic and the dead-letter topic (counts/partitions from settings.env).
set -euo pipefail
. "$(dirname "$0")/00_env.sh"

kt() { "$KAFKA_HOME/bin/kafka-topics.sh" --bootstrap-server "$KAFKA_BOOTSTRAP" "$@"; }

kt --create --if-not-exists --topic "$TOPIC_EVENTS" \
   --partitions "$SOURCE_PARTITIONS" --replication-factor "$REPLICATION_FACTOR"
kt --create --if-not-exists --topic "$TOPIC_DLQ" \
   --partitions "$DLQ_PARTITIONS" --replication-factor "$REPLICATION_FACTOR"

kt --describe --topic "$TOPIC_EVENTS" | head -2
kt --describe --topic "$TOPIC_DLQ" | head -2
