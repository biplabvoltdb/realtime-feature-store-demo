package com.novapay.poc.procedures;

import org.voltdb.SQLStmt;
import org.voltdb.VoltProcedure;
import org.voltdb.VoltTable;
import org.voltdb.types.TimestampType;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Customer-tier ingest transaction (v4), one call per event, single-partition
 * on CUSTOMER_ID (BIGINT, PoV §2.1 contract). In one ACID transaction:
 *
 *   1. dedupe by (customer_id, txn_id) — retries never double-count,
 *   2. insert the raw event (7-day hot tier: exact windows, all aggregators),
 *   3. accumulate the (customer, day) bucket in CUSTOMER_DAILY (90-day warm
 *      tier) including the §4.1 composite-filter accumulator
 *      (event_type=MANDATE AND txn_type=AUTO_DEBIT) and the 38 width fillers,
 *   4. maintain CUSTOMER_PROFILE: lifetime attributes (first_seen, last_city,
 *      lifetime sums) and the MATERIALIZED derived attribute avg_ticket =
 *      txn_amount_sum_24h / txn_count_24h, recomputed whenever an input
 *      changes (PoV §4.1: "not a query-time expression").
 *
 * All time arithmetic uses the event's created_at (event time, C1).
 */
public class RecordTxn extends VoltProcedure {

    private static final int FILLERS = 38;
    private static final String FILLER_COLS =
        "F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, " +
        "F11, F12, F13, F14, F15, F16, F17, F18, F19, F20, " +
        "F21, F22, F23, F24, F25, F26, F27, F28, F29, F30, " +
        "F31, F32, F33, F34, F35, F36, F37, F38";
    private static final String FILLER_QS =
        "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, " +
        "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?";

    public final SQLStmt getRaw = new SQLStmt(
        "SELECT ATTEMPT_COUNT FROM TXN_RAW WHERE CUSTOMER_ID = ? AND TXN_ID = ?;");

    public final SQLStmt insertRaw = new SQLStmt(
        "INSERT INTO TXN_RAW (CUSTOMER_ID, TXN_ID, CREATED_AT, EVENT_TYPE, TXN_TYPE, AMOUNT, " +
        "CURRENCY, PAYMENT_RESULT, MERCHANT_ID, CITY, ATTEMPT_COUNT, LAST_ATTEMPT_AT) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?);");

    public final SQLStmt updateRawRetry = new SQLStmt(
        "UPDATE TXN_RAW SET ATTEMPT_COUNT = ATTEMPT_COUNT + 1, LAST_ATTEMPT_AT = ?, " +
        "PAYMENT_RESULT = ? WHERE CUSTOMER_ID = ? AND TXN_ID = ?;");

    public final SQLStmt getDaily = new SQLStmt(
        "SELECT ATTEMPT_COUNT, TXN_COUNT, TXN_AMOUNT_SUM, AMOUNT_MIN, AMOUNT_MAX, " +
        "SUCCESS_COUNT, SUCCESS_AMOUNT_SUM, CARD_COUNT, CARD_AMOUNT_SUM, MANDATE_COUNT, MANDATE_AMOUNT_SUM " +
        "FROM CUSTOMER_DAILY WHERE CUSTOMER_ID = ? AND DAY_START = ?;");

    public final SQLStmt upsertDaily = new SQLStmt(
        "UPSERT INTO CUSTOMER_DAILY (CUSTOMER_ID, DAY_START, ATTEMPT_COUNT, TXN_COUNT, " +
        "TXN_AMOUNT_SUM, AMOUNT_MIN, AMOUNT_MAX, SUCCESS_COUNT, SUCCESS_AMOUNT_SUM, " +
        "CARD_COUNT, CARD_AMOUNT_SUM, MANDATE_COUNT, MANDATE_AMOUNT_SUM, " + FILLER_COLS + ") " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, " + FILLER_QS + ");");

    public final SQLStmt getProfile = new SQLStmt(
        "SELECT FIRST_SEEN, LIFETIME_TXN_COUNT, LIFETIME_AMOUNT_SUM " +
        "FROM CUSTOMER_PROFILE WHERE CUSTOMER_ID = ?;");

    public final SQLStmt sum24h = new SQLStmt(
        "SELECT COUNT(*) AS C, COALESCE(SUM(AMOUNT), 0) AS S FROM TXN_RAW " +
        "WHERE CUSTOMER_ID = ? AND EVENT_TYPE = 'TXN' AND CREATED_AT > ?;");

    public final SQLStmt upsertProfile = new SQLStmt(
        "UPSERT INTO CUSTOMER_PROFILE (CUSTOMER_ID, FIRST_SEEN, LAST_TXN_AT, LAST_CITY, " +
        "LIFETIME_TXN_COUNT, LIFETIME_AMOUNT_SUM, TXN_COUNT_24H, TXN_AMOUNT_SUM_24H, AVG_TICKET) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);");

    public long run(long customerId, String txnId, long createdAtMicros, double amount,
                    String eventType, String txnType, String paymentResult,
                    String merchantId, String city) {

        TimestampType createdAt = new TimestampType(createdAtMicros);
        long dayMicros = createdAtMicros - (createdAtMicros % 86_400_000_000L);
        TimestampType dayStart = new TimestampType(dayMicros);
        BigDecimal amt = BigDecimal.valueOf(amount);

        voltQueueSQL(getRaw, customerId, txnId);
        voltQueueSQL(getDaily, customerId, dayStart);
        voltQueueSQL(getProfile, customerId);
        VoltTable[] pre = voltExecuteSQL();

        boolean duplicate = pre[0].advanceRow();
        boolean isTxn = "TXN".equals(eventType);
        boolean success = isTxn && "SUCCESS".equals(paymentResult);
        boolean card = isTxn && "CARD_PAY".equals(txnType);
        boolean mandate = "MANDATE".equals(eventType) && "AUTO_DEBIT".equals(txnType);

        // ---- daily bucket accumulators ----
        long attempts = 0, txnCount = 0, succCount = 0, cardCount = 0, mandCount = 0;
        BigDecimal txnSum = BigDecimal.ZERO, succSum = BigDecimal.ZERO,
                   cardSum = BigDecimal.ZERO, mandSum = BigDecimal.ZERO;
        BigDecimal amountMin = null, amountMax = null;
        VoltTable daily = pre[1];
        if (daily.advanceRow()) {
            attempts  = daily.getLong("ATTEMPT_COUNT");
            txnCount  = daily.getLong("TXN_COUNT");
            txnSum    = daily.getDecimalAsBigDecimal("TXN_AMOUNT_SUM");
            amountMin = daily.getDecimalAsBigDecimal("AMOUNT_MIN");
            if (daily.wasNull()) amountMin = null;
            amountMax = daily.getDecimalAsBigDecimal("AMOUNT_MAX");
            if (daily.wasNull()) amountMax = null;
            succCount = daily.getLong("SUCCESS_COUNT");
            succSum   = daily.getDecimalAsBigDecimal("SUCCESS_AMOUNT_SUM");
            cardCount = daily.getLong("CARD_COUNT");
            cardSum   = daily.getDecimalAsBigDecimal("CARD_AMOUNT_SUM");
            mandCount = daily.getLong("MANDATE_COUNT");
            mandSum   = daily.getDecimalAsBigDecimal("MANDATE_AMOUNT_SUM");
        }

        // ---- profile state ----
        TimestampType firstSeen = createdAt;
        long lifeCount = 0;
        BigDecimal lifeSum = BigDecimal.ZERO;
        VoltTable prof = pre[2];
        if (prof.advanceRow()) {
            firstSeen = prof.getTimestampAsTimestamp("FIRST_SEEN");
            lifeCount = prof.getLong("LIFETIME_TXN_COUNT");
            lifeSum   = prof.getDecimalAsBigDecimal("LIFETIME_AMOUNT_SUM");
        }

        attempts += 1;
        if (duplicate) {
            voltQueueSQL(updateRawRetry, createdAt, paymentResult, customerId, txnId);
        } else {
            voltQueueSQL(insertRaw, customerId, txnId, createdAt, eventType, txnType, amt,
                         "INR", paymentResult, merchantId, city, createdAt);
            if (isTxn) {
                txnCount += 1;
                txnSum = txnSum.add(amt);
                amountMin = (amountMin == null || amt.compareTo(amountMin) < 0) ? amt : amountMin;
                amountMax = (amountMax == null || amt.compareTo(amountMax) > 0) ? amt : amountMax;
                lifeCount += 1;
                lifeSum = lifeSum.add(amt);
            }
            if (success) { succCount += 1; succSum = succSum.add(amt); }
            if (card)    { cardCount += 1; cardSum = cardSum.add(amt); }
            if (mandate) { mandCount += 1; mandSum = mandSum.add(amt); }
        }

        Object[] args = new Object[13 + FILLERS];
        args[0] = customerId;  args[1] = dayStart;
        args[2] = attempts;    args[3] = txnCount;
        args[4] = txnSum;      args[5] = amountMin;  args[6] = amountMax;
        args[7] = succCount;   args[8] = succSum;
        args[9] = cardCount;   args[10] = cardSum;
        args[11] = mandCount;  args[12] = mandSum;
        long seed = (Double.doubleToLongBits(amount) ^ txnId.hashCode()) & 0x7FFFFFFFL;
        for (int i = 0; i < FILLERS; i++) args[13 + i] = (seed + 31L * i) % 1_000_000L;
        voltQueueSQL(upsertDaily, args);

        // materialized derived attribute: recompute 24h inputs over raw
        // (event-time window, deterministic) now that the raw row is in place
        TimestampType cutoff24h = new TimestampType(createdAtMicros - 86_400_000_000L);
        voltQueueSQL(sum24h, customerId, cutoff24h);
        VoltTable[] mid = voltExecuteSQL();
        VoltTable s = mid[mid.length - 1];
        s.advanceRow();
        long count24 = s.getLong("C");
        BigDecimal sum24 = s.getDecimalAsBigDecimal("S");
        BigDecimal avgTicket = count24 > 0
            ? sum24.divide(BigDecimal.valueOf(count24), 4, RoundingMode.HALF_UP)
            : null;

        voltQueueSQL(upsertProfile, customerId, firstSeen, createdAt,
                     (city == null || city.isEmpty()) ? null : city,
                     lifeCount, lifeSum, count24, sum24, avgTicket);
        voltExecuteSQL(true);

        return duplicate ? 0L : 1L;
    }
}
