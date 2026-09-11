/** Optional Kafka inspection: consumer-group lag (admin API, read-only) and a bounded DLQ tail using an isolated group. */
import { Kafka, logLevel } from "kafkajs";

const client = (bootstrap: string) => new Kafka({ clientId: "novapay-console-bff", brokers: bootstrap.split(",").map((s) => s.trim()).filter(Boolean), logLevel: logLevel.NOTHING, connectionTimeout: 4000, requestTimeout: 8000 });

export type LagRow = { partition: number; endOffset: number; committed: number | null; lag: number | null };
export async function consumerLag(bootstrap: string, groupId: string, topic: string): Promise<{ groupId: string; topic: string; rows: LagRow[]; totalLag: number | null; groupState?: string }> {
  const admin = client(bootstrap).admin();
  await admin.connect();
  try {
    const [ends, committed, groups] = await Promise.all([admin.fetchTopicOffsets(topic), admin.fetchOffsets({ groupId, topics: [topic] }), admin.describeGroups([groupId]).catch(() => null)]);
    const cp = committed.find((c) => c.topic === topic)?.partitions ?? [];
    const rows: LagRow[] = ends.map((e) => { const c = cp.find((p) => p.partition === e.partition); const co = c && c.offset !== "-1" ? Number(c.offset) : null; return { partition: e.partition, endOffset: Number(e.high), committed: co, lag: co == null ? null : Math.max(0, Number(e.high) - co) }; }).sort((a, b) => a.partition - b.partition);
    const known = rows.filter((r) => r.lag != null);
    return { groupId, topic, rows, totalLag: known.length ? known.reduce((a, r) => a + (r.lag ?? 0), 0) : null, groupState: groups?.groups?.[0]?.state };
  } finally { await admin.disconnect(); }
}

/** Produce a small batch of events onto the source topic (Decay Story reactivation etc.). Write path — callers must gate it behind the unlock. */
export async function produceEvents(bootstrap: string, topic: string, events: { key: string | null; value: string }[]): Promise<{ topic: string; count: number; partitions: { partition: number; baseOffset?: string }[] }> {
  const producer = client(bootstrap).producer({ allowAutoTopicCreation: false });
  await producer.connect();
  try {
    const meta = await producer.send({ topic, messages: events.map((e) => ({ key: e.key, value: e.value })) });
    return { topic, count: events.length, partitions: meta.map((m) => ({ partition: m.partition, baseOffset: m.baseOffset })) };
  } finally { await producer.disconnect(); }
}

export type DlqMessage = { partition: number; offset: number; timestamp: number; key: string | null; value: string };
export async function tailTopic(bootstrap: string, topic: string, n: number): Promise<{ topic: string; messages: DlqMessage[]; highWatermarks: Record<number, number> }> {
  const kafka = client(bootstrap);
  const admin = kafka.admin();
  await admin.connect();
  let offsets: { partition: number; high: string; low: string }[];
  try { offsets = await admin.fetchTopicOffsets(topic); } finally { await admin.disconnect(); }
  const highWatermarks = Object.fromEntries(offsets.map((o) => [o.partition, Number(o.high)]));
  const perPart = Math.max(1, Math.ceil(n / Math.max(1, offsets.length)));
  const targets = offsets.map((o) => ({ partition: o.partition, from: Math.max(Number(o.low), Number(o.high) - perPart), high: Number(o.high) })).filter((t) => t.high > t.from);
  const expected = targets.reduce((a, t) => a + (t.high - t.from), 0);
  if (expected === 0) return { topic, messages: [], highWatermarks };
  const groupId = `novapay-console-tail-${process.pid}-${Date.now()}`;
  const consumer = kafka.consumer({ groupId, sessionTimeout: 10000, allowAutoTopicCreation: false });
  const messages: DlqMessage[] = [];
  await consumer.connect();
  try {
    await consumer.subscribe({ topic, fromBeginning: false });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 8000);
      consumer.run({ autoCommit: false, eachMessage: async ({ partition, message }) => {
        messages.push({ partition, offset: Number(message.offset), timestamp: Number(message.timestamp), key: message.key?.toString("utf8") ?? null, value: message.value?.toString("utf8") ?? "" });
        if (messages.length >= expected) { clearTimeout(timer); resolve(); }
      } }).then(() => { for (const t of targets) consumer.seek({ topic, partition: t.partition, offset: String(t.from) }); }).catch(() => { clearTimeout(timer); resolve(); });
    });
  } finally { await consumer.disconnect(); }
  messages.sort((a, b) => b.timestamp - a.timestamp);
  return { topic, messages: messages.slice(0, n), highWatermarks };
}
