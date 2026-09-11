export type Tier = "hot" | "warm" | "life" | "merchant" | "hygiene" | "kafka" | "voltsp";
export const HOT_TIER_MINUTES = 7 * 24 * 60; // 10080 — GetRollingFeatures.HOT_TIER_MINUTES

export const TIER_META: Record<Tier, { label: string; color: string; soft: string; dot: string; badge: string }> = {
  hot: { label: "Customer hot", color: "var(--accent)", soft: "var(--accent-soft)", dot: "blue", badge: "HOT" },
  warm: { label: "Customer warm", color: "var(--purple)", soft: "var(--purple-soft)", dot: "purple", badge: "WARM" },
  life: { label: "Lifetime", color: "var(--teal)", soft: "var(--teal-soft)", dot: "teal", badge: "LIFE" },
  merchant: { label: "Merchant", color: "var(--orange)", soft: "var(--orange-soft)", dot: "orange", badge: "MERCHANT" },
  hygiene: { label: "Hygiene", color: "var(--red)", soft: "var(--red-soft)", dot: "red", badge: "HYGIENE" },
  kafka: { label: "Kafka", color: "var(--slate)", soft: "var(--slate-soft)", dot: "slate", badge: "KAFKA" },
  voltsp: { label: "VoltSP", color: "var(--green)", soft: "var(--green-soft)", dot: "green", badge: "VOLTSP" },
};

export const TABLE_TIER: Record<string, Tier> = {
  TXN_RAW: "hot", CUSTOMER_DAILY: "warm", CUSTOMER_PROFILE: "life",
  MERCHANT_TXN_SEEN: "merchant", MERCHANT_MINUTE: "merchant", COUNTERS: "hygiene",
};

export function windowTier(windowMinutes: number): { tier: "hot" | "warm"; table: string; label: string; note: string } {
  return windowMinutes <= HOT_TIER_MINUTES
    ? { tier: "hot", table: "TXN_RAW", label: "HOT · TXN_RAW", note: "TXN_RAW · minute-aligned cutoff" }
    : { tier: "warm", table: "CUSTOMER_DAILY", label: "WARM · CUSTOMER_DAILY", note: "CUSTOMER_DAILY · day trailing edge" };
}
