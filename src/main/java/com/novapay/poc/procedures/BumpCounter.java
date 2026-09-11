package com.novapay.poc.procedures;

import org.voltdb.SQLStmt;
import org.voltdb.VoltProcedure;
import org.voltdb.VoltTable;

/**
 * Increment a named ingest counter (PoV §2.2: dead-lettered and late events
 * are counted, never dropped silently). Single-partition on NAME.
 */
public class BumpCounter extends VoltProcedure {

    public final SQLStmt get = new SQLStmt(
        "SELECT VAL FROM COUNTERS WHERE NAME = ?;");

    public final SQLStmt upsert = new SQLStmt(
        "UPSERT INTO COUNTERS (NAME, VAL) VALUES (?, ?);");

    public long run(String name) {
        voltQueueSQL(get, name);
        VoltTable t = voltExecuteSQL()[0];
        long val = t.advanceRow() ? t.getLong("VAL") : 0L;
        voltQueueSQL(upsert, name, val + 1);
        voltExecuteSQL(true);
        return val + 1;
    }
}
