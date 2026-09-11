-- ============================================================================
-- Demo queries (v4) — run in sqlcmd while the pipeline + loadgen are live.
-- Customer ids are numeric 12-digit longs (PoV §2.1), e.g. 100000012345.
-- ============================================================================

-- 1. Find busy customers to demo with (ad-hoc, last 24h from the daily tier)
SELECT CUSTOMER_ID, SUM(TXN_COUNT) AS TXNS, SUM(TXN_AMOUNT_SUM) AS SPEND
FROM CUSTOMER_DAILY WHERE DAY_START > DATEADD(DAY, -1, NOW())
GROUP BY CUSTOMER_ID ORDER BY SPEND DESC LIMIT 10;

-- 2. HOT-tier feature read (<=7d windows): exact from raw — filtered
--    aggregates, min/max, exact COUNT_DISTINCT on amount and merchant,
--    plus the profile row (last_city + materialized avg_ticket, §4.1)
exec GetRollingFeatures 100000012345 1440;

-- 3. Eviction proof: 5-minute window twice, loadgen stopped in between —
--    totals shrink with no new events and no batch job (T23 aggregation half)
exec GetRollingFeatures 100000012345 5;

-- 4. WARM-tier feature read (>7d windows): summed from daily buckets;
--    leading edge is live (today's bucket updates per event), trailing edge
--    advances at day granularity — the documented tiering trade-off
exec GetRollingFeatures 100000012345 43200;

-- 5. The materialized derived attribute + lifetime attributes (§4.1
--    avg_ticket, last_city) — recomputed inside every ingest transaction
exec GetProfile 100000012345;

-- 6. MERCHANT tier (second subject key, §3): minute-exact windows where
--    minute buckets actually compress (~50 events/min at hot merchants).
--    Hot merchants are M-00000 .. M-00499.
exec GetMerchantFeatures 'M-00042' 60;

-- 7. Ingest correctness counters (§2.2: never dropped silently):
--    dlq_unparseable_created_at / dlq_missing_subject_key / dropped_late
exec GetCounters;
--    (the rejected payloads themselves are on the Kafka topic novapay-txn-dlq)

-- 8. Dedupe proof: retried payments counted once (C5)
SELECT CUSTOMER_ID, TXN_ID, AMOUNT, ATTEMPT_COUNT, PAYMENT_RESULT
FROM TXN_RAW WHERE ATTEMPT_COUNT > 1 ORDER BY ATTEMPT_COUNT DESC LIMIT 10;

-- 9. The daily-bucket storage model behind long windows
exec GetDailyBuckets 100000012345;

-- 10. Sizing inputs (PoV §8): rows + memory per table
exec @Statistics TABLE 0;
