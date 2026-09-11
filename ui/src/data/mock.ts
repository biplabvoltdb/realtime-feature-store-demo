/**
 * MockDataSource — deterministic fixtures shaped exactly like the VoltDB JSON API responses the BFF will
 * normalize in Phase 2. Nothing here is merged with live data; every response is tagged `source: "mock"`.
 */
import { col, T, toRawEnvelope, type ExecResponse, type VoltTable } from "@/lib/volt";
import { classify, parseStatement, type ParsedStatement } from "@/lib/sqlParse";
import { DDL_MODEL } from "@/repo/ddlModel";
import { REPO } from "@/repo";
import type { Sample } from "./telemetry";

// ------------------------------------------------------------------ static fixtures
import type { TableStat } from "./types";
export type { TableStat };
export const TABLE_STATS: TableStat[] = [
  { name: "TXN_RAW", rows: 8_420_118, tupleKb: 7_404.2 * 1024, stringKb: 820.4 * 1024 },
  { name: "CUSTOMER_DAILY", rows: 2_310_442, tupleKb: 860.1 * 1024, stringKb: 80.2 * 1024 },
  { name: "CUSTOMER_PROFILE", rows: 99_842, tupleKb: 28.0 * 1024, stringKb: 12.1 * 1024 },
  { name: "MERCHANT_TXN_SEEN", rows: 4_180_011, tupleKb: 524.3 * 1024, stringKb: 152.8 * 1024 },
  { name: "MERCHANT_MINUTE", rows: 2_532_080, tupleKb: 644.6 * 1024, stringKb: 87.5 * 1024 },
  { name: "COUNTERS", rows: 3, tupleKb: 0.375, stringKb: 0 },
];
export const bytesPerRow = (t: TableStat) => (t.rows > 0 ? ((t.tupleKb + t.stringKb) * 1024) / t.rows : null);
export const tableBytes = (t: TableStat) => (t.tupleKb + t.stringKb) * 1024;

export type ProcParam = { name: string; type: "BIGINT" | "INTEGER" | "STRING" | "FLOAT"; defaultValue: string; hint?: string };
export type ProcManifest = {
  name: string; kind: "java" | "sql"; mutating: boolean; partition: { table: string; column: string; param: number } | null;
  params: ProcParam[]; sourceId: string; description: string; invPerSec: number; avgUs: number; minUs: number; maxUs: number; calls: number;
};
export const PROCEDURES: ProcManifest[] = [
  { name: "GetRollingFeatures", kind: "java", mutating: false, partition: { table: "TXN_RAW", column: "CUSTOMER_ID", param: 0 }, params: [{ name: "customerId", type: "BIGINT", defaultValue: "100000012345" }, { name: "windowMinutes", type: "INTEGER", defaultValue: "1440" }], sourceId: "GetRollingFeatures", description: "Tier-aware rolling-window read. ≤ 10080 min: exact from TXN_RAW (4 result sets). > 10080 min: summed from CUSTOMER_DAILY (2 result sets).", invPerSec: 455, avgUs: 182, minUs: 61, maxUs: 418, calls: 7_590_412 },
  { name: "GetMerchantFeatures", kind: "java", mutating: false, partition: { table: "MERCHANT_MINUTE", column: "MERCHANT_ID", param: 0 }, params: [{ name: "merchantId", type: "STRING", defaultValue: "M-00042" }, { name: "windowMinutes", type: "INTEGER", defaultValue: "60" }], sourceId: "GetMerchantFeatures", description: "Merchant rolling-window read; sums minute buckets newer than the minute-floored cutoff.", invPerSec: 51, avgUs: 104, minUs: 42, maxUs: 266, calls: 764_201 },
  { name: "GetProfile", kind: "sql", mutating: false, partition: { table: "CUSTOMER_PROFILE", column: "CUSTOMER_ID", param: 0 }, params: [{ name: "customerId", type: "BIGINT", defaultValue: "100000012345" }], sourceId: "ddl", description: "Lifetime attributes and the materialized AVG_TICKET for one customer.", invPerSec: 24, avgUs: 38, minUs: 18, maxUs: 91, calls: 360_118 },
  { name: "GetRecentTxns", kind: "sql", mutating: false, partition: { table: "TXN_RAW", column: "CUSTOMER_ID", param: 0 }, params: [{ name: "customerId", type: "BIGINT", defaultValue: "100000012345" }], sourceId: "ddl", description: "Latest 20 raw events for a customer, newest first.", invPerSec: 8, avgUs: 67, minUs: 27, maxUs: 144, calls: 120_045 },
  { name: "GetDailyBuckets", kind: "sql", mutating: false, partition: { table: "CUSTOMER_DAILY", column: "CUSTOMER_ID", param: 0 }, params: [{ name: "customerId", type: "BIGINT", defaultValue: "100000012345" }], sourceId: "ddl", description: "Last 30 daily buckets behind the warm tier.", invPerSec: 4, avgUs: 83, minUs: 40, maxUs: 190, calls: 60_020 },
  { name: "GetCounters", kind: "sql", mutating: false, partition: null, params: [], sourceId: "ddl", description: "Ingest hygiene counters (multi-partition).", invPerSec: 0.3, avgUs: 29, minUs: 12, maxUs: 88, calls: 4_512 },
  { name: "RecordTxn", kind: "java", mutating: true, partition: { table: "TXN_RAW", column: "CUSTOMER_ID", param: 0 }, params: [{ name: "customerId", type: "BIGINT", defaultValue: "100000012345" }, { name: "txnId", type: "STRING", defaultValue: "txn_demo" }, { name: "createdAtMicros", type: "BIGINT", defaultValue: String(Date.now() * 1000) }, { name: "amount", type: "FLOAT", defaultValue: "1250.00" }, { name: "eventType", type: "STRING", defaultValue: "TXN" }, { name: "txnType", type: "STRING", defaultValue: "UPI_P2M" }, { name: "paymentResult", type: "STRING", defaultValue: "SUCCESS" }, { name: "merchantId", type: "STRING", defaultValue: "M-00042" }, { name: "city", type: "STRING", defaultValue: "Mumbai" }], sourceId: "RecordTxn", description: "Customer-tier ingest transaction: dedupe, raw insert, daily bucket upsert, profile + materialized AVG_TICKET.", invPerSec: 2018, avgUs: 146, minUs: 52, maxUs: 480, calls: 30_284_110 },
  { name: "RecordMerchantTxn", kind: "java", mutating: true, partition: { table: "MERCHANT_MINUTE", column: "MERCHANT_ID", param: 0 }, params: [{ name: "merchantId", type: "STRING", defaultValue: "M-00042" }, { name: "txnId", type: "STRING", defaultValue: "txn_demo" }, { name: "createdAtMicros", type: "BIGINT", defaultValue: String(Date.now() * 1000) }, { name: "amount", type: "FLOAT", defaultValue: "1250.00" }, { name: "eventType", type: "STRING", defaultValue: "TXN" }, { name: "paymentResult", type: "STRING", defaultValue: "SUCCESS" }], sourceId: "RecordMerchantTxn", description: "Merchant-tier ingest: per-merchant dedupe and minute-bucket upsert.", invPerSec: 2018, avgUs: 91, minUs: 36, maxUs: 312, calls: 30_284_110 },
  { name: "BumpCounter", kind: "java", mutating: true, partition: { table: "COUNTERS", column: "NAME", param: 0 }, params: [{ name: "name", type: "STRING", defaultValue: "dropped_late" }], sourceId: "BumpCounter", description: "Increments a named ingest counter (dead-letter / late accounting).", invPerSec: 14.1, avgUs: 42, minUs: 15, maxUs: 120, calls: 211_402 },
];
export const procByName = (n: string) => PROCEDURES.find((p) => p.name === n || `com.novapay.poc.procedures.${p.name}` === n);

export const TTL_STATS = [
  { table: "TXN_RAW", rowsDeleted: 84_210, lastRound: 5_000, remaining: 8_420_118, lastDelete: -22_000 },
  { table: "CUSTOMER_DAILY", rowsDeleted: 12_304, lastRound: 2_118, remaining: 2_310_442, lastDelete: -26_000 },
  { table: "MERCHANT_TXN_SEEN", rowsDeleted: 201_806, lastRound: 5_000, remaining: 4_180_011, lastDelete: -21_000 },
  { table: "MERCHANT_MINUTE", rowsDeleted: 31_442, lastRound: 3_802, remaining: 2_532_080, lastDelete: -25_000 },
];
export const HEALTH = { version: "14.0.1", hosts: 3, partitions: 48, sitesPerHost: 16, kSafety: 1, clusterState: "Running", startedAt: Date.now() - 5 * 3600_000 - 42 * 60_000 };
export const HOSTS = ["volt-a", "volt-b", "volt-c"];

// ------------------------------------------------------------------ generators
const CITIES = ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Noida", "Jaipur", "Lucknow"];
const TXN_TYPES = ["UPI_P2M", "UPI_P2P", "CARD_PAY", "WALLET_PAY", "NET_BANKING"];
const RESULTS = ["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "INITIATED", "FAILED"];
const DEMO_CUSTOMER = "100000012345";

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function prng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dec = (n: number) => n.toFixed(12); // VoltDB DECIMAL has 12 fractional digits
const micros = (ms: number) => Math.round(ms) * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type CustomerShape = { ratePerMin: number; avgTicket: number; city: string; firstSeenMs: number; lifetimeCount: number };
function customerShape(id: string): CustomerShape {
  if (id === DEMO_CUSTOMER) return { ratePerMin: 0.9, avgTicket: 4433.87, city: "Mumbai", firstSeenMs: Date.UTC(2026, 6, 14, 9, 12, 5), lifetimeCount: 48_620 };
  const r = prng(hash(id));
  const rate = 0.03 + r() * 1.1;
  const ageDays = 30 + Math.floor(r() * 700);
  return { ratePerMin: rate, avgTicket: 900 + r() * 6000, city: CITIES[Math.floor(r() * CITIES.length)], firstSeenMs: Date.now() - ageDays * 86_400_000, lifetimeCount: Math.round(rate * 60 * 24 * ageDays * 0.85) };
}
function isHotMerchant(id: string) { const m = /^M-(\d{5})$/.exec(id); return !!m && Number(m[1]) < 500; }

const PROFILE_COLS = [col("FIRST_SEEN", T.TIMESTAMP), col("LAST_TXN_AT", T.TIMESTAMP), col("LAST_CITY", T.STRING), col("LIFETIME_TXN_COUNT", T.BIGINT), col("LIFETIME_AMOUNT_SUM", T.DECIMAL), col("TXN_COUNT_24H", T.BIGINT), col("TXN_AMOUNT_SUM_24H", T.DECIMAL), col("AVG_TICKET", T.DECIMAL)];

function profileRow(id: string, now: number) {
  const c = customerShape(id);
  const raw24 = Math.round(c.ratePerMin * 1440 * (id === DEMO_CUSTOMER ? 0.99 : 0.9));
  const txn24 = id === DEMO_CUSTOMER ? 1090 : Math.round(raw24 * 0.85);
  const sum24 = txn24 * c.avgTicket;
  const lastTxnMs = now - Math.round((60_000 / Math.max(c.ratePerMin, 0.05)) * 0.6);
  return { c, raw24, txn24, sum24, lastTxnMs, row: [micros(c.firstSeenMs), micros(lastTxnMs), c.city, c.lifetimeCount, dec(c.lifetimeCount * c.avgTicket * 0.98), txn24, dec(sum24), txn24 > 0 ? (sum24 / txn24).toFixed(4) : null] };
}

// rolling 5-minute captures shrink on repeated calls, so the shrink-proof widget has something to show
const fiveMinCaptures = new Map<string, { n: number; at: number }>();

export function rollingFeatures(id: string, windowMinutes: number, now = Date.now()): VoltTable[] {
  const p = profileRow(id, now);
  const c = p.c;
  const profile: VoltTable = { name: "Profile", columns: PROFILE_COLS, rows: [p.row] };
  if (windowMinutes <= 10080) {
    let raw: number;
    if (id === DEMO_CUSTOMER && windowMinutes === 1440) raw = 1284;
    else if (id === DEMO_CUSTOMER && windowMinutes === 60) raw = 61;
    else if (windowMinutes === 5) {
      const cap = fiveMinCaptures.get(id);
      const fresh = !cap || now - cap.at > 10 * 60_000;
      const base = id === DEMO_CUSTOMER ? 7 : Math.max(2, Math.round(c.ratePerMin * 5) + 2);
      const n = fresh ? 0 : cap.n + 1;
      fiveMinCaptures.set(id, { n, at: now });
      raw = Math.max(1, base - (n === 0 ? 0 : 2 + Math.floor((n - 1) * 1)));
    } else raw = Math.round(c.ratePerMin * windowMinutes * (0.9 + prng(hash(id) + windowMinutes)() * 0.2));
    const txn = id === DEMO_CUSTOMER && windowMinutes === 1440 ? 1090 : Math.round(raw * 0.85);
    const sum = txn * c.avgTicket;
    const succ = Math.round(txn * 0.946), card = Math.round(txn * 0.7), mand = Math.round(raw * 0.12);
    const hot: VoltTable = {
      name: "Aggregate",
      columns: [col("RAW_EVENTS", T.BIGINT), col("TXN_COUNT", T.BIGINT), col("TXN_AMOUNT_SUM", T.DECIMAL), col("AMOUNT_MIN", T.DECIMAL), col("AMOUNT_MAX", T.DECIMAL), col("SUCCESS_COUNT", T.BIGINT), col("SUCCESS_AMOUNT_SUM", T.DECIMAL), col("CARD_COUNT", T.BIGINT), col("CARD_AMOUNT_SUM", T.DECIMAL), col("MANDATE_COUNT", T.BIGINT), col("MANDATE_AMOUNT_SUM", T.DECIMAL)],
      rows: [[raw, txn, dec(sum), txn ? dec(12) : null, txn ? dec(txn > 40 ? 24998.1 : Math.min(24998.1, c.avgTicket * 2.6)) : null, succ, dec(succ * c.avgTicket * 0.99), card, dec(card * c.avgTicket * 1.05), mand, dec(mand * 1180.5)]],
    };
    const distinctA: VoltTable = { name: "Distinct amount", columns: [col("AMOUNT_DISTINCT", T.BIGINT)], rows: [[Math.round(txn * 0.56)]] };
    const distinctM: VoltTable = { name: "Distinct merchants", columns: [col("DISTINCT_MERCHANTS", T.BIGINT)], rows: [[Math.min(txn, Math.round(txn * 0.39) + (txn > 0 ? 1 : 0))]] };
    return [hot, distinctA, distinctM, profile];
  }
  const days = Math.min(90, Math.ceil(windowMinutes / 1440));
  const txn = id === DEMO_CUSTOMER && windowMinutes === 43200 ? 32_741 : Math.round(c.ratePerMin * 0.85 * windowMinutes * 0.86);
  const attempt = Math.round(txn * 1.0207);
  const warm: VoltTable = {
    name: "Aggregate",
    columns: [col("DAYS", T.BIGINT), col("TXN_COUNT", T.BIGINT), col("ATTEMPT_COUNT", T.BIGINT), col("TXN_AMOUNT_SUM", T.DECIMAL), col("AMOUNT_MIN", T.DECIMAL), col("AMOUNT_MAX", T.DECIMAL), col("SUCCESS_COUNT", T.BIGINT), col("SUCCESS_AMOUNT_SUM", T.DECIMAL), col("CARD_COUNT", T.BIGINT), col("CARD_AMOUNT_SUM", T.DECIMAL), col("MANDATE_COUNT", T.BIGINT), col("MANDATE_AMOUNT_SUM", T.DECIMAL)],
    rows: [[days, txn, attempt, dec(txn * c.avgTicket), dec(10.02), dec(24999.5), Math.round(txn * 0.946), dec(txn * 0.946 * c.avgTicket * 0.99), Math.round(txn * 0.7), dec(txn * 0.7 * c.avgTicket * 1.05), Math.round(attempt * 0.14), dec(attempt * 0.14 * 1180.5)]],
  };
  return [warm, profile];
}

export function merchantFeatures(id: string, windowMinutes: number): VoltTable[] {
  const hot = isHotMerchant(id);
  const r = prng(hash(id) + windowMinutes);
  const rate = hot ? 44 + r() * 8 : 3 + r() * 4;
  const buckets = hot ? windowMinutes : Math.round(windowMinutes * 0.6);
  const attempt = Math.round(rate * windowMinutes * 1.02);
  const txn = Math.round(rate * windowMinutes * 0.85);
  const avg = 11_800 + r() * 1400;
  const succ = Math.round(txn * 0.8);
  return [{
    name: "Aggregate",
    columns: [col("BUCKETS", T.BIGINT), col("ATTEMPT_COUNT", T.BIGINT), col("TXN_COUNT", T.BIGINT), col("AMOUNT_SUM", T.DECIMAL), col("AMOUNT_MIN", T.DECIMAL), col("AMOUNT_MAX", T.DECIMAL), col("SUCCESS_COUNT", T.BIGINT), col("SUCCESS_AMOUNT_SUM", T.DECIMAL)],
    rows: [[buckets, attempt, txn, dec(txn * avg), txn ? dec(10.42) : null, txn ? dec(24_998.1) : null, succ, dec(succ * avg * 0.995)]],
  }];
}

export function merchantBuckets(id: string, limit = 60, now = Date.now()): VoltTable {
  const hot = isHotMerchant(id);
  const r = prng(hash(id) + 7);
  const minute = now - (now % 60_000);
  const rows: (string | number | null)[][] = [];
  for (let i = 0; i < limit; i++) {
    const rate = hot ? 40 + r() * 16 : (r() < 0.6 ? 2 + r() * 5 : 0);
    if (rate === 0) continue;
    const txn = Math.round(rate * 0.85);
    rows.push([micros(minute - i * 60_000), Math.round(rate), txn, dec(txn * (11_000 + r() * 3000))]);
  }
  return { name: "Buckets", columns: [col("BUCKET_START", T.TIMESTAMP), col("ATTEMPT_COUNT", T.BIGINT), col("TXN_COUNT", T.BIGINT), col("AMOUNT_SUM", T.DECIMAL)], rows };
}

export function recentTxns(id: string, now = Date.now()): VoltTable {
  const c = customerShape(id);
  const r = prng(hash(id) + 99);
  const rows: (string | number | null)[][] = [];
  let t = now - 19_000;
  for (let i = 0; i < 20; i++) {
    const roll = r() * 100;
    const eventType = roll < 85 ? "TXN" : roll < 97 ? "MANDATE" : "REFUND";
    const txnType = eventType === "MANDATE" ? (r() < 0.75 ? "AUTO_DEBIT" : "SI_REGISTER") : TXN_TYPES[Math.floor(r() * TXN_TYPES.length)];
    const merchant = r() < 0.8 ? `M-${String(Math.floor(r() * 500)).padStart(5, "0")}` : `M-${String(500 + Math.floor(r() * 4500)).padStart(5, "0")}`;
    const attempts = i === 0 && id === DEMO_CUSTOMER ? 2 : r() < 0.06 ? 2 : 1;
    const amount = Math.round((10 + r() * 24_990) * 100) / 100;
    rows.push([`txn_${1_756_800_000_000_000 + Math.floor(r() * 9e11)}`, micros(t), eventType, txnType, dec(amount), attempts > 1 ? "SUCCESS" : RESULTS[Math.floor(r() * RESULTS.length)], merchant, i % 3 === 0 ? c.city : CITIES[Math.floor(r() * CITIES.length)], attempts]);
    t -= (60_000 / Math.max(c.ratePerMin, 0.05)) * (0.4 + r() * 1.2);
  }
  return { name: "Recent", columns: [col("TXN_ID", T.STRING), col("CREATED_AT", T.TIMESTAMP), col("EVENT_TYPE", T.STRING), col("TXN_TYPE", T.STRING), col("AMOUNT", T.DECIMAL), col("PAYMENT_RESULT", T.STRING), col("MERCHANT_ID", T.STRING), col("CITY", T.STRING), col("ATTEMPT_COUNT", T.INTEGER)], rows };
}

export function dailyBuckets(id: string, now = Date.now()): VoltTable {
  const c = customerShape(id);
  const r = prng(hash(id) + 31);
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const rows: (string | number | null)[][] = [];
  for (let i = 0; i < 30; i++) {
    const dayFactor = i === 0 ? (now - today) / 86_400_000 : 0.75 + r() * 0.5;
    const txn = Math.round(c.ratePerMin * 1440 * 0.85 * dayFactor);
    const attempt = Math.round(txn * 1.02);
    rows.push([micros(today - i * 86_400_000), txn, attempt, dec(txn * c.avgTicket), txn ? dec(10 + r() * 40) : null, txn ? dec(20_000 + r() * 4998) : null, Math.round(txn * 0.946), Math.round(txn * 0.7), dec(txn * 0.7 * c.avgTicket * 1.05), Math.round(attempt * 0.14), dec(attempt * 0.14 * 1180.5)]);
  }
  return { name: "Daily buckets", columns: [col("DAY_START", T.TIMESTAMP), col("TXN_COUNT", T.BIGINT), col("ATTEMPT_COUNT", T.BIGINT), col("TXN_AMOUNT_SUM", T.DECIMAL), col("AMOUNT_MIN", T.DECIMAL), col("AMOUNT_MAX", T.DECIMAL), col("SUCCESS_COUNT", T.BIGINT), col("CARD_COUNT", T.BIGINT), col("CARD_AMOUNT_SUM", T.DECIMAL), col("MANDATE_COUNT", T.BIGINT), col("MANDATE_AMOUNT_SUM", T.DECIMAL)], rows };
}

export const BUSIEST = [
  [DEMO_CUSTOMER, 1284, "4832914.200000000000"], ["100000017842", 1119, "4214081.940000000000"], ["100000097116", 1073, "3981442.120000000000"], ["100000042590", 998, "3658004.700000000000"],
  ["100000083214", 961, "3502318.260000000000"], ["100000061203", 917, "3311670.890000000000"], ["100000029871", 884, "3204981.540000000000"], ["100000074420", 846, "3092217.300000000000"], ["100000055018", 811, "2966140.180000000000"], ["100000090312", 790, "2891004.010000000000"],
];
export function busiestCustomers(): VoltTable {
  return { name: "Busiest", columns: [col("CUSTOMER_ID", T.BIGINT), col("TXNS", T.BIGINT), col("SPEND", T.DECIMAL)], rows: BUSIEST.map((r) => [...r]) };
}
export function dedupeRows(): VoltTable {
  const r = prng(4242);
  const rows: (string | number | null)[][] = [[DEMO_CUSTOMER, "txn_1756800012345678", dec(6840), 3, "SUCCESS"]];
  const ids = ["100000018927", "100000007451", "100000064118", "100000039005", "100000081266", "100000022790", "100000050433", "100000093621", "100000011870"];
  ids.forEach((id) => rows.push([id, `txn_${1_756_800_000_000_000 + Math.floor(r() * 9e11)}`, dec(Math.round((10 + r() * 24_990) * 100) / 100), 2, r() < 0.85 ? "SUCCESS" : "FAILED"]));
  return { name: "Dedupe", columns: [col("CUSTOMER_ID", T.BIGINT), col("TXN_ID", T.STRING), col("AMOUNT", T.DECIMAL), col("ATTEMPT_COUNT", T.INTEGER), col("PAYMENT_RESULT", T.STRING)], rows };
}
export function countersTable(latest: Sample | undefined): VoltTable {
  const c = latest?.counters ?? { dlq_unparseable_created_at: 394, dlq_missing_subject_key: 391, dropped_late: 588, dlq_unparseable_json: 0 };
  const rows = Object.entries(c).filter(([, v]) => v > 0).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, v]);
  return { name: "Counters", columns: [col("NAME", T.STRING), col("VAL", T.BIGINT)], rows };
}

// ------------------------------------------------------------------ system procedures
function statsTable(now: number): VoltTable {
  const columns = ["TIMESTAMP", "HOST_ID", "HOSTNAME", "SITE_ID", "PARTITION_ID", "TABLE_NAME", "TABLE_TYPE", "TUPLE_COUNT", "TUPLE_ALLOCATED_MEMORY", "TUPLE_DATA_MEMORY", "STRING_DATA_MEMORY", "TUPLE_LIMIT", "PERCENT_FULL", "DR"].map((n, i) => col(n, [6, 5, 9, 5, 5, 9, 9, 6, 6, 6, 6, 5, 5, 9][i]));
  const rows: (string | number | null)[][] = [];
  const parts = HEALTH.partitions;
  for (const t of TABLE_STATS) {
    let rowsLeft = t.rows, tupLeft = t.tupleKb, strLeft = t.stringKb;
    for (let p = 0; p < parts; p++) {
      const remaining = parts - p;
      const rr = p === parts - 1 ? rowsLeft : Math.round(rowsLeft / remaining * (0.94 + ((p * 37) % 13) / 100));
      const tk = p === parts - 1 ? tupLeft : Math.round((tupLeft / remaining) * 1000) / 1000;
      const sk = p === parts - 1 ? strLeft : Math.round((strLeft / remaining) * 1000) / 1000;
      rowsLeft -= rr; tupLeft -= tk; strLeft -= sk;
      rows.push([now, Math.floor(p / 16), HOSTS[Math.floor(p / 16)], p % 16, p, t.name, "PersistentTable", rr, Math.round(tk * 1.08), tk, sk, null, null, "false"]);
    }
  }
  return { name: "TABLE", columns, rows };
}
function statsProcedure(now: number): VoltTable {
  const columns = ["TIMESTAMP", "HOST_ID", "HOSTNAME", "SITE_ID", "PARTITION_ID", "PROCEDURE", "INVOCATIONS", "TIMED_INVOCATIONS", "MIN_EXECUTION_TIME", "MAX_EXECUTION_TIME", "AVG_EXECUTION_TIME", "ABORTS", "FAILURES", "TRANSACTIONAL"].map((n, i) => col(n, [6, 5, 9, 5, 5, 9, 6, 6, 6, 6, 6, 6, 6, 3][i]));
  const rows: (string | number | null)[][] = [];
  PROCEDURES.forEach((p) => HOSTS.forEach((h, hi) => rows.push([now, hi, h, 0, hi * 16, p.kind === "java" ? `com.novapay.poc.procedures.${p.name}` : p.name, Math.round(p.calls / 3), Math.round(p.calls / 3 / 100), p.minUs * 1000, p.maxUs * 1000, Math.round(p.avgUs * 1000 * (0.96 + hi * 0.03)), 0, 0, 1])));
  return { name: "PROCEDURE", columns, rows };
}
function statsLatency(now: number, latest: Sample | undefined): VoltTable {
  const columns = ["TIMESTAMP", "HOST_ID", "HOSTNAME", "INTERVAL", "COUNT", "TPS", "P50", "P95", "P99", "P99.9", "P99.99", "P99.999", "MAX"].map((n, i) => col(n, [6, 5, 9, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6][i]));
  const s = latest;
  const tps = s ? Math.round((s.ingest * 2 + s.reads) / 3) : 1500;
  const us = (ms: number) => Math.round(ms * 1000);
  return { name: "LATENCY", columns, rows: HOSTS.map((h, i) => [now, i, h, 5000, tps * 5, tps, us((s?.p50 ?? 0.7) * (1 + i * 0.02)), us((s?.p95 ?? 1.6) * (1 + i * 0.02)), us((s?.p99 ?? 2.4) * (1 + i * 0.03)), us((s?.p999 ?? 4.8) * (1 + i * 0.03)), us(9.2 + i * 0.4), us(18.5), us(31.1)]) };
}
function statsTtl(now: number): VoltTable {
  // real VoltDB 14.2 schema (no host/site/partition columns)
  const columns = ["TIMESTAMP", "TABLE_NAME", "ROWS_DELETED", "ROWS_DELETED_LAST_ROUND", "ROWS_REMAINING", "LAST_DELETE_TIMESTAMP"].map((n, i) => col(n, [6, 9, 6, 6, 6, 11][i]));
  return { name: "TTL", columns, rows: TTL_STATS.map((t) => [now, t.table, t.rowsDeleted, t.lastRound, t.remaining, micros(now + t.lastDelete)]) };
}
function statsMemory(now: number): VoltTable {
  const columns = ["TIMESTAMP", "HOST_ID", "HOSTNAME", "RSS", "JAVAUSED", "JAVAUNUSED", "TUPLEDATA", "TUPLEALLOCATED", "INDEXMEMORY", "STRINGMEMORY", "TUPLECOUNT", "POOLEDMEMORY", "PHYSICALMEMORY", "JAVAMAXHEAP"].map((n, i) => col(n, [6, 5, 9, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6][i]));
  const tuple = Math.round(TABLE_STATS.reduce((a, t) => a + t.tupleKb, 0) / 3), str = Math.round(TABLE_STATS.reduce((a, t) => a + t.stringKb, 0) / 3), cnt = Math.round(TABLE_STATS.reduce((a, t) => a + t.rows, 0) / 3);
  return { name: "MEMORY", columns, rows: HOSTS.map((h, i) => [now, i, h, tuple + str + 2_400_000 + i * 20_000, 1_310_720, 1_835_008, tuple, Math.round(tuple * 1.08), Math.round(tuple * 0.31), str, cnt, Math.round(tuple * 1.2), 67_108_864, 4_194_304]) };
}
function systemInformation(now: number): VoltTable {
  const rows: (string | number | null)[][] = [];
  HOSTS.forEach((h, i) => {
    const kv: [string, string][] = [["VERSION", HEALTH.version], ["HOSTNAME", h], ["IPADDRESS", `10.20.0.${11 + i}`], ["CLIENTPORT", "21212"], ["ADMINPORT", "21211"], ["HTTPPORT", "8080"], ["INTERNALPORT", "3021"], ["KSAFETY", String(HEALTH.kSafety)], ["PARTITIONS", String(HEALTH.partitions)], ["SITESPERHOST", String(HEALTH.sitesPerHost)], ["CLUSTERSTATE", HEALTH.clusterState], ["STARTTIME", String(HEALTH.startedAt)], ["UPTIME", uptime(now - HEALTH.startedAt)], ["BUILDSTRING", "voltdb-14.0.1"], ["LICENSE", "Enterprise · expires 2027-02-15"]];
    kv.forEach(([k, v]) => rows.push([i, k, v]));
  });
  return { name: "OVERVIEW", columns: [col("HOST_ID", T.INTEGER), col("KEY", T.STRING), col("VALUE", T.STRING)], rows };
}
export function uptime(ms: number) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 86400)} days ${String(Math.floor((s % 86400) / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
function systemCatalog(selector: string): VoltTable {
  const sel = selector.toUpperCase();
  if (sel === "TABLES") return { name: "TABLES", columns: [col("TABLE_CAT", T.STRING), col("TABLE_SCHEM", T.STRING), col("TABLE_NAME", T.STRING), col("TABLE_TYPE", T.STRING), col("REMARKS", T.STRING)], rows: DDL_MODEL.tables.map((t) => [null, null, t.name, "TABLE", t.partitionColumn ? `{"partitionColumn":"${t.partitionColumn}"}` : null]) };
  if (sel === "COLUMNS") return { name: "COLUMNS", columns: [col("TABLE_NAME", T.STRING), col("COLUMN_NAME", T.STRING), col("TYPE_NAME", T.STRING), col("NULLABLE", T.INTEGER), col("COLUMN_DEF", T.STRING), col("ORDINAL_POSITION", T.INTEGER), col("REMARKS", T.STRING)], rows: DDL_MODEL.tables.flatMap((t) => t.columns.map((c, i) => [t.name, c.name, c.type.replace(/\(.*\)/, ""), c.nullable ? 1 : 0, c.defaultValue, i + 1, c.name === t.partitionColumn ? "PARTITION_COLUMN" : null])) };
  if (sel === "PROCEDURES") return { name: "PROCEDURES", columns: [col("PROCEDURE_NAME", T.STRING), col("REMARKS", T.STRING)], rows: DDL_MODEL.procedures.map((p) => [p.name, JSON.stringify({ partitionTable: p.partitionTable, partitionColumn: p.partitionColumn, singlePartition: !!p.partitionTable, readOnly: !/^(Record|Bump)/.test(p.name) })]) };
  if (sel === "INDEXINFO") return { name: "INDEXINFO", columns: [col("TABLE_NAME", T.STRING), col("INDEX_NAME", T.STRING), col("COLUMN_NAME", T.STRING), col("ORDINAL_POSITION", T.INTEGER), col("NON_UNIQUE", T.INTEGER)], rows: DDL_MODEL.tables.flatMap((t) => [...t.primaryKey.map((c, i) => [t.name, `VOLTDB_AUTOGEN_IDX_PK_${t.name}_${t.primaryKey.join("_")}`, c, i + 1, 0]), ...t.indexes.flatMap((ix) => ix.columns.map((c, i) => [t.name, ix.name, c, i + 1, 1]))]) };
  if (sel === "PRIMARYKEYS") return { name: "PRIMARYKEYS", columns: [col("TABLE_NAME", T.STRING), col("COLUMN_NAME", T.STRING), col("KEY_SEQ", T.INTEGER), col("PK_NAME", T.STRING)], rows: DDL_MODEL.tables.flatMap((t) => t.primaryKey.map((c, i) => [t.name, c, i + 1, `VOLTDB_AUTOGEN_IDX_PK_${t.name}_${t.primaryKey.join("_")}`])) };
  throw new Error(`Unsupported @SystemCatalog selector ${selector}`);
}

/** Extract `new SQLStmt("...")` declarations from a Java procedure source. */
export function javaStatements(name: string): { field: string; sql: string }[] {
  const src = REPO[name]?.source ?? "";
  const out: { field: string; sql: string }[] = [];
  const re = /SQLStmt\s+(\w+)\s*=\s*new SQLStmt\(([\s\S]*?)\);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const sql = Array.from(m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)).map((x) => x[1]).join("").replace(/\s+/g, " ").trim();
    out.push({ field: m[1], sql });
  }
  return out;
}
export function planFor(sql: string, partitionTable?: string | null): string {
  const s = sql.replace(/\s+/g, " ");
  const from = /from (\w+)/i.exec(s)?.[1] ?? partitionTable ?? "?";
  const table = DDL_MODEL.tables.find((t) => t.name === from);
  const where = /where (.*?)(?: order by| group by| limit|$)/i.exec(s)?.[1] ?? "";
  const cols = where.match(/\b([A-Z_]+)\s*(?:=|>|<)/g)?.map((x) => x.replace(/\s*(=|>|<)/, "")) ?? [];
  const idx = table?.indexes.find((ix) => ix.columns.every((c) => cols.includes(c)) || cols.every((c) => ix.columns.includes(c)) && cols.length) ?? null;
  const pk = table && table.primaryKey.every((c) => cols.includes(c));
  const lines = ["RETURN RESULTS TO STORED PROCEDURE"];
  if (/^\s*(insert|upsert)/i.test(s)) return `${lines[0]}\n LIMIT 1\n  RECEIVE FROM ALL PARTITIONS\n   SEND PARTITION RESULTS TO COORDINATOR\n    ${/upsert/i.test(s) ? "UPSERT" : "INSERT"} into "${from}"\n     MATERIALIZE TUPLE from parameters and/or literals`;
  if (/^\s*update/i.test(s)) return `${lines[0]}\n UPDATE\n  ${idx ? `INDEX SCAN of "${from}" using "${pk ? `VOLTDB_AUTOGEN_IDX_PK_${from}` : idx.name}"` : `SEQUENTIAL SCAN of "${from}"`}\n   uniquely match (${cols.map((c) => `${c} = ?`).join(") AND (")})`;
  if (/order by/i.test(s)) lines.push(" ORDER BY (SORT)" + (/limit (\d+)/i.exec(s) ? ` with LIMIT ${/limit (\d+)/i.exec(s)![1]}` : ""));
  if (/\b(sum|count|min|max)\s*\(/i.test(s)) {
    const ops = Array.from(s.matchAll(/\b(SUM|COUNT|MIN|MAX)\s*\(([^)]*)\)/gi)).slice(0, 6).map((m) => `${m[1].toUpperCase()}(${m[2].trim().slice(0, 28)})`);
    lines.push(`${/group by/i.test(s) ? " HASH AGGREGATION" : " AGGREGATION"} ops: ${ops.join(", ")}${ops.length < (s.match(/\b(SUM|COUNT|MIN|MAX)\s*\(/gi)?.length ?? 0) ? ", …" : ""}`);
  }
  if (!table?.partitionColumn || !cols.includes(table.partitionColumn)) lines.push("  RECEIVE FROM ALL PARTITIONS", "   SEND PARTITION RESULTS TO COORDINATOR");
  const indent = " ".repeat(lines.length);
  if (pk && !idx) lines.push(`${indent}INDEX SCAN of "${from}" using its primary key index`, `${indent} uniquely match (${cols.map((c) => `${c} = ?`).join(") AND (")})`);
  else if (idx) lines.push(`${indent}INDEX SCAN of "${from}" using "${idx.name}"`, `${indent} range-scan on ${idx.columns.length} of ${idx.columns.length} cols from (${cols.map((c) => `${c} ${/(\w+)\s*>/.test(where) && c === cols[cols.length - 1] ? ">" : "="} ?`).join(") AND (")}) to end`);
  else lines.push(`${indent}SEQUENTIAL SCAN of "${from}"${where ? `\n${indent} filter by (${where.trim()})` : ""}`);
  return lines.join("\n");
}
function explainProc(name: string): VoltTable {
  const p = procByName(name);
  if (!p) throw new Error(`Procedure ${name} was not found`);
  const rows: (string | number | null)[][] = p.kind === "java"
    ? javaStatements(p.name).map((st) => [st.field, st.sql, planFor(st.sql, p.partition?.table)])
    : [["sql0", DDL_MODEL.procedures.find((d) => d.name === p.name)?.sql?.replace(/\s+/g, " ") ?? "", planFor(DDL_MODEL.procedures.find((d) => d.name === p.name)?.sql ?? "", p.partition?.table)]];
  return { name: "Plan", columns: [col("STATEMENT_NAME", T.STRING), col("SQL_STATEMENT", T.STRING), col("EXECUTION_PLAN", T.STRING)], rows };
}

// ------------------------------------------------------------------ ad-hoc SQL
function adHoc(sql: string, latest: Sample | undefined): { tables: VoltTable[]; warnings: string[] } {
  const s = sql.replace(/\s+/g, " ").trim().toLowerCase();
  const warnings: string[] = [];
  if (/from customer_daily/.test(s) && /group by customer_id/.test(s)) return { tables: [busiestCustomers()], warnings };
  if (/attempt_count\s*>\s*1/.test(s)) return { tables: [dedupeRows()], warnings };
  if (/from merchant_minute/.test(s)) { const id = /merchant_id\s*=\s*'([^']+)'/.exec(s)?.[1]?.toUpperCase() ?? "M-00042"; const lim = Number(/limit (\d+)/.exec(s)?.[1] ?? 60); return { tables: [merchantBuckets(id, lim)], warnings }; }
  if (/from counters/.test(s)) return { tables: [countersTable(latest)], warnings };
  if (/from customer_profile/.test(s)) { const id = /customer_id\s*=\s*(\d+)/.exec(s)?.[1] ?? DEMO_CUSTOMER; const p = profileRow(id, Date.now()); return { tables: [{ name: "Profile", columns: [col("CUSTOMER_ID", T.BIGINT), ...PROFILE_COLS], rows: [[id, ...p.row]] }], warnings }; }
  if (/from txn_raw/.test(s)) { const id = /customer_id\s*=\s*(\d+)/.exec(s)?.[1]; if (id) return { tables: [recentTxns(id)], warnings }; warnings.push("Mock mode: TXN_RAW scans without a CUSTOMER_ID filter are approximated with a 20-row sample."); return { tables: [recentTxns(DEMO_CUSTOMER)], warnings }; }
  if (/from customer_daily/.test(s)) { const id = /customer_id\s*=\s*(\d+)/.exec(s)?.[1] ?? DEMO_CUSTOMER; return { tables: [dailyBuckets(id)], warnings }; }
  if (/^select\s+1\b/.test(s)) return { tables: [{ name: "Result", columns: [col("C1", T.INTEGER)], rows: [[1]] }], warnings };
  warnings.push("Mock mode: this statement is not modelled by the fixture set. A live @AdHoc call would return real rows; the empty result below keeps the projected column names only.");
  const proj = /^select (.*?) from/.exec(s)?.[1] ?? "";
  const names = proj.split(",").map((x) => ((/ as (\w+)/.exec(x)?.[1] ?? x.trim().replace(/[^a-z0-9_*]/g, "")) || "C1").toUpperCase()).slice(0, 12);
  return { tables: [{ name: "Result", columns: names.map((n) => col(n === "*" ? "COLUMN" : n, T.STRING)), rows: [] }], warnings };
}

// ------------------------------------------------------------------ dispatcher
export type ExecOptions = { readOnly: boolean; voltApiUrl?: string; latest?: Sample };
let requestCounter = 0;

function envelope(procedure: string, params: unknown[], results: VoltTable[], opts: ExecOptions, warnings: string[] = []): ExecResponse {
  const bff = 3.4 + Math.random() * 3.1;
  return {
    ok: true, source: "mock", results, timing: { bffRoundTripMs: Math.round(bff * 10) / 10, upstreamMs: Math.round((bff - 0.7) * 10) / 10 }, capturedAt: new Date().toISOString(),
    request: { method: "POST", url: `${opts.voltApiUrl ?? "http://localhost:8080"}/api/1.0/`, body: { Procedure: procedure, Parameters: JSON.stringify(params) }, requestId: `mock-${++requestCounter}` },
    response: toRawEnvelope(results), warnings: warnings.length ? warnings : undefined,
  };
}
function failure(procedure: string, params: unknown[], statusstring: string, opts: ExecOptions, status = -2): ExecResponse {
  return { ok: false, source: "mock", results: [], timing: { bffRoundTripMs: 2.1 }, capturedAt: new Date().toISOString(), request: { method: "POST", url: `${opts.voltApiUrl ?? "http://localhost:8080"}/api/1.0/`, body: { Procedure: procedure, Parameters: JSON.stringify(params) } }, response: { status, appstatus: -128, statusstring, appstatusstring: null, results: [] }, statusstring };
}

export async function callProcedure(procedure: string, params: unknown[], opts: ExecOptions): Promise<ExecResponse> {
  await sleep(70 + Math.random() * 110);
  const now = Date.now();
  const name = procedure.replace(/^com\.novapay\.poc\.procedures\./, "");
  const cls = name.toUpperCase() === "@ADHOC" ? classify(parseStatement(String(params[0] ?? ""))) : classify({ kind: "exec", procedure: name, params: params as (string | number)[], text: "" });
  if (opts.readOnly && !cls.allowedWhenLocked) return failure(procedure, params, `Blocked by read-only guard: ${cls.reason}. Unlock writes in Settings to run mutating procedures.`, opts, -9);
  try {
    if (name.startsWith("@")) {
      const sel = String(params[0] ?? "").toUpperCase();
      switch (name.toUpperCase()) {
        case "@STATISTICS": {
          const t = sel === "TABLE" ? statsTable(now) : sel === "PROCEDURE" ? statsProcedure(now) : sel === "LATENCY" ? statsLatency(now, opts.latest) : sel === "TTL" ? statsTtl(now) : sel === "MEMORY" ? statsMemory(now) : null;
          if (!t) return failure(procedure, params, `Mock mode supports @Statistics TABLE, PROCEDURE, LATENCY, TTL and MEMORY. Selector ${sel || "(none)"} is not modelled.`, opts);
          return envelope(procedure, params, [t], opts);
        }
        case "@SYSTEMINFORMATION": return envelope(procedure, params, [systemInformation(now)], opts);
        case "@SYSTEMCATALOG": return envelope(procedure, params, [systemCatalog(sel)], opts);
        case "@EXPLAINPROC": return envelope(procedure, params, [explainProc(String(params[0]))], opts);
        case "@EXPLAIN": return envelope(procedure, params, [{ name: "Plan", columns: [col("EXECUTION_PLAN", T.STRING)], rows: [[planFor(String(params[0]))]] }], opts);
        case "@ADHOC": { const r = adHoc(String(params[0]), opts.latest); return envelope(procedure, params, r.tables, opts, r.warnings); }
        case "@PING": return envelope(procedure, params, [{ name: "Ping", columns: [col("STATUS", T.BIGINT)], rows: [[0]] }], opts);
        default: return failure(procedure, params, `Procedure ${procedure} was not found`, opts);
      }
    }
    const manifest = procByName(name);
    if (!manifest) return failure(procedure, params, `Procedure ${procedure} was not found`, opts);
    if (params.length !== manifest.params.length) return failure(procedure, params, `Incorrect number of parameters for ${name}: expected ${manifest.params.length}, received ${params.length}`, opts, -3);
    switch (manifest.name) {
      case "GetRollingFeatures": return envelope(procedure, params, rollingFeatures(String(params[0]), Number(params[1]), now), opts);
      case "GetMerchantFeatures": return envelope(procedure, params, merchantFeatures(String(params[0]), Number(params[1])), opts);
      case "GetProfile": { const id = String(params[0]); const p = profileRow(id, now); return envelope(procedure, params, [{ name: "Profile", columns: [col("CUSTOMER_ID", T.BIGINT), ...PROFILE_COLS], rows: [[id, ...p.row]] }], opts); }
      case "GetRecentTxns": return envelope(procedure, params, [recentTxns(String(params[0]), now)], opts);
      case "GetDailyBuckets": return envelope(procedure, params, [dailyBuckets(String(params[0]), now)], opts);
      case "GetCounters": return envelope(procedure, params, [countersTable(opts.latest)], opts);
      case "RecordTxn": case "RecordMerchantTxn": return envelope(procedure, params, [{ name: "Result", columns: [col("modified_tuples", T.BIGINT)], rows: [[1]] }], opts, ["Mock mode: no cluster state was mutated."]);
      case "BumpCounter": return envelope(procedure, params, [{ name: "Result", columns: [col("modified_tuples", T.BIGINT)], rows: [[(opts.latest?.counters.dropped_late ?? 588) + 1]] }], opts, ["Mock mode: no cluster state was mutated."]);
    }
    return failure(procedure, params, `Procedure ${procedure} was not found`, opts);
  } catch (e) {
    return failure(procedure, params, e instanceof Error ? e.message : String(e), opts);
  }
}

export async function runStatement(st: ParsedStatement, opts: ExecOptions): Promise<ExecResponse> {
  if (st.kind === "exec") return callProcedure(st.procedure, st.params, opts);
  const cls = classify(st);
  if (opts.readOnly && !cls.allowedWhenLocked) { await sleep(40); return failure("@AdHoc", [st.sql], `Blocked by read-only guard: ${cls.reason}. Unlock writes in Settings to run DML/DDL.`, opts, -9); }
  return callProcedure("@AdHoc", [st.sql], opts);
}
