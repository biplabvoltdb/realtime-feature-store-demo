package com.novapay.poc.procedures;

import org.voltdb.SQLStmt;
import org.voltdb.VoltProcedure;
import org.voltdb.VoltTable;
import org.voltdb.types.TimestampType;

/**
 * Merchant rolling-window read (v4), single-partition on MERCHANT_ID.
 * Sums minute buckets newer than the minute-floored cutoff — minute-exact
 * at any span within the tier's 7-day TTL.
 */
public class GetMerchantFeatures extends VoltProcedure {

    public final SQLStmt agg = new SQLStmt(
        "SELECT COUNT(*) AS BUCKETS, " +
        "COALESCE(SUM(ATTEMPT_COUNT), 0)      AS ATTEMPT_COUNT, " +
        "COALESCE(SUM(TXN_COUNT), 0)          AS TXN_COUNT, " +
        "COALESCE(SUM(AMOUNT_SUM), 0)         AS AMOUNT_SUM, " +
        "MIN(AMOUNT_MIN)                      AS AMOUNT_MIN, " +
        "MAX(AMOUNT_MAX)                      AS AMOUNT_MAX, " +
        "COALESCE(SUM(SUCCESS_COUNT), 0)      AS SUCCESS_COUNT, " +
        "COALESCE(SUM(SUCCESS_AMOUNT_SUM), 0) AS SUCCESS_AMOUNT_SUM " +
        "FROM MERCHANT_MINUTE WHERE MERCHANT_ID = ? AND BUCKET_START > ?;");

    public VoltTable[] run(String merchantId, int windowMinutes) {
        long nowMs = getTransactionTime().getTime();
        long floorMs = nowMs - (nowMs % 60_000L);
        TimestampType cutoff = new TimestampType((floorMs - windowMinutes * 60_000L) * 1000L);
        voltQueueSQL(agg, merchantId, cutoff);
        return voltExecuteSQL(true);
    }
}
