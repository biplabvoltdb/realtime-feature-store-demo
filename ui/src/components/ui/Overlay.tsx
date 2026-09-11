import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

function useEscape(onClose: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose, open]);
}

export function Drawer({ open, title, subtitle, onClose, children, actions, width }: { open: boolean; title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode; width?: number }) {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"} style={width ? { width } : undefined}>
        <div className="drawer-header">
          <div><div className="drawer-title">{title}</div>{subtitle && <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{subtitle}</div>}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{actions}<button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={14} /></button></div>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <div className="overlay center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}><h3>{title}</h3>{children}</div>
    </div>
  );
}

/** Large near-fullscreen modal for content that benefits from more room (e.g. the architecture diagram).
 *  Closes on the X button, Escape, or a backdrop click; locks background scroll while open. */
export function Modal({ open, title, subtitle, onClose, actions, children }: { open: boolean; title: ReactNode; subtitle?: ReactNode; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  useEscape(onClose, open);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="overlay modal-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Dialog"}>
        <div className="modal-header">
          <div className="modal-title">{title}{subtitle && <span className="modal-subtitle">{subtitle}</span>}</div>
          <div className="modal-actions">{actions}<button type="button" className="icon-button" aria-label="Close" autoFocus onClick={onClose}><X size={16} /></button></div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
