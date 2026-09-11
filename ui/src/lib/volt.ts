/** VoltDB JSON API type codes and the normalized result shapes used everywhere in the console. */
export const VOLT_TYPE_NAMES: Record<number, string> = {
  1: "NULL", 3: "TINYINT", 4: "SMALLINT", 5: "INTEGER", 6: "BIGINT", 8: "FLOAT", 9: "STRING",
  11: "TIMESTAMP", 22: "DECIMAL", 25: "VARBINARY", 26: "GEOGRAPHY_POINT", 27: "GEOGRAPHY",
};
export const T = { TINYINT: 3, SMALLINT: 4, INTEGER: 5, BIGINT: 6, FLOAT: 8, STRING: 9, TIMESTAMP: 11, DECIMAL: 22, VARBINARY: 25 } as const;
export type VoltTypeCode = (typeof T)[keyof typeof T];

export type VoltColumn = { name: string; typeCode: number; typeName: string };
export type VoltCell = string | number | null;
export type VoltTable = { name?: string; columns: VoltColumn[]; rows: VoltCell[][] };

export type CallRequest = { procedure: string; params: unknown[] } | { sql: string };
export type CallTiming = { bffRoundTripMs: number; upstreamMs?: number };

export type ExecResponse = {
  ok: boolean;
  source: "mock" | "live" | "repo";
  results: VoltTable[];
  timing: CallTiming;
  capturedAt: string;
  request: unknown;
  response: unknown;
  statusstring?: string;
  warnings?: string[];
};

export function col(name: string, typeCode: number): VoltColumn {
  return { name, typeCode, typeName: VOLT_TYPE_NAMES[typeCode] ?? `TYPE_${typeCode}` };
}
export const isNumericType = (code: number) => [3, 4, 5, 6, 8, 22].includes(code);

/** Convert a normalized table to the raw JSON API `results[i]` shape, for the request inspector. */
export function toRawResult(t: VoltTable) {
  return { status: -128, schema: t.columns.map((c) => ({ name: c.name, type: c.typeCode })), data: t.rows };
}
export function toRawEnvelope(results: VoltTable[]) {
  return { status: 1, appstatus: -128, statusstring: null, appstatusstring: null, results: results.map(toRawResult) };
}
