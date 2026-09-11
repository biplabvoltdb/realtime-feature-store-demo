/** Whitelisted repository files. Identifiers map to fixed paths; arbitrary paths are never accepted. */
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

export const REPO_FILES: Record<string, { path: string; lang: "sql" | "java" | "yaml" | "bash" | "text" }> = {
  ddl: { path: "src/main/resources/ddl.sql", lang: "sql" },
  removeDdl: { path: "src/main/resources/remove_db.sql", lang: "sql" },
  queries: { path: "src/main/resources/queries.sql", lang: "sql" },
  config: { path: "config/pipeline-config.yaml", lang: "yaml" },
  readme: { path: "README.md", lang: "text" },
  RecordTxn: { path: "src/main/java/com/novapay/poc/procedures/RecordTxn.java", lang: "java" },
  RecordMerchantTxn: { path: "src/main/java/com/novapay/poc/procedures/RecordMerchantTxn.java", lang: "java" },
  BumpCounter: { path: "src/main/java/com/novapay/poc/procedures/BumpCounter.java", lang: "java" },
  GetRollingFeatures: { path: "src/main/java/com/novapay/poc/procedures/GetRollingFeatures.java", lang: "java" },
  GetMerchantFeatures: { path: "src/main/java/com/novapay/poc/procedures/GetMerchantFeatures.java", lang: "java" },
  pipeline: { path: "src/main/java/com/novapay/poc/pipeline/TxnFeaturePipeline.java", lang: "java" },
  loadgen: { path: "src/main/java/com/novapay/poc/loadgen/TxnLoadGenerator.java", lang: "java" },
  querybench: { path: "src/main/java/com/novapay/poc/query/FeatureQueryBench.java", lang: "java" },
  s01: { path: "scripts/01_create_topic.sh", lang: "bash" }, s02: { path: "scripts/02_start_voltdb.sh", lang: "bash" }, s03: { path: "scripts/03_deploy_schema.sh", lang: "bash" },
  s04: { path: "scripts/04_run_pipeline.sh", lang: "bash" }, s05: { path: "scripts/05_run_loadgen.sh", lang: "bash" }, s06: { path: "scripts/06_run_querybench.sh", lang: "bash" },
};

export async function readRepoFile(root: string, id: string): Promise<{ id: string; path: string; lang: string; source: string; bytes: number } | null> {
  const entry = REPO_FILES[id];
  if (!entry) return null;
  const abs = resolve(root, entry.path);
  if (!abs.startsWith(resolve(root) + sep)) throw new Error("Resolved path escapes the repository root");
  const source = await readFile(abs, "utf8");
  return { id, path: entry.path, lang: entry.lang, source, bytes: Buffer.byteLength(source) };
}
