# Presenter Runbook

A repeatable technical walk-through. Assumes the stack is up (see
[DEPLOYMENT](DEPLOYMENT.md)) and `sqlcmd` is on your path
(`$VOLTDB_HOME/bin/sqlcmd`). Four terminals: **T1** pipeline, **T2** loadgen,
**T3** query bench, **T4** `sqlcmd`. Everything runs from the project root.

Tip: the optional operator console (`ui/`) shows all of this visually, and its
**Demo Control** page can start/stop load and reset the demo from the browser.

---

### Step 1 — Start the stream processor (T1)

```bash
./scripts/04_run_pipeline.sh
```
> VoltSP replaces the stream-compute tier: stateless, consuming all 50 Kafka partitions, validating the
> ingest contract, turning each event into one ACID transaction. No micro-batch anywhere in the path.

### Step 2 — Start the payment stream (T2)

```bash
./scripts/05_run_loadgen.sh 2000 10000000
```
> 2,000 events/sec of 48-field payment events — numeric customer IDs drawn from a 10M pool, a TXN/MANDATE/
> REFUND mix, hot-merchant skew, plus injected edge cases (bad timestamps, missing keys, late events,
> retries). Let it run ~2 minutes before Step 3. **Note:** the customer number is the *size of the random
> ID pool*, not a count of rows to create — profiles materialize lazily as distinct customers are first seen.

### Step 3 — The feature read (T4)

```sql
-- find a busy customer, then read their full 24h feature vector
SELECT CUSTOMER_ID, SUM(TXN_COUNT) TXNS, SUM(TXN_AMOUNT_SUM) SPEND
FROM CUSTOMER_DAILY WHERE DAY_START > DATEADD(DAY,-1,NOW())
GROUP BY CUSTOMER_ID ORDER BY SPEND DESC LIMIT 5;

exec GetRollingFeatures <customer_id> 1440;
```
> One call returns filtered sums/counts/min/max, exact count-distinct, and composite-filter features — on
> data that was in Kafka milliseconds ago.

### Step 4 — Eviction without an arriving event (T4 + T2)

```sql
exec GetRollingFeatures <customer_id> 5;
```
Now **Ctrl-C the loadgen** (T2), wait ~2 minutes, run the same query again.
> The total shrank — no new event, no batch job. "Last 5 minutes" is a predicate over event-time data, so
> the value decays exactly on time. Restart the loadgen afterwards.

### Step 5 — Tiering: a 30-day window (T4)

```sql
exec GetRollingFeatures <customer_id> 43200;
exec GetDailyBuckets <customer_id>;
```
> Beyond 7 days the same call routes to daily buckets — live leading edge, day-granular trailing edge.
> Precision where money moves, compression where it doesn't.

### Step 6 — Lifetime & derived attributes (T4)

```sql
exec GetProfile <customer_id>;
```
> `last_city` is a lifetime LAST attribute; `avg_ticket` is a derived attribute — materialized and
> recomputed inside every ingest transaction, not a query-time expression.

### Step 7 — The merchant tier (T4)

```sql
exec GetMerchantFeatures 'M-00042' 60;
```
> Subject keys are declared per use case. Busy merchants see ~50 events/min, so minute buckets compress
> ~50:1; customers at ~1/min keep raw events. Storage follows the data's frequency.

### Step 8 — Ingest hygiene: nothing dropped silently (T4)

```sql
exec GetCounters;
SELECT CUSTOMER_ID, TXN_ID, ATTEMPT_COUNT FROM TXN_RAW
WHERE ATTEMPT_COUNT > 1 ORDER BY ATTEMPT_COUNT DESC LIMIT 5;
```
Optionally tail the dead-letter topic:
```bash
"$KAFKA_HOME"/bin/kafka-console-consumer.sh --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic novapay-txn-dlq --from-beginning --max-messages 3
```
> Unparseable timestamps, missing keys, and beyond-lateness events are dead-lettered **and counted**.
> Retries never double-count (dedupe on the raw table's primary key).

### Step 9 — Read latency under live writes (T3)

```bash
./scripts/06_run_querybench.sh 500
```
> 500 reads/sec mixing hot, 30-day, and merchant reads *while ingest runs* — read p99 in low single-digit
> milliseconds.

### Step 10 — The peak: 15,000 events/sec (T2, replacing the 2K loadgen)

```bash
./scripts/05_run_loadgen.sh 15000 10000000
```
After 2–3 minutes, the decisive metric — consumer lag:
```bash
"$KAFKA_HOME"/bin/kafka-consumer-groups.sh --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --describe --group novapay-feature-agg | awk 'NR==1||/novapay-txn-events/{lag+=$6} END{print "TOTAL LAG:", lag}'
```
```sql
exec @Statistics TABLE 0;   -- measured bytes/subject for sizing (see README §8)
```
> Consumer lag ~0 at 15,000 events/sec sustained — the peak target — while reads stay low-ms. Use a large
> customer pool (10M) so per-customer history stays realistic; a tiny pool concentrates history and makes
> the per-event work grow, which is a workload artifact, not a system limit.

---

### Reset between rehearsals

```bash
./scripts/03_deploy_schema.sh    # drops + redeploys schema (fresh data)
```
For a full reset including Kafka, see [DEPLOYMENT §10](DEPLOYMENT.md#10-reset--teardown) — or use the
console's **Demo Control → Reset** button.
