import type { Sample } from "@/data/telemetry";
import type { TableStat } from "@/data/types";
import { fmtCompact, fmtInt, fmtRate } from "@/lib/format";
import { REPO, findLine } from "@/repo";
import type { Tier } from "@/lib/tier";

export type ArchCtx = { latest?: Sample; hasRates: boolean; view: "live" | "contract" | "partition"; tableStats: TableStat[] };
type Ctx = ArchCtx;
export type ArchNode = {
  id: string; title: string; row: "spine" | "dlq" | "customer" | "merchant" | "reads"; tier?: Tier; table?: string; procedure?: string;
  meta: (ctx: Ctx) => string; runtime: (ctx: Ctx) => [string, string][]; contract: [string, string][]; source?: { id: string; needle: string; before?: number; after?: number }; caveat?: string;
};
const rows = (c: Ctx, t: string) => c.tableStats.find((s) => s.name === t)?.rows ?? 0;
const rate = (ctx: Ctx, n?: number) => (ctx.hasRates && n != null ? fmtRate(n, " events/s") : "—");

export const ARCH_NODES: ArchNode[] = [
  { id: "loadgen", title: "TxnLoadGenerator", row: "spine", tier: "kafka", meta: (c) => c.view === "partition" ? "keyed by customer_id" : `${c.hasRates && c.latest ? fmtInt(c.latest.ingest + c.latest.rejected) : "—"} events/s · 48 fields`, runtime: (c) => [["Produced", rate(c, c.latest ? c.latest.ingest + c.latest.rejected : undefined)], ["Event mix", "TXN 85% · MANDATE 12% · REFUND 3%"], ["Edge cases", "badTs 0.2% · noKey 0.2% · late 0.3% · retries ~2%"]], contract: [["Default eps", "2000"], ["Customers", "10,000,000 (12-digit longs)"], ["Merchants", "5,000 · hot 500 receive 80%"], ["Payload", "~1.5 KB · 48 flat fields (documented assumption)"]], source: { id: "loadgen", needle: "static String buildEvent", after: 14 } },
  { id: "kafka", title: "Kafka · novapay-txn-events", row: "spine", tier: "kafka", meta: (c) => c.view === "partition" ? "50 partitions · key = customer_id" : "50 partitions · starting at LATEST", runtime: (c) => [["Inbound", rate(c, c.latest ? c.latest.ingest + c.latest.rejected : undefined)], ["Consumer group", "novapay-feature-agg"], ["Lag", "see Benchmarks → Kafka lag"]], contract: [["Topic", "novapay-txn-events"], ["Partitions", "50 · scripts/01_create_topic.sh"], ["Replication", "1"], ["Producer key", "customer_id"]], source: { id: "s01", needle: "--topic novapay-txn-events", before: 1, after: 1 }, caveat: "Partition counts come from the topic script, not from pipeline-config.yaml." },
  { id: "voltsp", title: "VoltSP · feature ingest v4", row: "spine", tier: "voltsp", meta: () => "parse → validate → lateness check", runtime: (c) => [["Status", c.hasRates ? "FLOWING" : "—"], ["Accepted", rate(c, c.latest?.ingest)], ["Rejected", rate(c, c.latest?.rejected)], ["Last sample", c.latest ? new Date(c.latest.t).toLocaleTimeString() : "—"]], contract: [["groupId", "novapay-feature-agg"], ["startingOffset", "LATEST"], ["latenessSeconds", "86400"], ["sourceTopic", "novapay-txn-events"], ["dlqTopic", "novapay-txn-dlq"]], source: { id: "pipeline", needle: "if (ageSeconds > latenessSeconds)", before: 1, after: 3 } },
  { id: "dlq", title: "novapay-txn-dlq", row: "dlq", tier: "hygiene", meta: () => "4 partitions · raw payload", runtime: (c) => [["Rejected", rate(c, c.latest?.rejected)], ["Reason envelope", "none · payload only"]], contract: [["Topic", "novapay-txn-dlq"], ["Partitions", "4"], ["Emitted by", "stream.onError() named sink"]], source: { id: "pipeline", needle: "private static void deadLetter", after: 7 }, caveat: "DLQ payloads carry no reason field; COUNTERS is authoritative for classification." },
  { id: "bump", title: "BumpCounter", row: "dlq", tier: "hygiene", procedure: "BumpCounter", meta: () => "COUNTERS.NAME", runtime: (c) => [["Invocations", rate(c, c.latest?.rejected)], ["Counters", c.latest ? Object.entries(c.latest.counters).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${fmtInt(v)}`).join(" · ") : "—"]], contract: [["Partition", "COUNTERS.NAME"], ["Names", "dlq_unparseable_json · dlq_unparseable_created_at · dlq_missing_subject_key · dropped_late"]], source: { id: "BumpCounter", needle: "public long run", after: 7 } },
  { id: "recordTxn", title: "RecordTxn", row: "customer", tier: "hot", procedure: "RecordTxn", meta: (c) => c.view === "partition" ? "single-partition · param 0" : `${c.hasRates && c.latest ? fmtInt(c.latest.ingest) : "—"}/s · customer key`, runtime: (c) => [["Invocations", rate(c, c.latest?.ingest)], ["Semantics", "dedupe → raw → daily → profile, one ACID txn"]], contract: [["Partition", "TXN_RAW.CUSTOMER_ID · parameter 0"], ["Writes", "TXN_RAW · CUSTOMER_DAILY · CUSTOMER_PROFILE"], ["Semantics", "dedupe → raw → daily bucket → profile + AVG_TICKET, one ACID txn"]], source: { id: "RecordTxn", needle: "public long run(long customerId", after: 8 } },
  { id: "TXN_RAW", title: "TXN_RAW", row: "customer", tier: "hot", table: "TXN_RAW", meta: (c) => c.view === "partition" ? "partition CUSTOMER_ID" : `HOT · 7 d · ${fmtCompact(rows(c, "TXN_RAW"))}`, runtime: (c) => [["Rows", fmtInt(rows(c, "TXN_RAW"))]], contract: [["TTL", "7 DAYS on CREATED_AT · BATCH_SIZE 5000"], ["PK", "(CUSTOMER_ID, TXN_ID)"], ["Indexes", "IDX_TXN_RAW_CUST_TIME · IDX_TXN_RAW_TTL"]], source: { id: "ddl", needle: "CREATE TABLE TXN_RAW", after: 17 } },
  { id: "CUSTOMER_DAILY", title: "CUSTOMER_DAILY", row: "customer", tier: "warm", table: "CUSTOMER_DAILY", meta: (c) => c.view === "partition" ? "partition CUSTOMER_ID" : `WARM · 90 d · ${fmtCompact(rows(c, "CUSTOMER_DAILY"))}`, runtime: (c) => [["Rows", fmtInt(rows(c, "CUSTOMER_DAILY"))]], contract: [["TTL", "90 DAYS on DAY_START · BATCH_SIZE 5000"], ["PK", "(CUSTOMER_ID, DAY_START)"], ["Width", "51 physical columns incl. F01…F38 fillers"]], source: { id: "ddl", needle: "CREATE TABLE CUSTOMER_DAILY", after: 16 } },
  { id: "CUSTOMER_PROFILE", title: "CUSTOMER_PROFILE", row: "customer", tier: "life", table: "CUSTOMER_PROFILE", meta: (c) => c.view === "partition" ? "partition CUSTOMER_ID" : `LIFE · ∞ · ${fmtInt(rows(c, "CUSTOMER_PROFILE"))}`, runtime: (c) => [["Rows (subjects)", fmtInt(rows(c, "CUSTOMER_PROFILE"))]], contract: [["TTL", "none"], ["PK", "CUSTOMER_ID"], ["Derived", "AVG_TICKET = sum_24h ÷ count_24h, materialized in RecordTxn"]], source: { id: "ddl", needle: "CREATE TABLE CUSTOMER_PROFILE", after: 12 } },
  { id: "recordMerchant", title: "RecordMerchantTxn", row: "merchant", tier: "merchant", procedure: "RecordMerchantTxn", meta: (c) => c.view === "partition" ? "single-partition · param 0" : `with merchant_id · ${c.hasRates && c.latest ? fmtInt(c.latest.merchant) : "—"}/s`, runtime: (c) => [["Invocations", rate(c, c.latest?.merchant)]], contract: [["Partition", "MERCHANT_MINUTE.MERCHANT_ID · parameter 0"], ["Writes", "MERCHANT_TXN_SEEN · MERCHANT_MINUTE"], ["Condition", "only when merchant_id is non-empty"]], source: { id: "RecordMerchantTxn", needle: "public long run(String merchantId", after: 6 } },
  { id: "MERCHANT_TXN_SEEN", title: "MERCHANT_TXN_SEEN", row: "merchant", tier: "merchant", table: "MERCHANT_TXN_SEEN", meta: () => "MERCHANT · 48 h", runtime: (c) => [["Rows", fmtInt(rows(c, "MERCHANT_TXN_SEEN"))]], contract: [["TTL", "48 HOURS on CREATED_AT"], ["PK", "(MERCHANT_ID, TXN_ID)"]], source: { id: "ddl", needle: "CREATE TABLE MERCHANT_TXN_SEEN", after: 8 } },
  { id: "MERCHANT_MINUTE", title: "MERCHANT_MINUTE", row: "merchant", tier: "merchant", table: "MERCHANT_MINUTE", meta: () => "MERCHANT · 7 d", runtime: (c) => [["Rows", fmtInt(rows(c, "MERCHANT_MINUTE"))], ["Compression", "~50:1 at hot merchants"]], contract: [["TTL", "7 DAYS on BUCKET_START"], ["PK", "(MERCHANT_ID, BUCKET_START)"]], source: { id: "ddl", needle: "CREATE TABLE MERCHANT_MINUTE", after: 13 } },
  { id: "merchantReads", title: "Merchant reads", row: "reads", tier: "merchant", procedure: "GetMerchantFeatures", meta: () => "GetMerchantFeatures", runtime: (c) => [["Reads", c.hasRates && c.latest ? fmtRate(c.latest.reads * 0.1, " q/s") : "—"]], contract: [["Procedure", "GetMerchantFeatures(merchantId, windowMinutes)"], ["Boundary", "minute-floored cutoff"]], source: { id: "GetMerchantFeatures", needle: "public VoltTable[] run", after: 6 } },
  { id: "customerReads", title: "Customer reads", row: "reads", tier: "hot", procedure: "GetRollingFeatures", meta: () => "Rolling · Profile · Daily", runtime: (c) => [["Reads", c.hasRates && c.latest ? fmtRate(c.latest.reads * 0.9, " q/s") : "—"]], contract: [["Procedures", "GetRollingFeatures · GetProfile · GetDailyBuckets · GetRecentTxns"], ["Tier boundary", "≤ 10080 min TXN_RAW · > 10080 min CUSTOMER_DAILY"]], source: { id: "GetRollingFeatures", needle: "if (windowMinutes <= HOT_TIER_MINUTES)", before: 4, after: 12 } },
];

type Box = { id: string; x: number; y: number; w: number; h: number; cx: number; cy: number; right: number; bottom: number };
const GAP = 36;
const ROW_Y: Record<string, number> = { dlq: 52, customer: 205, merchant: 332 };
const ROW_H: Record<string, number> = { spine: 56, dlq: 52, customer: 54, merchant: 54, reads: 50 };

/** Node width follows the longest of title (10.5px semibold) and meta (8.7px) so identifiers never overflow. */
function widthFor(n: ArchNode, ctx: Ctx): number {
  const titleW = n.title.length * 7.3;
  const metaW = n.meta(ctx).length * 5.2;
  return Math.max(112, Math.round(Math.max(titleW, metaW)) + 26);
}
function box(id: string, x: number, y: number, w: number, h: number): Box { return { id, x, y, w, h, cx: x + w / 2, cy: y + h / 2, right: x + w, bottom: y + h }; }

/** Deterministic left-to-right layout: spine → branch rows → reads column. Returns boxes and the viewBox width. */
export function layout(ctx: Ctx): { boxes: Record<string, Box>; width: number } {
  const byRow = (r: ArchNode["row"]) => ARCH_NODES.filter((n) => n.row === r);
  const boxes: Record<string, Box> = {};
  let x = 18;
  const spineCy = ROW_Y.customer + ROW_H.customer / 2;
  for (const n of byRow("spine")) { const w = widthFor(n, ctx); const h = n.id === "voltsp" ? 80 : ROW_H.spine; boxes[n.id] = box(n.id, x, spineCy - h / 2, w, h); x += w + (n.id === "kafka" ? 30 : GAP); }
  const branchX = boxes.voltsp.right + 104;
  let maxRight = 0;
  for (const r of ["dlq", "customer", "merchant"] as const) {
    let bx = branchX;
    for (const n of byRow(r)) { const w = widthFor(n, ctx); boxes[n.id] = box(n.id, bx, ROW_Y[r], w, ROW_H[r]); bx += w + GAP; }
    if (r !== "dlq") maxRight = Math.max(maxRight, bx - GAP);
  }
  const readsX = maxRight + GAP + 8;
  const mr = byRow("reads").find((n) => n.id === "merchantReads")!, cr = byRow("reads").find((n) => n.id === "customerReads")!;
  boxes.merchantReads = box("merchantReads", readsX, 300, widthFor(mr, ctx), ROW_H.reads);
  boxes.customerReads = box("customerReads", readsX, 418, widthFor(cr, ctx), ROW_H.reads);
  const width = Math.max(boxes.merchantReads.right, boxes.customerReads.right) + 18;
  return { boxes, width };
}

const straight = (a: Box, b: Box) => `M${a.right} ${a.cy}H${b.x - 2}`;
const curve = (x1: number, y1: number, x2: number, y2: number) => { const dx = Math.max(40, (x2 - x1) * 0.55); return `M${x1} ${y1} C${x1 + dx} ${y1},${x2 - dx} ${y2},${x2 - 2} ${y2}`; };

export function ArchitectureDiagram({ selected, onSelect, ctx }: { selected: string | null; onSelect: (id: string) => void; ctx: Ctx }) {
  const { boxes: b, width } = layout(ctx);
  const rej = ctx.hasRates && ctx.latest ? `${ctx.latest.rejected.toFixed(1)}/s rejected` : "— rejected";
  const edges: { d: string; cls?: string }[] = [
    { d: straight(b.loadgen, b.kafka) }, { d: straight(b.kafka, b.voltsp) },
    { d: curve(b.voltsp.right, b.voltsp.cy - 16, b.dlq.x, b.dlq.cy), cls: "red" }, { d: straight(b.dlq, b.bump), cls: "red" },
    { d: `M${b.voltsp.right} ${b.voltsp.cy}H${b.recordTxn.x - 2}`, cls: "green" }, { d: curve(b.voltsp.right, b.voltsp.cy + 16, b.recordMerchant.x, b.recordMerchant.cy), cls: "green" },
    { d: straight(b.recordTxn, b.TXN_RAW) }, { d: straight(b.TXN_RAW, b.CUSTOMER_DAILY) }, { d: straight(b.CUSTOMER_DAILY, b.CUSTOMER_PROFILE) },
    { d: straight(b.recordMerchant, b.MERCHANT_TXN_SEEN) }, { d: straight(b.MERCHANT_TXN_SEEN, b.MERCHANT_MINUTE) },
    { d: curve(b.MERCHANT_MINUTE.right, b.MERCHANT_MINUTE.cy, b.merchantReads.x, b.merchantReads.cy) },
    { d: curve(b.CUSTOMER_PROFILE.right, b.CUSTOMER_PROFILE.cy, b.customerReads.x, b.customerReads.cy) },
  ];
  const noteX = b.voltsp.x, noteW = Math.min(460, b.customerReads.x - noteX - 24);
  return (
    <svg className="arch-svg" viewBox={`0 0 ${width} 500`} role="group" aria-label="Kafka to VoltSP to VoltDB event path">
      <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 8 4 0 8z" fill="#9fb0c7" /></marker></defs>
      {edges.map((e, i) => <path key={i} className={`arch-edge ${e.cls ?? ""}`} d={e.d} markerEnd="url(#arrow)" />)}
      <text className="arch-rate" x={(b.kafka.right + b.voltsp.x) / 2} y={b.voltsp.y - 6} textAnchor="middle">{ctx.hasRates && ctx.latest ? `${fmtInt(ctx.latest.ingest + ctx.latest.rejected)}/s` : "—"}</text>
      <text className="arch-rate" x={(b.voltsp.right + b.recordTxn.x) / 2} y={b.voltsp.cy - 8} textAnchor="middle">{ctx.hasRates && ctx.latest ? `${fmtInt(ctx.latest.ingest)}/s` : "—"}</text>
      <text className="arch-rate red" x={(b.voltsp.right + b.dlq.x) / 2 + 10} y={(b.voltsp.cy + b.dlq.cy) / 2 - 6} textAnchor="middle">{rej}</text>
      {ARCH_NODES.map((n) => { const k = b[n.id]; return (
        <g key={n.id} className={`arch-node ${selected === n.id ? "selected" : ""}`} tabIndex={0} role="button" aria-label={`${n.title}: ${n.meta(ctx)}`} onClick={() => onSelect(n.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.id); } }}>
          <rect x={k.x} y={k.y} width={k.w} height={k.h} rx="10" />
          <text className="title" x={k.x + 12} y={k.y + 20}>{n.title}</text>
          <text className="meta" x={k.x + 12} y={k.y + 35}>{n.meta(ctx)}</text>
          {n.id === "voltsp" && <g className="arch-badge"><rect x={k.x + 12} y={k.y + 48} width="58" height="16" /><text x={k.x + 20} y={k.y + 59.5}>{ctx.hasRates ? "FLOWING" : "WAITING"}</text></g>}
        </g>); })}
      <g><rect x={noteX} y="430" width={noteW} height="44" rx="9" fill="#eff6ff" stroke="#bfdbfe" /><text x={noteX + 14} y="448" fontSize="10" fill="#315a9c"><tspan fontWeight="700">Independent atomic calls.</tspan> Valid events call RecordTxn; events with merchant_id</text><text x={noteX + 14} y="463" fontSize="10" fill="#315a9c">also call RecordMerchantTxn. The two writes are separate single-partition transactions.</text></g>
    </svg>
  );
}

export function nodeSourceExcerpt(n: ArchNode): { path: string; start: number; text: string; lang: "sql" | "java" | "yaml" | "bash" | "text"; highlight: number } | null {
  if (!n.source) return null;
  const f = REPO[n.source.id];
  const line = findLine(f, n.source.needle);
  const start = Math.max(1, line - (n.source.before ?? 0));
  const end = line + (n.source.after ?? 6);
  return { path: f.path, start, text: f.source.split("\n").slice(start - 1, end).join("\n"), lang: f.lang, highlight: line };
}
