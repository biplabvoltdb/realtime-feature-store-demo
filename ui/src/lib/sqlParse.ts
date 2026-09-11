/** Quote- and comment-aware splitting of console input into statements, with sqlcmd-style `exec` support. */
export type ParsedStatement =
  | { kind: "exec"; procedure: string; params: (string | number)[]; text: string }
  | { kind: "sql"; sql: string; text: string; readOnly: boolean; hasLimit: boolean };

export function splitStatements(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];
    if (!quote && ch === "-" && next === "-") {
      const end = input.indexOf("\n", i);
      const stop = end === -1 ? input.length : end;
      cur += input.slice(i, stop);
      i = stop;
      continue;
    }
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; i++; continue; }
    if (ch === ";") { out.push(cur); cur = ""; i++; continue; }
    cur += ch;
    i++;
  }
  if (cur.trim()) out.push(cur);
  return out.map(stripComments).map((s) => s.trim()).filter(Boolean);
}

function stripComments(s: string): string {
  return s.split("\n").map((line) => {
    let quote: string | null = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) { if (ch === quote) quote = null; continue; }
      if (ch === "'" || ch === '"') { quote = ch; continue; }
      if (ch === "-" && line[i + 1] === "-") return line.slice(0, i);
    }
    return line;
  }).join("\n");
}

function tokenizeArgs(s: string): (string | number)[] {
  const args: (string | number)[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s|,/.test(s[i])) i++;
    if (i >= s.length) break;
    const ch = s[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      let val = "";
      while (j < s.length && s[j] !== ch) { val += s[j]; j++; }
      args.push(val);
      i = j + 1;
    } else {
      let j = i;
      while (j < s.length && !/\s|,/.test(s[j])) j++;
      const tok = s.slice(i, j);
      args.push(/^-?\d+(\.\d+)?$/.test(tok) && Math.abs(Number(tok)) <= Number.MAX_SAFE_INTEGER ? Number(tok) : tok);
      i = j;
    }
  }
  return args;
}

const WRITE_RE = /^\s*(insert|upsert|update|delete|truncate|create|drop|alter|load|partition)\b/i;

export function parseStatement(raw: string): ParsedStatement {
  const text = raw.replace(/[;\s]+$/, "").trim();
  const m = /^\s*exec(?:ute)?\s+(\S+)\s*(.*)$/is.exec(text);
  if (m) return { kind: "exec", procedure: m[1], params: tokenizeArgs(m[2] ?? ""), text };
  return { kind: "sql", sql: text, text, readOnly: !WRITE_RE.test(text), hasLimit: /\blimit\s+\d+/i.test(text) };
}

export const MUTATING_PROCEDURES = new Set(["RecordTxn", "RecordMerchantTxn", "BumpCounter", "@AdHoc_RW", "@Shutdown", "@Pause", "@Resume", "@Promote", "@UpdateClasses", "@UpdateApplicationCatalog", "@Quiesce", "@SnapshotRestore"]);
export const READ_PROCEDURES = new Set(["GetRollingFeatures", "GetMerchantFeatures", "GetProfile", "GetRecentTxns", "GetDailyBuckets", "GetCounters"]);

export function classify(st: ParsedStatement): { allowedWhenLocked: boolean; reason?: string } {
  if (st.kind === "exec") {
    const p = st.procedure.replace(/^com\.novapay\.poc\.procedures\./, "");
    if (MUTATING_PROCEDURES.has(p)) return { allowedWhenLocked: false, reason: `${p} is a mutating procedure` };
    if (READ_PROCEDURES.has(p) || /^@(Statistics|SystemInformation|SystemCatalog|Explain|ExplainProc|ExplainView|Ping)$/i.test(p)) return { allowedWhenLocked: true };
    return { allowedWhenLocked: false, reason: `${p} is not on the read allowlist` };
  }
  return st.readOnly ? { allowedWhenLocked: true } : { allowedWhenLocked: false, reason: "Statement is DML/DDL" };
}
