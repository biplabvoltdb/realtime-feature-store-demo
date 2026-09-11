const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtInt = (n: number | null | undefined): string => (n == null || Number.isNaN(n) ? "—" : nf0.format(n));
export const fmt1 = (n: number | null | undefined): string => (n == null || Number.isNaN(n) ? "—" : nf1.format(n));
export const fmt2 = (n: number | null | undefined): string => (n == null || Number.isNaN(n) ? "—" : nf2.format(n));

/** Decimal values arrive as strings from VoltDB; format for display without losing the string. */
export function fmtDecimal(v: string | number | null | undefined, digits = 2): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}
export const fmtInr = (v: string | number | null | undefined): string => (v == null ? "—" : `₹${fmtDecimal(v)}`);

export function fmtCompact(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)} B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)} M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(digits === 2 ? 1 : digits)} K`;
  return nf0.format(n);
}

export function fmtBytes(bytes: number | null | undefined, digits = 2): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(digits)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(digits)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(digits)} KB`;
  return `${nf0.format(bytes)} B`;
}
export const fmtMB = (kb: number): string => `${fmt1(kb / 1024)} MB`;

export function fmtTime(d: Date | number | string | null | undefined, withSeconds = true): string {
  if (d == null) return "—";
  const date = typeof d === "object" ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: withSeconds ? "2-digit" : undefined });
}
export function fmtDate(d: Date | number | string | null | undefined): string {
  if (d == null) return "—";
  const date = typeof d === "object" ? d : new Date(d);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtIso(micros: string | number): string {
  const ms = Number(micros) / 1000;
  return new Date(ms).toISOString();
}
export function fmtAgo(ts: number | null | undefined, now = Date.now()): string {
  if (ts == null) return "—";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
export function fmtPct(ratio: number | null | undefined, digits = 3): string {
  if (ratio == null || Number.isNaN(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}
export function fmtRate(n: number | null | undefined, unit = "/s"): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 10) return `${n.toFixed(1)}${unit}`;
  return `${nf0.format(n)}${unit}`;
}
export function shortId(id: string, head = 4, tail = 4): string {
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}
export function fmtWindow(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes / 1440 === 1 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes / 60 === 1 ? "" : "s"}`;
  return `${minutes} min`;
}
