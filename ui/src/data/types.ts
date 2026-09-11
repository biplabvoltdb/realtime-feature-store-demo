export type TableStat = { name: string; rows: number; tupleKb: number; stringKb: number };
export type ProcStat = { name: string; invocations: number; avgUs: number; minUs: number; maxUs: number; ratePerSec: number | null };
export type HealthInfo = { ok: boolean; voltApiUrl: string; checkedAt: string; version?: string; hosts?: number; partitions?: number; kSafety?: number; uptime?: string; clusterState?: string; startTime?: number; error?: string; bffRoundTripMs?: number };
