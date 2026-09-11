import { useMemo, type ReactNode } from "react";
import { tokenize, type Lang } from "@/lib/highlight";
import { CopyButton } from "./primitives";

export function CodeViewer({ source, lang, path, startLine = 1, highlightLines, actions, maxHeight, borderless, title, wrap = false }: {
  source: string; lang: Lang; path?: string; startLine?: number; highlightLines?: number[]; actions?: ReactNode; maxHeight?: number | string; borderless?: boolean; title?: ReactNode; wrap?: boolean;
}) {
  const lines = useMemo(() => tokenize(source, lang), [source, lang]);
  const hl = new Set(highlightLines ?? []);
  return (
    <div className={`code-shell ${borderless ? "borderless" : ""}`} style={{ maxHeight, height: maxHeight ? "100%" : undefined }}>
      {(path || title || actions) && (
        <div className="code-toolbar">
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title ?? path}</span>
          <span className="actions">{actions}<CopyButton value={source} /></span>
        </div>
      )}
      <div className="code-body" style={wrap ? { whiteSpace: "pre-wrap" } : undefined}>
        {lines.map((toks, i) => {
          const n = startLine + i;
          return <span key={n} className={`code-line ${hl.has(n) ? "hl" : ""}`}><span className="ln">{n}</span>{toks.map((t, j) => t.cls ? <span key={j} className={t.cls}>{t.text}</span> : t.text)}{"\n"}</span>;
        })}
      </div>
    </div>
  );
}
