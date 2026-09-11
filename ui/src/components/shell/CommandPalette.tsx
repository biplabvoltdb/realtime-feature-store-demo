import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CornerDownLeft } from "lucide-react";
import { ROUTES } from "@/app/routes";
import { parseSnippets } from "@/repo";
import { DDL_MODEL } from "@/repo/ddlModel";
import { PROCEDURES } from "@/data/mock";
import { useSettings } from "@/data/settings";

type Item = { id: string; group: string; label: string; hint?: string; run: () => void };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { readOnly } = useSettings();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(() => {
    const go = (p: string) => () => { nav(p); onClose(); };
    const list: Item[] = [
      ...ROUTES.map((r) => ({ id: `nav-${r.id}`, group: "Navigate", label: r.label, hint: r.path, run: go(r.path) })),
      ...parseSnippets().map((s) => ({ id: `snip-${s.id}`, group: "Run snippet", label: `${String(s.number).padStart(2, "0")} ${s.title}`, hint: s.statement.split("\n")[0].slice(0, 48), run: go(`/sql?snippet=${s.id}`) })),
      ...DDL_MODEL.tables.map((t) => ({ id: `tbl-${t.name}`, group: "Open definition", label: t.name, hint: "table", run: go(`/schema?table=${t.name}`) })),
      ...PROCEDURES.filter((p) => !(readOnly && p.mutating)).map((p) => ({ id: `proc-${p.name}`, group: "Open definition", label: p.name, hint: p.kind === "java" ? "Java procedure" : "DDL procedure", run: go(`/procedures?name=${p.name}`) })),
    ];
    const trimmed = q.trim();
    if (/^\d{12}$/.test(trimmed)) list.unshift({ id: "cust", group: "Look up subject", label: `Customer ${trimmed}`, hint: "Feature Explorer", run: go(`/explorer?subject=customer&id=${trimmed}`) });
    if (/^m-\d{5}$/i.test(trimmed)) list.unshift({ id: "merch", group: "Look up subject", label: `Merchant ${trimmed.toUpperCase()}`, hint: "Feature Explorer", run: go(`/explorer?subject=merchant&id=${trimmed.toUpperCase()}`) });
    const needle = trimmed.toLowerCase();
    return needle ? list.filter((i) => i.label.toLowerCase().includes(needle) || i.hint?.toLowerCase().includes(needle) || i.group.toLowerCase().includes(needle)) : list;
  }, [q, nav, onClose, readOnly]);

  useEffect(() => { if (open) { setQ(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);
  useEffect(() => { setIdx(0); }, [q]);
  if (!open) return null;
  const groups = Array.from(new Set(items.map((i) => i.group)));
  return (
    <div className="overlay center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input"><Search size={15} /><input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages, snippets, tables, procedures, or type a customer / merchant id…" onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
          if (e.key === "Enter" && items[idx]) items[idx].run();
          if (e.key === "Escape") onClose();
        }} /><span className="keycap">esc</span></div>
        <div className="palette-list">
          {items.length === 0 && <div className="palette-empty">No matches. Try a page name, a table, a procedure, or a 12-digit customer id.</div>}
          {groups.map((g) => (
            <div key={g}>
              <div className="palette-group">{g}</div>
              {items.filter((i) => i.group === g).map((i) => { const active = items[idx] === i; return (
                <button key={i.id} type="button" className={`palette-item ${active ? "active" : ""}`} onMouseEnter={() => setIdx(items.indexOf(i))} onClick={i.run}>
                  <span style={{ color: "var(--text-muted)" }}>{active ? <CornerDownLeft size={13} /> : "·"}</span><span className={/^(Open definition|Look up)/.test(g) ? "mono" : ""}>{i.label}</span><span className="hint">{i.hint}</span>
                </button>); })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
