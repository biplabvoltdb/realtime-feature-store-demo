import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from "recharts";
import type { Sample } from "@/data/telemetry";
import { TABLE_TIER, TIER_META, type Tier } from "@/lib/tier";
import { tableBytes, type TableStat } from "@/data/mock";
import { fmtBytes, fmtCompact, fmtTime, fmtDecimal, fmtInt } from "@/lib/format";
import type { VoltTable } from "@/lib/volt";
import { Legend } from "@/components/ui/primitives";

const TIER_HEX: Record<Tier, string> = { hot: "#2563eb", warm: "#7c3aed", life: "#0d9488", merchant: "#ea580c", hygiene: "#dc2626", kafka: "#64748b", voltsp: "#16a34a" };
export const tierHex = (t: Tier) => TIER_HEX[t];

export function DonutStorage({ stats, dimmed, onSelect }: { stats: TableStat[]; dimmed?: (tier: Tier) => boolean; onSelect?: (table: string) => void }) {
  const total = stats.reduce((a, t) => a + tableBytes(t), 0);
  const r = 46, c = 2 * Math.PI * r;
  let offset = 0;
  const merchant = stats.filter((s) => TABLE_TIER[s.name] === "merchant");
  const legend = [...stats.filter((s) => TABLE_TIER[s.name] !== "merchant" && s.name !== "COUNTERS"), ...(merchant.length ? [{ name: "Merchant tables", rows: merchant.reduce((a, t) => a + t.rows, 0), tupleKb: merchant.reduce((a, t) => a + t.tupleKb, 0), stringKb: merchant.reduce((a, t) => a + t.stringKb, 0) }] : []), ...stats.filter((s) => s.name === "COUNTERS")];
  return (
    <div className="donut-row">
      <div className="donut" role="img" aria-label={`Table data memory ${fmtBytes(total)} across ${stats.length} tables`}>
        <svg viewBox="0 0 114 114">
          {stats.map((s) => { const tier = TABLE_TIER[s.name] ?? "hygiene"; const frac = total ? tableBytes(s) / total : 0; const len = Math.max(frac * c, 1.5); const el = <circle key={s.name} cx="57" cy="57" r={r} fill="none" stroke={TIER_HEX[tier]} strokeWidth="11" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} opacity={dimmed?.(tier) ? .25 : 1} />; offset += len; return el; })}
        </svg>
        <div className="donut-center"><div className="donut-value">{fmtBytes(total)}</div><div className="donut-label">table data memory</div></div>
      </div>
      <div className="storage-list">
        {legend.map((s) => { const tier: Tier = s.name === "Merchant tables" ? "merchant" : (TABLE_TIER[s.name] ?? "hygiene"); return (
          <button key={s.name} type="button" className={`storage-line ${dimmed?.(tier) ? "dimmed" : ""}`} onClick={() => onSelect?.(s.name === "Merchant tables" ? "MERCHANT_MINUTE" : s.name)} title={`${s.name}: ${fmtInt(s.rows)} rows · ${fmtBytes(tableBytes(s))}`}>
            <span className={`dot ${TIER_META[tier].dot}`} /><span className="name">{s.name}</span><span className="amount">{fmtCompact(s.rows).replace(" ", "")} · {fmtBytes(tableBytes(s), tableBytes(s) < 1024 ** 3 ? 0 : 2).replace(" ", "")}</span>
          </button>); })}
      </div>
    </div>
  );
}

export type SeriesKey = { key: keyof Sample; label: string; color: string; dimmed?: boolean };
export function RateTrendChart({ samples, keys, height = 240, unit = "", decimals = 0, emptyText = "Waiting for the first telemetry window…" }: { samples: Sample[]; keys: SeriesKey[]; height?: number; unit?: string; decimals?: number; emptyText?: string }) {
  if (samples.length < 2) return <div className="empty-state" style={{ height }}><div>{emptyText}</div></div>;
  const data = samples.map((s) => ({ t: s.t, ...Object.fromEntries(keys.map((k) => [k.key, s[k.key] as number])) }));
  return (
    <div>
      <Legend items={keys.map((k) => ({ label: k.label, color: k.dimmed ? "#c3cbd8" : k.color }))} />
      <div className="chart-wrap" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#e9edf3" />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtTime(v, false)} tick={{ fontSize: 9, fill: "#94a0b2" }} axisLine={false} tickLine={false} minTickGap={70} />
            <YAxis width={44} tick={{ fontSize: 9, fill: "#94a0b2" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${decimals ? Number(v).toFixed(decimals) : fmtCompact(Number(v), 1)}`} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ fontSize: 10.5, borderRadius: 8, border: "1px solid #e2e7ef" }} labelFormatter={(v) => fmtTime(Number(v))} formatter={(v: number, name: string) => [`${decimals ? v.toFixed(decimals) : fmtInt(v)}${unit}`, keys.find((k) => k.key === name)?.label ?? name]} />
            {keys.map((k) => <Line key={k.key} type="monotone" dataKey={k.key} stroke={k.dimmed ? "#d5dbe5" : k.color} strokeWidth={2} dot={false} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function DailyBucketsChart({ table, metric, height = 150 }: { table: VoltTable; metric: string; height?: number }) {
  const ti = table.columns.findIndex((c) => c.name === "DAY_START");
  const mi = table.columns.findIndex((c) => c.name === metric);
  const data = [...table.rows].reverse().map((r) => ({ day: Number(r[ti]) / 1000, value: Number(r[mi] ?? 0) }));
  const isAmount = /SUM/.test(metric);
  return (
    <div className="chart-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#e9edf3" />
          <XAxis dataKey="day" tickFormatter={(v) => new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} tick={{ fontSize: 9, fill: "#94a0b2" }} axisLine={false} tickLine={false} minTickGap={60} />
          <YAxis width={44} tick={{ fontSize: 9, fill: "#94a0b2" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(Number(v), 1)} />
          <Tooltip contentStyle={{ fontSize: 10.5, borderRadius: 8, border: "1px solid #e2e7ef" }} labelFormatter={(v) => new Date(Number(v)).toDateString()} formatter={(v: number) => [isAmount ? `₹${fmtDecimal(v)}` : fmtInt(v), metric]} cursor={{ fill: "rgba(37,99,235,.05)" }} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>{data.map((_, i) => <Cell key={i} fill={i === data.length - 1 ? "#7c3aed" : "#d8c8fa"} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
