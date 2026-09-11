-- Drops all PoC v4 objects in dependency order (procedures first, tables last).
-- Run with: sqlcmd < src/main/resources/remove_db.sql

DROP PROCEDURE com.novapay.poc.procedures.RecordTxn IF EXISTS;
DROP PROCEDURE com.novapay.poc.procedures.GetRollingFeatures IF EXISTS;
DROP PROCEDURE com.novapay.poc.procedures.RecordMerchantTxn IF EXISTS;
DROP PROCEDURE com.novapay.poc.procedures.GetMerchantFeatures IF EXISTS;
DROP PROCEDURE com.novapay.poc.procedures.BumpCounter IF EXISTS;
DROP PROCEDURE GetRecentTxns IF EXISTS;
DROP PROCEDURE GetProfile IF EXISTS;
DROP PROCEDURE GetDailyBuckets IF EXISTS;
DROP PROCEDURE GetCounters IF EXISTS;

DROP TABLE COUNTERS IF EXISTS;
DROP TABLE MERCHANT_MINUTE IF EXISTS;
DROP TABLE MERCHANT_TXN_SEEN IF EXISTS;
DROP TABLE CUSTOMER_PROFILE IF EXISTS;
DROP TABLE CUSTOMER_DAILY IF EXISTS;
DROP TABLE TXN_RAW IF EXISTS;
