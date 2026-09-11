import { REPO } from "./index";

export type ColumnModel = { name: string; type: string; nullable: boolean; defaultValue: string | null; comment: string | null; filler: boolean };
export type IndexModel = { name: string; columns: string[] };
export type TableModel = {
  name: string; columns: ColumnModel[]; primaryKey: string[]; partitionColumn: string | null;
  ttl: { value: number; unit: string; column: string; batchSize: number | null } | null;
  indexes: IndexModel[]; comment: string | null; ddlLines: [number, number];
};
export type ProcedureDdl = { name: string; kind: "java" | "sql"; partitionTable: string | null; partitionColumn: string | null; sql: string | null; className: string | null };

/** Parses the repository ddl.sql into a structural model (tables, keys, TTL, indexes, procedures). */
export function parseDdl(): { tables: TableModel[]; procedures: ProcedureDdl[] } {
  const src = REPO.ddl.source;
  const lines = src.split("\n");
  const tables: TableModel[] = [];
  const procedures: ProcedureDdl[] = [];

  const tableRe = /CREATE TABLE (\w+)\s*\(([\s\S]*?)\)\s*(USING TTL (\d+) (\w+) ON COLUMN (\w+)(?: BATCH_SIZE (\d+))?)?\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(src))) {
    const [, name, body, , ttlVal, ttlUnit, ttlCol, batch] = m;
    const startLine = src.slice(0, m.index).split("\n").length;
    const endLine = startLine + m[0].split("\n").length - 1;
    const columns: ColumnModel[] = [];
    let primaryKey: string[] = [];
    // comment block preceding the CREATE TABLE
    const preceding: string[] = [];
    for (let i = startLine - 2; i >= 0 && /^--/.test(lines[i]); i--) preceding.unshift(lines[i].replace(/^--\s?/, ""));
    for (const rawLine of body.split("\n")) {
      const [defPart, ...commentParts] = rawLine.split("--");
      const comment = commentParts.length ? commentParts.join("--").trim() : null;
      const pk = /PRIMARY KEY\s*\(([^)]+)\)/.exec(defPart);
      if (pk) { primaryKey = pk[1].split(",").map((s) => s.trim()); continue; }
      // a line may hold several short column defs (the F01..F38 fillers)
      const defs = defPart.split(",").map((s) => s.trim()).filter(Boolean);
      for (const def of defs) {
        const cm = /^(\w+)\s+([A-Z]+(?:\(\d+\))?)(.*)$/.exec(def);
        if (!cm) continue;
        const [, cname, ctype, rest] = cm;
        const d = /DEFAULT\s+(\S+)/.exec(rest);
        columns.push({ name: cname, type: ctype, nullable: !/NOT NULL/.test(rest), defaultValue: d ? d[1] : null, comment, filler: /^F\d\d$/.test(cname) });
      }
    }
    const partRe = new RegExp(`PARTITION TABLE ${name} ON COLUMN (\\w+);`);
    const pm = partRe.exec(src);
    const indexes: IndexModel[] = [];
    const idxRe = new RegExp(`CREATE INDEX (\\w+)\\s+ON ${name}\\s*\\(([^)]+)\\);`, "g");
    let im: RegExpExecArray | null;
    while ((im = idxRe.exec(src))) indexes.push({ name: im[1], columns: im[2].split(",").map((s) => s.trim()) });
    tables.push({
      name, columns, primaryKey, partitionColumn: pm ? pm[1] : null,
      ttl: ttlVal ? { value: Number(ttlVal), unit: ttlUnit, column: ttlCol, batchSize: batch ? Number(batch) : null } : null,
      indexes, comment: preceding.length ? preceding.join(" ").replace(/\s+/g, " ").trim() : null, ddlLines: [startLine, endLine],
    });
  }

  const javaRe = /CREATE PROCEDURE PARTITION ON TABLE (\w+) COLUMN (\w+)\s+FROM CLASS ([\w.]+);/g;
  while ((m = javaRe.exec(src))) procedures.push({ name: m[3].split(".").pop()!, kind: "java", partitionTable: m[1], partitionColumn: m[2], sql: null, className: m[3] });
  const sqlRe = /CREATE PROCEDURE (\w+)\s+(?:PARTITION ON TABLE (\w+) COLUMN (\w+)\s+)?AS ([\s\S]*?);/g;
  while ((m = sqlRe.exec(src))) procedures.push({ name: m[1], kind: "sql", partitionTable: m[2] ?? null, partitionColumn: m[3] ?? null, sql: m[4].replace(/\n\s+/g, "\n  ").trim(), className: null });
  return { tables, procedures };
}

export const DDL_MODEL = parseDdl();
export const tableByName = (name: string) => DDL_MODEL.tables.find((t) => t.name === name);
