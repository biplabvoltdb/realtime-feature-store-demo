package com.novapay.poc.procedures;

import org.voltdb.SQLStmt;
import org.voltdb.VoltProcedure;
import org.voltdb.VoltTable;
import org.voltdb.types.TimestampType;

import java.math.BigDecimal;

/**
 * Merchant-tier ingest (v4): second subject key (PoV §3 — the subject key is
 * declared per use case). Single-partition on MERCHANT_ID.
 *
 * Merchants receive up to ~50 events/minute, so minute buckets genuinely
 * compress here (~50:1) — this is the tier where minute-level aggregation
 * earns its RAM. Dedupe is per-merchant via MERCHANT_TXN_SEEN (48 h TTL).
 */
public class RecordMerchantTxn extends VoltProcedure {

    public final SQLStmt getSeen = new SQLStmt(
        "SELECT TXN_ID FROM MERCHANT_TXN_SEEN WHERE MERCHANT_ID = ? AND TXN_ID = ?;");

    public final SQLStmt insertSeen = new SQLStmt(
        "INSERT INTO MERCHANT_TXN_SEEN (MERCHANT_ID, TXN_ID, CREATED_AT) VALUES (?, ?, ?);");

    public final SQLStmt getBucket = new SQLStmt(
        "SELECT ATTEMPT_COUNT, TXN_COUNT, AMOUNT_SUM, AMOUNT_MIN, AMOUNT_MAX, " +
        "SUCCESS_COUNT, SUCCESS_AMOUNT_SUM " +
        "FROM MERCHANT_MINUTE WHERE MERCHANT_ID = ? AND BUCKET_START = ?;");

    public final SQLStmt upsertBucket = new SQLStmt(
        "UPSERT INTO MERCHANT_MINUTE (MERCHANT_ID, BUCKET_START, ATTEMPT_COUNT, TXN_COUNT, " +
        "AMOUNT_SUM, AMOUNT_MIN, AMOUNT_MAX, SUCCESS_COUNT, SUCCESS_AMOUNT_SUM) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);");

    public long run(String merchantId, String txnId, long createdAtMicros,
                    double amount, String eventType, String paymentResult) {

        TimestampType createdAt = new TimestampType(createdAtMicros);
        long bucketMicros = createdAtMicros - (createdAtMicros % 60_000_000L);
        TimestampType bucketStart = new TimestampType(bucketMicros);
        BigDecimal amt = BigDecimal.valueOf(amount);

        voltQueueSQL(getSeen, merchantId, txnId);
        voltQueueSQL(getBucket, merchantId, bucketStart);
        VoltTable[] pre = voltExecuteSQL();

        boolean duplicate = pre[0].advanceRow();
        boolean isTxn = "TXN".equals(eventType);
        boolean success = isTxn && "SUCCESS".equals(paymentResult);

        long attempts = 0, txnCount = 0, succCount = 0;
        BigDecimal amountSum = BigDecimal.ZERO, succSum = BigDecimal.ZERO;
        BigDecimal amountMin = null, amountMax = null;
        VoltTable b = pre[1];
        if (b.advanceRow()) {
            attempts  = b.getLong("ATTEMPT_COUNT");
            txnCount  = b.getLong("TXN_COUNT");
            amountSum = b.getDecimalAsBigDecimal("AMOUNT_SUM");
            amountMin = b.getDecimalAsBigDecimal("AMOUNT_MIN");
            if (b.wasNull()) amountMin = null;
            amountMax = b.getDecimalAsBigDecimal("AMOUNT_MAX");
            if (b.wasNull()) amountMax = null;
            succCount = b.getLong("SUCCESS_COUNT");
            succSum   = b.getDecimalAsBigDecimal("SUCCESS_AMOUNT_SUM");
        }

        attempts += 1;
        if (!duplicate) {
            voltQueueSQL(insertSeen, merchantId, txnId, createdAt);
            if (isTxn) {
                txnCount += 1;
                amountSum = amountSum.add(amt);
                amountMin = (amountMin == null || amt.compareTo(amountMin) < 0) ? amt : amountMin;
                amountMax = (amountMax == null || amt.compareTo(amountMax) > 0) ? amt : amountMax;
            }
            if (success) { succCount += 1; succSum = succSum.add(amt); }
        }

        voltQueueSQL(upsertBucket, merchantId, bucketStart, attempts, txnCount,
                     amountSum, amountMin, amountMax, succCount, succSum);
        voltExecuteSQL(true);

        return duplicate ? 0L : 1L;
    }
}
