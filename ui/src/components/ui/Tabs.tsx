import type { ReactNode } from "react";

export type TabItem = { id: string; label: ReactNode; badge?: ReactNode; disabled?: boolean };
export function Tabs({ items, active, onChange, right, style }: { items: TabItem[]; active: string; onChange: (id: string) => void; right?: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="tabs" role="tablist" style={style}>
      {items.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={`tab ${active === t.id ? "active" : ""}`} disabled={t.disabled} onClick={() => onChange(t.id)} style={t.disabled ? { opacity: .45, cursor: "not-allowed" } : undefined}>
          {t.label}{t.badge != null && <span className="badge hot" style={{ marginLeft: 3 }}>{t.badge}</span>}
        </button>
      ))}
      {right && <><span className="spacer" /><div className="tab" style={{ color: "var(--accent)" }}>{right}</div></>}
    </div>
  );
}
