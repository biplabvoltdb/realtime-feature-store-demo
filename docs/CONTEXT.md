# Context — why this demo exists and what it proves

## The scenario

*NovaPay* (a fictional national digital-payments platform) runs real-time fraud & risk decisioning. For
every transaction, risk models need a **feature vector** — rolling aggregates over each customer's recent
behaviour (counts, sums, min/max, distinct merchants, filtered variants) across windows from minutes to
months — computed and served fast enough to influence the decision on *that* transaction.

The workload is demanding: peak ~15,000 events/sec, hundreds of millions of events/day, billions of keys
at rest, ~1.5 KB / 48-field events, ~250 feature definitions off one stream, and an end-to-end budget in
the low milliseconds with high availability.

## The incumbent pattern and its limits

The common build is **stream micro-batch (e.g. Spark) writing features into a wide-column store (e.g.
Cassandra)**, read at decision time. It works, but for *real-time* fraud it hits four structural walls:

1. **Same-second blind spot** — a payment in the same second as a check is invisible to it; the batch that would fold it in hasn't run.
2. **Windows can't decay between batches** — "last 24 h" must shrink as time passes even with no new event, but a micro-batch store only moves when a batch writes.
3. **Two systems drift** — the stream engine and the store hold separate state; a reconciliation pass exists permanently just to keep the numbers trustworthy.
4. **Cost of change & operations** — shipping one feature is an engineering project; multiple always-on systems each need a capacity plan.

## The approach this demo validates

Collapse compute and store into **one in-memory, transactional tier** (VoltDB), fed by a **stateless
stream processor** (VoltSP) off Kafka. Two ideas do the heavy lifting:

- **One event → one (or two) single-partition ACID transaction(s).** Each event updates the customer's
  state (and the merchant's) atomically the instant it arrives. The previous payment is visible to the
  next payment's check. No micro-batch, no reconciliation.
- **Windows as query-time sums over event-time buckets.** A rolling window is computed at read time from
  raw rows / time buckets with a time predicate, so it is exact and **decays on its own** as the clock
  moves — no job has to run to "expire" anything.

## Requirements traceability

The demo is built against a real-time segmentation & feature-store requirements spec whose sections are
referenced as `§` markers in code comments (schema/ingest contract, subject keys, attribute set,
edge-case handling, volumes & sizing). Those markers name a *spec*, not any real organization. The
mapping from requirement to demonstrated capability:

| Requirement area | What the demo shows | Where |
|---|---|---|
| Ingest contract (numeric key, ISO time, 48 fields) | Loadgen emits the contract; pipeline validates it | `TxnLoadGenerator`, `TxnFeaturePipeline` |
| Two subject keys (customer + merchant) | Separate single-partition procedures per key | `RecordTxn`, `RecordMerchantTxn` |
| Aggregator vocabulary (sum/count/min/max/distinct/filtered) | One call returns the full vector | `GetRollingFeatures` |
| Rolling windows with time-based eviction | "Last N" shrinks with the clock, no arriving event | `GetRollingFeatures`, runbook step |
| Minute precision where frequency warrants | Merchant minute buckets; customer raw exact | `MERCHANT_MINUTE`, `RecordMerchantTxn` |
| Derived / lifetime attributes | Materialized `avg_ticket`, lifetime `last_city` | `CUSTOMER_PROFILE`, `RecordTxn` |
| Exactly-once effect / dedupe | Retries never double-count | `TXN_RAW` PK + `RecordTxn` |
| Bad/late data handling | Dead-letter topic + counters + lateness bound | `novapay-txn-dlq`, `COUNTERS`, `BumpCounter` |
| Peak throughput & read latency | 15K eps sustained, zero lag; low-ms read p99 | loadgen + query bench |
| Sizing methodology | Measured bytes/subject from `@Statistics TABLE` | README §8, Sizing page |

## What is explicitly showcased

Run the [RUNBOOK](RUNBOOK.md) to demonstrate, in order: sub-second freshness, a rolling window **decaying
with no new event**, the full aggregator vocabulary in one call, the merchant minute-bucket tier, ingest
hygiene (counted dead-letters + retry dedupe), read latency under live writes, and 15,000 events/sec
sustained with the consumer never falling behind.

## Honest precision statement

Windows ≤ 7 days are exact to the second (served from raw). Windows > 7 days use the daily tier: the
leading edge is live, the trailing edge advances at **day** granularity (for a 30-day sum the trailing
day is ~3% of the value). Any feature that needs full-span minute precision can be pinned to a
minute-bucket table at a known per-feature RAM cost — the merchant tier is that pattern, worked out.

## Out of scope (roadmap)

A runtime feature-definition registry, segments with join/leave events, CEP pattern detection, and
percentile / HLL sketches. Each is additive on the existing tables and ingest transaction.
