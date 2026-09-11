/** Tiny deterministic tokenizer-based highlighter for read-only source views (SQL, Java, YAML, Bash). */
export type Lang = "sql" | "java" | "yaml" | "bash" | "text" | "json";

const SQL_KW = "CREATE|TABLE|NOT|NULL|DEFAULT|PRIMARY|KEY|USING|TTL|ON|COLUMN|BATCH_SIZE|PARTITION|INDEX|DROP|PROCEDURE|IF|EXISTS|FROM|CLASS|LOAD|CLASSES|AS|SELECT|WHERE|ORDER|BY|DESC|ASC|LIMIT|GROUP|SUM|COUNT|MIN|MAX|DISTINCT|COALESCE|CASE|WHEN|THEN|ELSE|END|AND|OR|INSERT|INTO|VALUES|UPSERT|UPDATE|SET|DELETE|EXEC|DATEADD|NOW|DAY|DAYS|HOURS|MINUTES|UNIQUE|TIMESTAMP|BIGINT|VARCHAR|DECIMAL|INTEGER|SMALLINT|TINYINT|FLOAT|VARBINARY";
const JAVA_KW = "public|private|protected|static|final|class|extends|implements|interface|new|return|if|else|for|while|try|catch|throws|throw|import|package|void|long|int|double|boolean|String|Object|null|true|false|this|switch|case|break|continue|instanceof|var";

const rules: Record<Lang, Array<[RegExp, string]>> = {
  sql: [
    [/^--[^\n]*/, "comment"],
    [/^'(?:[^'\\]|\\.)*'/, "str"],
    [/^"(?:[^"\\]|\\.)*"/, "str"],
    [/^@\w+/, "fn"],
    [/^\b\d+(?:\.\d+)?\b/, "num"],
    [new RegExp(`^\\b(?:${SQL_KW})\\b`, "i"), "kw"],
    [/^\b[A-Z][A-Z0-9_]{2,}\b/, "typ"],
  ],
  java: [
    [/^\/\/[^\n]*/, "comment"],
    [/^\/\*[\s\S]*?\*\//, "comment"],
    [/^"(?:[^"\\]|\\.)*"/, "str"],
    [/^\b\d[\d_]*L?\b/, "num"],
    [new RegExp(`^\\b(?:${JAVA_KW})\\b`), "kw"],
    [/^\b[A-Z][A-Za-z0-9]+\b/, "typ"],
    [/^\b[a-z_][A-Za-z0-9_]*(?=\()/, "fn"],
  ],
  yaml: [
    [/^#[^\n]*/, "comment"],
    [/^"(?:[^"\\]|\\.)*"/, "str"],
    [/^[A-Za-z_][\w-]*(?=\s*:)/, "kw"],
    [/^\b\d+\b/, "num"],
  ],
  bash: [
    [/^#[^\n]*/, "comment"],
    [/^"(?:[^"\\]|\\.)*"/, "str"],
    [/^'(?:[^'\\]|\\.)*'/, "str"],
    [/^\$\{?[A-Za-z_][A-Za-z0-9_:-]*\}?/, "typ"],
    [/^\b(?:set|if|then|fi|else|echo|exit|exec|export|cd|for|in|do|done)\b/, "kw"],
    [/^\b\d+\b/, "num"],
  ],
  json: [
    [/^"(?:[^"\\]|\\.)*"(?=\s*:)/, "kw"],
    [/^"(?:[^"\\]|\\.)*"/, "str"],
    [/^-?\b\d+(?:\.\d+)?\b/, "num"],
    [/^\b(?:true|false|null)\b/, "typ"],
  ],
  text: [],
};

export type Token = { text: string; cls?: string };

export function tokenizeLine(line: string, lang: Lang): Token[] {
  const out: Token[] = [];
  let rest = line;
  let plain = "";
  const flush = () => { if (plain) { out.push({ text: plain }); plain = ""; } };
  outer: while (rest.length) {
    for (const [re, cls] of rules[lang]) {
      const m = re.exec(rest);
      if (m && m[0].length) {
        flush();
        out.push({ text: m[0], cls });
        rest = rest.slice(m[0].length);
        continue outer;
      }
    }
    plain += rest[0];
    rest = rest.slice(1);
  }
  flush();
  return out;
}

/** Multi-line block comments in Java are handled per-line by carrying state. */
export function tokenize(source: string, lang: Lang): Token[][] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  if (lang !== "java") return lines.map((l) => tokenizeLine(l, lang));
  const out: Token[][] = [];
  let inBlock = false;
  for (const line of lines) {
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) { out.push([{ text: line, cls: "comment" }]); continue; }
      const head = line.slice(0, end + 2);
      inBlock = false;
      out.push([{ text: head, cls: "comment" }, ...tokenizeLine(line.slice(end + 2), lang)]);
      continue;
    }
    const start = line.indexOf("/*");
    if (start !== -1 && line.indexOf("*/", start + 2) === -1 && !line.slice(0, start).includes("//")) {
      inBlock = true;
      out.push([...tokenizeLine(line.slice(0, start), lang), { text: line.slice(start), cls: "comment" }]);
      continue;
    }
    out.push(tokenizeLine(line, lang));
  }
  return out;
}
