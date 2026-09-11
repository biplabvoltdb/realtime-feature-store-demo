-- ============================================================================
-- NovaPay feature-store PoC v4 — tiered schema, aligned to the PoV document
--
-- Tier design (driven by measured event frequency: customers ~1 event/min,
-- merchants up to ~50 events/min):
--   * CUSTOMER tier: raw events for 7 days (exact everything — any window
--     granularity, all aggregators incl. COUNT_DISTINCT) + DAILY buckets for
--     90 days (SUM/COUNT/MIN/MAX + composite-filter accumulators + the 38
--     filler accumulators that keep the 200-attribute memory measurement
--     honest) + one PROFILE row (lifetime attributes and the materialized
--     derived avg_ticket, PoV §4.1).
--   * MERCHANT tier: minute buckets — the one place minute buckets actually
--     compress (~50:1) — with their own dedupe table (second subject key,
--     PoV §3).
--   * COUNTERS: dead-letter / late-drop counts (PoV §2.2 "counted, never
--     dropped silently").
--
-- PoV §2.1 contract: customer_id is numeric (long, ~12 digits) → BIGINT.
--
-- Deploy (from the project root, after `mvn -q -DskipTests package`):
--   sqlcmd < src/main/resources/ddl.sql
-- ============================================================================

-- Batched teardown of any prior procedure definitions (idempotent; remove_db.sql
-- does the full drop). Batching sends the whole block as one catalog update
-- instead of one round trip per statement.
file -inlinebatch END_OF_DROP_BATCH

DROP PROCEDURE com.novapay.poc.procedures.RecordTxn IF EXISTS;
DROP PROCEDURE com.novapay.poc.procedures.GetRollingFeatures IF EXISTS;
DROP PROCEDURE com.novapay.poc.procedures.RecordMerchantTxn IF EXISTS;
DROP PROCEDURE com.novapay.poc.procedures.GetMerchantFeatures IF EXISTS;
DROP PROCEDURE com.novapay.poc.procedures.BumpCounter IF EXISTS;
DROP PROCEDURE GetRecentTxns IF EXISTS;
DROP PROCEDURE GetProfile IF EXISTS;
DROP PROCEDURE GetDailyBuckets IF EXISTS;
DROP PROCEDURE GetCounters IF EXISTS;

END_OF_DROP_BATCH

-- Tell sqlcmd to batch the following commands together,
-- so that the schema loads quickly.
file -inlinebatch END_OF_BATCH

-- ---------------------------------------------------------------- customer --
-- Hot tier: deduplicated raw events, ALL event types, 7-day TTL.
CREATE TABLE TXN_RAW (
    CUSTOMER_ID     BIGINT       NOT NULL,
    TXN_ID          VARCHAR(64)  NOT NULL,
    CREATED_AT      TIMESTAMP    NOT NULL,
    EVENT_TYPE      VARCHAR(16)  NOT NULL,
    TXN_TYPE        VARCHAR(24),
    AMOUNT          DECIMAL      NOT NULL,
    CURRENCY        VARCHAR(8),
    PAYMENT_RESULT  VARCHAR(24),
    MERCHANT_ID     VARCHAR(24),
    CITY            VARCHAR(32),
    ATTEMPT_COUNT   INTEGER      DEFAULT 1 NOT NULL,
    LAST_ATTEMPT_AT TIMESTAMP,
    PRIMARY KEY (CUSTOMER_ID, TXN_ID)
) USING TTL 7 DAYS ON COLUMN CREATED_AT BATCH_SIZE 5000;
PARTITION TABLE TXN_RAW ON COLUMN CUSTOMER_ID;
CREATE INDEX IDX_TXN_RAW_CUST_TIME ON TXN_RAW (CUSTOMER_ID, CREATED_AT);
CREATE INDEX IDX_TXN_RAW_TTL       ON TXN_RAW (CREATED_AT);

-- Warm tier: daily buckets, 90-day TTL. Carries the non-subtractable
-- aggregators (MIN/MAX) and all filtered accumulators at full 200-attribute
-- width (F01..F38 are the width fillers, see README).
CREATE TABLE CUSTOMER_DAILY (
    CUSTOMER_ID         BIGINT    NOT NULL,
    DAY_START           TIMESTAMP NOT NULL,
    ATTEMPT_COUNT       BIGINT    DEFAULT 0 NOT NULL,   -- all events incl. retries
    TXN_COUNT           BIGINT    DEFAULT 0 NOT NULL,   -- event_type=TXN, deduped
    TXN_AMOUNT_SUM      DECIMAL   DEFAULT 0 NOT NULL,
    AMOUNT_MIN          DECIMAL,
    AMOUNT_MAX          DECIMAL,
    SUCCESS_COUNT       BIGINT    DEFAULT 0 NOT NULL,   -- TXN & payment_result=SUCCESS
    SUCCESS_AMOUNT_SUM  DECIMAL   DEFAULT 0 NOT NULL,
    CARD_COUNT          BIGINT    DEFAULT 0 NOT NULL,   -- TXN & txn_type=CARD_PAY
    CARD_AMOUNT_SUM     DECIMAL   DEFAULT 0 NOT NULL,
    MANDATE_COUNT       BIGINT    DEFAULT 0 NOT NULL,   -- event_type=MANDATE & txn_type=AUTO_DEBIT (§4.1 composite filter)
    MANDATE_AMOUNT_SUM  DECIMAL   DEFAULT 0 NOT NULL,
    F01 BIGINT DEFAULT 0 NOT NULL, F02 BIGINT DEFAULT 0 NOT NULL,
    F03 BIGINT DEFAULT 0 NOT NULL, F04 BIGINT DEFAULT 0 NOT NULL,
    F05 BIGINT DEFAULT 0 NOT NULL, F06 BIGINT DEFAULT 0 NOT NULL,
    F07 BIGINT DEFAULT 0 NOT NULL, F08 BIGINT DEFAULT 0 NOT NULL,
    F09 BIGINT DEFAULT 0 NOT NULL, F10 BIGINT DEFAULT 0 NOT NULL,
    F11 BIGINT DEFAULT 0 NOT NULL, F12 BIGINT DEFAULT 0 NOT NULL,
    F13 BIGINT DEFAULT 0 NOT NULL, F14 BIGINT DEFAULT 0 NOT NULL,
    F15 BIGINT DEFAULT 0 NOT NULL, F16 BIGINT DEFAULT 0 NOT NULL,
    F17 BIGINT DEFAULT 0 NOT NULL, F18 BIGINT DEFAULT 0 NOT NULL,
    F19 BIGINT DEFAULT 0 NOT NULL, F20 BIGINT DEFAULT 0 NOT NULL,
    F21 BIGINT DEFAULT 0 NOT NULL, F22 BIGINT DEFAULT 0 NOT NULL,
    F23 BIGINT DEFAULT 0 NOT NULL, F24 BIGINT DEFAULT 0 NOT NULL,
    F25 BIGINT DEFAULT 0 NOT NULL, F26 BIGINT DEFAULT 0 NOT NULL,
    F27 BIGINT DEFAULT 0 NOT NULL, F28 BIGINT DEFAULT 0 NOT NULL,
    F29 BIGINT DEFAULT 0 NOT NULL, F30 BIGINT DEFAULT 0 NOT NULL,
    F31 BIGINT DEFAULT 0 NOT NULL, F32 BIGINT DEFAULT 0 NOT NULL,
    F33 BIGINT DEFAULT 0 NOT NULL, F34 BIGINT DEFAULT 0 NOT NULL,
    F35 BIGINT DEFAULT 0 NOT NULL, F36 BIGINT DEFAULT 0 NOT NULL,
    F37 BIGINT DEFAULT 0 NOT NULL, F38 BIGINT DEFAULT 0 NOT NULL,
    PRIMARY KEY (CUSTOMER_ID, DAY_START)
) USING TTL 90 DAYS ON COLUMN DAY_START BATCH_SIZE 5000;
PARTITION TABLE CUSTOMER_DAILY ON COLUMN CUSTOMER_ID;
CREATE INDEX IDX_CUSTOMER_DAILY_TTL ON CUSTOMER_DAILY (DAY_START);

-- Lifetime attributes + materialized derived attribute (PoV §4.1 last_city,
-- avg_ticket). One row per customer, recomputed inside the ingest transaction.
CREATE TABLE CUSTOMER_PROFILE (
    CUSTOMER_ID        BIGINT    NOT NULL,
    FIRST_SEEN         TIMESTAMP NOT NULL,
    LAST_TXN_AT        TIMESTAMP NOT NULL,
    LAST_CITY          VARCHAR(32),
    LIFETIME_TXN_COUNT BIGINT    DEFAULT 0 NOT NULL,
    LIFETIME_AMOUNT_SUM DECIMAL  DEFAULT 0 NOT NULL,
    TXN_COUNT_24H      BIGINT    DEFAULT 0 NOT NULL,
    TXN_AMOUNT_SUM_24H DECIMAL   DEFAULT 0 NOT NULL,
    AVG_TICKET         DECIMAL,                          -- derived: sum_24h / count_24h, materialized
    PRIMARY KEY (CUSTOMER_ID)
);
PARTITION TABLE CUSTOMER_PROFILE ON COLUMN CUSTOMER_ID;

-- ---------------------------------------------------------------- merchant --
-- Second subject key (PoV §3). Minute buckets pay off here: ~50 events/min
-- per busy merchant compress ~50:1.
CREATE TABLE MERCHANT_TXN_SEEN (
    MERCHANT_ID VARCHAR(24) NOT NULL,
    TXN_ID      VARCHAR(64) NOT NULL,
    CREATED_AT  TIMESTAMP   NOT NULL,
    PRIMARY KEY (MERCHANT_ID, TXN_ID)
) USING TTL 48 HOURS ON COLUMN CREATED_AT BATCH_SIZE 5000;
PARTITION TABLE MERCHANT_TXN_SEEN ON COLUMN MERCHANT_ID;
CREATE INDEX IDX_MERCHANT_SEEN_TTL ON MERCHANT_TXN_SEEN (CREATED_AT);

CREATE TABLE MERCHANT_MINUTE (
    MERCHANT_ID        VARCHAR(24) NOT NULL,
    BUCKET_START       TIMESTAMP   NOT NULL,
    ATTEMPT_COUNT      BIGINT      DEFAULT 0 NOT NULL,
    TXN_COUNT          BIGINT      DEFAULT 0 NOT NULL,
    AMOUNT_SUM         DECIMAL     DEFAULT 0 NOT NULL,
    AMOUNT_MIN         DECIMAL,
    AMOUNT_MAX         DECIMAL,
    SUCCESS_COUNT      BIGINT      DEFAULT 0 NOT NULL,
    SUCCESS_AMOUNT_SUM DECIMAL     DEFAULT 0 NOT NULL,
    PRIMARY KEY (MERCHANT_ID, BUCKET_START)
) USING TTL 7 DAYS ON COLUMN BUCKET_START BATCH_SIZE 5000;
PARTITION TABLE MERCHANT_MINUTE ON COLUMN MERCHANT_ID;
CREATE INDEX IDX_MERCHANT_MINUTE_TTL ON MERCHANT_MINUTE (BUCKET_START);

-- ---------------------------------------------------------------- counters --
-- PoV §2.2: bad/late events are counted, never silently dropped.
CREATE TABLE COUNTERS (
    NAME VARCHAR(64) NOT NULL,
    VAL  BIGINT      DEFAULT 0 NOT NULL,
    PRIMARY KEY (NAME)
);
PARTITION TABLE COUNTERS ON COLUMN NAME;

END_OF_BATCH

-- ============================================================================
-- Java stored procedures
-- ============================================================================
-- Update classes from the jar so the server knows about the procedure classes.
-- This command cannot be part of a DDL batch.
LOAD CLASSES target/novapay-feature-store-procedures.jar;

-- The following CREATE PROCEDURE statements can all be batched.
file -inlinebatch END_OF_2ND_BATCH

CREATE PROCEDURE PARTITION ON TABLE TXN_RAW COLUMN CUSTOMER_ID
    FROM CLASS com.novapay.poc.procedures.RecordTxn;

CREATE PROCEDURE PARTITION ON TABLE TXN_RAW COLUMN CUSTOMER_ID
    FROM CLASS com.novapay.poc.procedures.GetRollingFeatures;

CREATE PROCEDURE PARTITION ON TABLE MERCHANT_MINUTE COLUMN MERCHANT_ID
    FROM CLASS com.novapay.poc.procedures.RecordMerchantTxn;

CREATE PROCEDURE PARTITION ON TABLE MERCHANT_MINUTE COLUMN MERCHANT_ID
    FROM CLASS com.novapay.poc.procedures.GetMerchantFeatures;

CREATE PROCEDURE PARTITION ON TABLE COUNTERS COLUMN NAME
    FROM CLASS com.novapay.poc.procedures.BumpCounter;

-- ============================================================================
-- DDL-defined convenience procedures
-- ============================================================================

CREATE PROCEDURE GetRecentTxns
    PARTITION ON TABLE TXN_RAW COLUMN CUSTOMER_ID
    AS SELECT TXN_ID, CREATED_AT, EVENT_TYPE, TXN_TYPE, AMOUNT, PAYMENT_RESULT, MERCHANT_ID, CITY, ATTEMPT_COUNT
       FROM TXN_RAW WHERE CUSTOMER_ID = ? ORDER BY CREATED_AT DESC, TXN_ID LIMIT 20;

CREATE PROCEDURE GetProfile
    PARTITION ON TABLE CUSTOMER_PROFILE COLUMN CUSTOMER_ID
    AS SELECT * FROM CUSTOMER_PROFILE WHERE CUSTOMER_ID = ?;

CREATE PROCEDURE GetDailyBuckets
    PARTITION ON TABLE CUSTOMER_DAILY COLUMN CUSTOMER_ID
    AS SELECT DAY_START, TXN_COUNT, ATTEMPT_COUNT, TXN_AMOUNT_SUM, AMOUNT_MIN, AMOUNT_MAX,
              SUCCESS_COUNT, CARD_COUNT, CARD_AMOUNT_SUM, MANDATE_COUNT, MANDATE_AMOUNT_SUM
       FROM CUSTOMER_DAILY WHERE CUSTOMER_ID = ? ORDER BY DAY_START DESC LIMIT 30;

CREATE PROCEDURE GetCounters
    AS SELECT NAME, VAL FROM COUNTERS ORDER BY NAME;

END_OF_2ND_BATCH
