package com.novapay.poc.procedures;

import org.voltdb.SQLStmt;
import org.voltdb.VoltProcedure;
import org.voltdb.VoltTable;
import org.voltdb.types.TimestampType;

/**
 * Tier-aware rolling-window feature read (v4), single-partition on
 * CUSTOMER_ID (parameter 0).
 *
 *   windowMinutes <= 7 days  -> computed EXACTLY from raw events (hot tier):
 *                               any granularity, filtered aggregates via CASE,
 *                               exact COUNT_DISTINCT on amount (§4.1) and on
 *                               merchant_id.
 *   windowMinutes  > 7 days  -> summed from CUSTOMER_DAILY (warm tier):
 *                               minute-exact leading edge (today's bucket is
 *                               updated per event), day-granular trailing edge.
 *
 * Always also returns the CUSTOMER_PROFILE row: lifetime attributes and the
 * materialized derived avg_ticket (§4.1 last_city / avg_ticket).
 */
public class GetRollingFeatures extends VoltProcedure {

    public static final long HOT_TIER_MINUTES = 7L * 24 * 60;

    public final SQLStmt hotAgg = new SQLStmt(
        "SELECT COUNT(*) AS RAW_EVENTS, " +
        "SUM(CASE WHEN EVENT_TYPE = 'TXN' THEN 1 ELSE 0 END) AS TXN_COUNT, " +
        "SUM(CASE WHEN EVENT_TYPE = 'TXN' THEN AMOUNT ELSE 0 END) AS TXN_AMOUNT_SUM, " +
        "MIN(CASE WHEN EVENT_TYPE = 'TXN' THEN AMOUNT END) AS AMOUNT_MIN, " +
        "MAX(CASE WHEN EVENT_TYPE = 'TXN' THEN AMOUNT END) AS AMOUNT_MAX, " +
        "SUM(CASE WHEN EVENT_TYPE = 'TXN' AND PAYMENT_RESULT = 'SUCCESS' THEN 1 ELSE 0 END) AS SUCCESS_COUNT, " +
        "SUM(CASE WHEN EVENT_TYPE = 'TXN' AND PAYMENT_RESULT = 'SUCCESS' THEN AMOUNT ELSE 0 END) AS SUCCESS_AMOUNT_SUM, " +
        "SUM(CASE WHEN EVENT_TYPE = 'TXN' AND TXN_TYPE = 'CARD_PAY' THEN 1 ELSE 0 END) AS CARD_COUNT, " +
        "SUM(CASE WHEN EVENT_TYPE = 'TXN' AND TXN_TYPE = 'CARD_PAY' THEN AMOUNT ELSE 0 END) AS CARD_AMOUNT_SUM, " +
        "SUM(CASE WHEN EVENT_TYPE = 'MANDATE' AND TXN_TYPE = 'AUTO_DEBIT' THEN 1 ELSE 0 END) AS MANDATE_COUNT, " +
        "SUM(CASE WHEN EVENT_TYPE = 'MANDATE' AND TXN_TYPE = 'AUTO_DEBIT' THEN AMOUNT ELSE 0 END) AS MANDATE_AMOUNT_SUM " +
        "FROM TXN_RAW WHERE CUSTOMER_ID = ? AND CREATED_AT > ?;");

    public final SQLStmt hotDistinctAmount = new SQLStmt(
        "SELECT COUNT(DISTINCT AMOUNT) AS AMOUNT_DISTINCT FROM TXN_RAW " +
        "WHERE CUSTOMER_ID = ? AND EVENT_TYPE = 'TXN' AND CREATED_AT > ?;");

    public final SQLStmt hotDistinctMerchant = new SQLStmt(
        "SELECT COUNT(DISTINCT MERCHANT_ID) AS DISTINCT_MERCHANTS FROM TXN_RAW " +
        "WHERE CUSTOMER_ID = ? AND EVENT_TYPE = 'TXN' AND CREATED_AT > ?;");

    public final SQLStmt warmAgg = new SQLStmt(
        "SELECT COUNT(*) AS DAYS, " +
        "COALESCE(SUM(TXN_COUNT), 0)          AS TXN_COUNT, " +
        "COALESCE(SUM(ATTEMPT_COUNT), 0)      AS ATTEMPT_COUNT, " +
        "COALESCE(SUM(TXN_AMOUNT_SUM), 0)     AS TXN_AMOUNT_SUM, " +
        "MIN(AMOUNT_MIN)                      AS AMOUNT_MIN, " +
        "MAX(AMOUNT_MAX)                      AS AMOUNT_MAX, " +
        "COALESCE(SUM(SUCCESS_COUNT), 0)      AS SUCCESS_COUNT, " +
        "COALESCE(SUM(SUCCESS_AMOUNT_SUM), 0) AS SUCCESS_AMOUNT_SUM, " +
        "COALESCE(SUM(CARD_COUNT), 0)         AS CARD_COUNT, " +
        "COALESCE(SUM(CARD_AMOUNT_SUM), 0)    AS CARD_AMOUNT_SUM, " +
        "COALESCE(SUM(MANDATE_COUNT), 0)      AS MANDATE_COUNT, " +
        "COALESCE(SUM(MANDATE_AMOUNT_SUM), 0) AS MANDATE_AMOUNT_SUM " +
        "FROM CUSTOMER_DAILY WHERE CUSTOMER_ID = ? AND DAY_START > ?;");

    public final SQLStmt profile = new SQLStmt(
        "SELECT FIRST_SEEN, LAST_TXN_AT, LAST_CITY, LIFETIME_TXN_COUNT, LIFETIME_AMOUNT_SUM, " +
        "TXN_COUNT_24H, TXN_AMOUNT_SUM_24H, AVG_TICKET " +
        "FROM CUSTOMER_PROFILE WHERE CUSTOMER_ID = ?;");

    public VoltTable[] run(long customerId, int windowMinutes) {
        long nowMs = getTransactionTime().getTime();
        long floorMs = nowMs - (nowMs % 60_000L);
        TimestampType cutoff = new TimestampType((floorMs - windowMinutes * 60_000L) * 1000L);

        if (windowMinutes <= HOT_TIER_MINUTES) {
            voltQueueSQL(hotAgg, customerId, cutoff);
            voltQueueSQL(hotDistinctAmount, customerId, cutoff);
            voltQueueSQL(hotDistinctMerchant, customerId, cutoff);
        } else {
            // day-floored cutoff: trailing edge advances at day granularity
            long dayFloorMs = nowMs - (nowMs % 86_400_000L);
            TimestampType dayCutoff =
                new TimestampType((dayFloorMs - (long) windowMinutes * 60_000L) * 1000L);
            voltQueueSQL(warmAgg, customerId, dayCutoff);
        }
        voltQueueSQL(profile, customerId);
        return voltExecuteSQL(true);
    }
}
