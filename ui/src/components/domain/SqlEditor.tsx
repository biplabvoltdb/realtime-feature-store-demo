import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, StandardSQL } from "@codemirror/lang-sql";
import { keymap, EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { DDL_MODEL } from "@/repo/ddlModel";
import { PROCEDURES } from "@/data/mock";

export function SqlEditor({ value, onChange, onRun, height = 200 }: { value: string; onChange: (v: string) => void; onRun: () => void; height?: number }) {
  const extensions = useMemo(() => {
    const schema: Record<string, string[]> = Object.fromEntries(DDL_MODEL.tables.map((t) => [t.name, t.columns.map((c) => c.name)]));
    PROCEDURES.forEach((p) => { schema[p.name] = []; });
    return [
      sql({ dialect: StandardSQL, schema, upperCaseKeywords: true }),
      Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => { onRun(); return true; } }])),
      EditorView.lineWrapping,
      EditorView.theme({ "&": { fontSize: "11.5px" }, ".cm-content": { fontFamily: "var(--font-mono)", padding: "8px 0" }, ".cm-gutters": { fontFamily: "var(--font-mono)" } }),
    ];
  }, [onRun]);
  return (
    <div className="cm-host" style={{ minHeight: height }}>
      <CodeMirror value={value} height={`${height}px`} onChange={onChange} extensions={extensions} basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, autocompletion: true, bracketMatching: true }} aria-label="SQL editor" />
    </div>
  );
}
