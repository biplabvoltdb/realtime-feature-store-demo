/**
 * Real repository files, imported as raw text at build time. These are not fixtures:
 * they are the exact sources the console must show (DESIGN.md §7.5 keeps repo sources real in mock mode).
 */
import ddl from "../../../src/main/resources/ddl.sql?raw";
import removeDdl from "../../../src/main/resources/remove_db.sql?raw";
import queries from "../../../src/main/resources/queries.sql?raw";
import pipelineConfig from "../../../config/pipeline-config.yaml?raw";
import readme from "../../../README.md?raw";
import recordTxn from "../../../src/main/java/com/novapay/poc/procedures/RecordTxn.java?raw";
import recordMerchantTxn from "../../../src/main/java/com/novapay/poc/procedures/RecordMerchantTxn.java?raw";
import bumpCounter from "../../../src/main/java/com/novapay/poc/procedures/BumpCounter.java?raw";
import getRollingFeatures from "../../../src/main/java/com/novapay/poc/procedures/GetRollingFeatures.java?raw";
import getMerchantFeatures from "../../../src/main/java/com/novapay/poc/procedures/GetMerchantFeatures.java?raw";
import pipeline from "../../../src/main/java/com/novapay/poc/pipeline/TxnFeaturePipeline.java?raw";
import loadgen from "../../../src/main/java/com/novapay/poc/loadgen/TxnLoadGenerator.java?raw";
import querybench from "../../../src/main/java/com/novapay/poc/query/FeatureQueryBench.java?raw";
import s01 from "../../../scripts/01_create_topic.sh?raw";
import s02 from "../../../scripts/02_start_voltdb.sh?raw";
import s03 from "../../../scripts/03_deploy_schema.sh?raw";
import s04 from "../../../scripts/04_run_pipeline.sh?raw";
import s05 from "../../../scripts/05_run_loadgen.sh?raw";
import s06 from "../../../scripts/06_run_querybench.sh?raw";

export type RepoFile = { id: string; path: string; lang: "sql" | "java" | "yaml" | "bash" | "text"; source: string };

export const REPO: Record<string, RepoFile> = {
  ddl: { id: "ddl", path: "src/main/resources/ddl.sql", lang: "sql", source: ddl },
  removeDdl: { id: "removeDdl", path: "src/main/resources/remove_db.sql", lang: "sql", source: removeDdl },
  queries: { id: "queries", path: "src/main/resources/queries.sql", lang: "sql", source: queries },
  config: { id: "config", path: "config/pipeline-config.yaml", lang: "yaml", source: pipelineConfig },
  readme: { id: "readme", path: "README.md", lang: "text", source: readme },
  RecordTxn: { id: "RecordTxn", path: "src/main/java/com/novapay/poc/procedures/RecordTxn.java", lang: "java", source: recordTxn },
  RecordMerchantTxn: { id: "RecordMerchantTxn", path: "src/main/java/com/novapay/poc/procedures/RecordMerchantTxn.java", lang: "java", source: recordMerchantTxn },
  BumpCounter: { id: "BumpCounter", path: "src/main/java/com/novapay/poc/procedures/BumpCounter.java", lang: "java", source: bumpCounter },
  GetRollingFeatures: { id: "GetRollingFeatures", path: "src/main/java/com/novapay/poc/procedures/GetRollingFeatures.java", lang: "java", source: getRollingFeatures },
  GetMerchantFeatures: { id: "GetMerchantFeatures", path: "src/main/java/com/novapay/poc/procedures/GetMerchantFeatures.java", lang: "java", source: getMerchantFeatures },
  pipeline: { id: "pipeline", path: "src/main/java/com/novapay/poc/pipeline/TxnFeaturePipeline.java", lang: "java", source: pipeline },
  loadgen: { id: "loadgen", path: "src/main/java/com/novapay/poc/loadgen/TxnLoadGenerator.java", lang: "java", source: loadgen },
  querybench: { id: "querybench", path: "src/main/java/com/novapay/poc/query/FeatureQueryBench.java", lang: "java", source: querybench },
  s01: { id: "s01", path: "scripts/01_create_topic.sh", lang: "bash", source: s01 },
  s02: { id: "s02", path: "scripts/02_start_voltdb.sh", lang: "bash", source: s02 },
  s03: { id: "s03", path: "scripts/03_deploy_schema.sh", lang: "bash", source: s03 },
  s04: { id: "s04", path: "scripts/04_run_pipeline.sh", lang: "bash", source: s04 },
  s05: { id: "s05", path: "scripts/05_run_loadgen.sh", lang: "bash", source: s05 },
  s06: { id: "s06", path: "scripts/06_run_querybench.sh", lang: "bash", source: s06 },
};

/** Numbered demo snippets parsed from queries.sql: `-- N. Title` comment blocks followed by a statement. */
export type Snippet = { id: string; number: number; title: string; description: string; statement: string; lines: [number, number] };

export function parseSnippets(): Snippet[] {
  const lines = queries.split("\n");
  const out: Snippet[] = [];
  let cur: { number: number; title: string; desc: string[]; body: string[]; start: number } | null = null;
  const flush = (endLine: number) => {
    if (!cur) return;
    const statement = cur.body.join("\n").trim();
    if (statement) out.push({ id: `${String(cur.number).padStart(2, "0")}-${slug(cur.title)}`, number: cur.number, title: cur.title, description: cur.desc.join(" ").replace(/\s+/g, " ").trim(), statement, lines: [cur.start + 1, endLine] });
    cur = null;
  };
  lines.forEach((line, idx) => {
    const m = /^--\s*(\d+)\.\s*(.*)$/.exec(line);
    if (m) { flush(idx); cur = { number: Number(m[1]), title: m[2].trim(), desc: [], body: [], start: idx }; return; }
    if (!cur) return;
    if (/^--/.test(line)) { if (cur.body.length === 0) cur.desc.push(line.replace(/^--\s?/, "")); return; }
    if (line.trim()) cur.body.push(line);
  });
  flush(lines.length);
  return out;
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);

/** Locate the first line (1-based) matching a substring in a repo file, for source excerpts. */
export function findLine(file: RepoFile, needle: string): number {
  const idx = file.source.split("\n").findIndex((l) => l.includes(needle));
  return idx === -1 ? 1 : idx + 1;
}
export function extractLines(file: RepoFile, from: number, to: number): { start: number; text: string } {
  const lines = file.source.split("\n");
  const s = Math.max(1, from);
  const e = Math.min(lines.length, to);
  return { start: s, text: lines.slice(s - 1, e).join("\n") };
}
