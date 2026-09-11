package com.novapay.poc.pipeline;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.voltdb.stream.api.ExecutionContext;
import org.voltdb.stream.api.ExecutionContext.ConfigurationContext;
import org.voltdb.stream.api.kafka.KafkaRequest;
import org.voltdb.stream.api.pipeline.VoltPipeline;
import org.voltdb.stream.api.pipeline.VoltStreamBuilder;
import org.voltdb.stream.api.pipeline.VoltStreamFunction;
import org.voltdb.stream.plugin.kafka.api.KafkaSinkConfigBuilder;
import org.voltdb.stream.plugin.kafka.api.KafkaSourceConfigBuilder;
import org.voltdb.stream.plugin.kafka.api.KafkaStartingOffset;
import org.voltdb.stream.plugin.volt.api.VoltProcedureRequest;
import org.voltdb.stream.plugin.volt.api.VoltProcedureSinkConfigBuilder;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * VoltSP pipeline (v4) — aligned to PoV §2 ingest behaviour and §3 subject keys:
 *
 *   Kafka(novapay-txn-events, 50 partitions)
 *     │ parse + validate against the §2.1 contract (customer_id numeric long,
 *     │ created_at ISO-8601 event time)
 *     ├─ unparseable created_at / missing subject key
 *     │      → dead-letter topic + counted in VoltDB (never dropped silently)
 *     ├─ event older than the lateness bound
 *     │      → dropped + counted (never absorbed into the wrong window)
 *     └─ valid → TWO single-partition procedure calls, one per subject key:
 *            RecordTxn(customer_id, ...)        customer tier
 *            RecordMerchantTxn(merchant_id, ...) merchant tier
 *
 * Run:
 *   export CP=target/novapay-feature-store-all.jar
 *   voltsp -l <license> --config config/pipeline-config.yaml com.novapay.poc.pipeline.TxnFeaturePipeline
 */
public final class TxnFeaturePipeline implements VoltPipeline {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String DLQ_SINK = "dlq";

    @Override
    public void define(VoltStreamBuilder stream) {
        ConfigurationContext cfg = stream.getExecutionContext().configurator();

        List<String> bootstrap = splitCsv(cfg.findByPath("kafka.bootstrap").orElse("localhost:9092"));
        String sourceTopic     = cfg.findByPath("kafka.sourceTopic").orElse("novapay-txn-events");
        String dlqTopic        = cfg.findByPath("kafka.dlqTopic").orElse("novapay-txn-dlq");
        String groupId         = cfg.findByPath("kafka.groupId").orElse("novapay-feature-agg");
        String offset          = cfg.findByPath("kafka.startingOffset").orElse("LATEST");
        String voltServers     = cfg.findByPath("volt.servers").orElse("localhost:21212");
        long latenessSeconds   = Long.parseLong(cfg.findByPath("ingest.latenessSeconds").orElse("86400"));

        stream.onError().addNamedSink(DLQ_SINK,
            KafkaSinkConfigBuilder.<String>builder()
                .withBootstrapServers(bootstrap.toArray(new String[0]))
                .withTopicName(dlqTopic)
                .withKeySerializer(StringSerializer.class)
                .withValueSerializer(StringSerializer.class));

        stream
            .withName("novapay-txn-feature-ingest-v4")
            .consumeFromSource(
                KafkaSourceConfigBuilder.<String>builder()
                    .withGroupId(groupId)
                    .withBootstrapServers(bootstrap.toArray(new String[0]))
                    .withTopicNames(sourceTopic)
                    .withStartingOffset(KafkaStartingOffset.valueOf(offset))
                    .withPollTimeout(Duration.ofMillis(250))
                    .withKeyDeserializer(StringDeserializer.class)
                    .withValueDeserializer(StringDeserializer.class)
            )
            .processWith((VoltStreamFunction<KafkaRequest<?, String>, VoltProcedureRequest>) (req, out, ctx) ->
                handle(req.getValue(), out::consume, ctx, latenessSeconds))
            .terminateWithSink(
                VoltProcedureSinkConfigBuilder.builder()
                    .withVoltClientResourceBuilder(b -> {
                        for (String s : splitCsv(voltServers)) {
                            String h = s.contains(":") ? s.substring(0, s.indexOf(':')) : s;
                            int p = s.contains(":") ? Integer.parseInt(s.substring(s.indexOf(':') + 1)) : 21212;
                            b.addToServers(h, p);
                        }
                    })
            );
    }

    interface Emit { void accept(VoltProcedureRequest r); }

    static void handle(String raw, Emit emit, ExecutionContext ctx, long latenessSeconds) {
        JsonNode e;
        try {
            e = JSON.readTree(raw);
        } catch (Exception ex) {
            deadLetter(ctx, emit, raw, "dlq_unparseable_json");
            return;
        }

        // §2.1 contract: customer_id is numeric (long)
        long customerId = e.path("customer_id").asLong(0);
        String txnId = e.path("txn_id").asText(null);
        if (customerId <= 0 || txnId == null || txnId.isEmpty()) {
            deadLetter(ctx, emit, raw, "dlq_missing_subject_key");
            return;
        }

        // §2.2: unparseable created_at → dead-letter, never defaulted to arrival time
        long createdAtMicros;
        try {
            createdAtMicros = Instant.parse(e.path("created_at").asText("")).toEpochMilli() * 1000L;
        } catch (Exception ex) {
            deadLetter(ctx, emit, raw, "dlq_unparseable_created_at");
            return;
        }

        // §2.2 / C2: beyond the lateness bound → dropped and counted,
        // never absorbed into the wrong window
        long ageSeconds = (System.currentTimeMillis() * 1000L - createdAtMicros) / 1_000_000L;
        if (ageSeconds > latenessSeconds) {
            deadLetter(ctx, emit, raw, "dropped_late");
            return;
        }

        double amount        = e.path("amount").asDouble(0.0);
        String eventType     = e.path("event_type").asText("");
        String txnType       = e.path("txn_type").asText("");
        String paymentResult = e.path("payment_result").asText("");
        String merchantId    = e.path("merchant_id").asText("");
        String city          = e.path("city").asText("");

        // subject key 1: customer tier (raw + daily + profile/derived)
        emit.accept(new VoltProcedureRequest("RecordTxn", new Object[]{
            customerId, txnId, createdAtMicros, amount,
            eventType, txnType, paymentResult, merchantId, city}));

        // subject key 2: merchant tier (minute buckets — high-frequency key)
        if (!merchantId.isEmpty()) {
            emit.accept(new VoltProcedureRequest("RecordMerchantTxn", new Object[]{
                merchantId, txnId, createdAtMicros, amount, eventType, paymentResult}));
        }
    }

    private static void deadLetter(ExecutionContext ctx, Emit emit, String raw, String reason) {
        try {
            ctx.execution().emit(DLQ_SINK, raw);
        } catch (Exception ex) {
            System.err.println("[pipeline] DLQ emit failed (" + reason + "): " + ex.getMessage());
        }
        emit.accept(new VoltProcedureRequest("BumpCounter", new Object[]{reason}));
    }

    private static List<String> splitCsv(String s) {
        List<String> out = new ArrayList<>();
        for (String x : s.split(",")) { String t = x.trim(); if (!t.isEmpty()) out.add(t); }
        return out;
    }
}
