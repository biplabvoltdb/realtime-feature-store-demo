import { useState, type CSSProperties, type ReactNode, type ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Copy } from "lucide-react";
import { TIER_META, type Tier } from "@/lib/tier";
import { copyText } from "@/lib/csv";
import { useSettings } from "@/data/settings";

export type Tone = "hot" | "warm" | "life" | "merchant" | "hygiene" | "good" | "warn" | "neutral" | "mock" | "kafka" | "voltsp";

export function Dot({ color }: { color: string }) { return <span className={`dot ${color}`} aria-hidden="true" />; }

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={`badge ${tone}`} title={title}>{children}</span>;
}
export function TierBadge({ tier, label }: { tier: Tier; label?: string }) {
  const tone: Tone = tier === "kafka" ? "kafka" : tier === "voltsp" ? "voltsp" : tier;
  return <Badge tone={tone}>{label ?? TIER_META[tier].badge}</Badge>;
}

export function InfoTip({ content, source }: { content: ReactNode; source?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info-tip" tabIndex={0} role="button" aria-label="Explain this metric" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      i
      {open && <span className="tooltip" role="tooltip">{content}{source && <span className="tooltip-src">{source}</span>}</span>}
    </span>
  );
}

export function Card({ title, subtitle, info, source, actions, footer, children, className = "", bodyClassName = "", flush = false, style, headerless = false }: {
  title?: ReactNode; subtitle?: ReactNode; info?: ReactNode; source?: string; actions?: ReactNode; footer?: ReactNode; children?: ReactNode;
  className?: string; bodyClassName?: string; flush?: boolean; style?: CSSProperties; headerless?: boolean;
}) {
  return (
    <section className={`card ${className}`} style={style}>
      {!headerless && (title || actions) && (
        <div className="card-header">
          <div className="card-heading">
            <span className="card-title">{title}{subtitle && <> <span className="card-subtle">{subtitle}</span></>}</span>
            {info && <InfoTip content={info} source={source} />}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className={`card-body ${flush ? "flush" : ""} ${bodyClassName}`}>{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </section>
  );
}

export function Chip({ label, dot, selected, dimmed, onClick, count, title }: { label: ReactNode; dot?: string; selected?: boolean; dimmed?: boolean; onClick?: () => void; count?: number; title?: string }) {
  return (
    <button type="button" className={`chip ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""}`} aria-pressed={selected} onClick={onClick} title={title}>
      {dot && <Dot color={dot} />}{label}{count != null && <span className="badge neutral">{count}</span>}
    </button>
  );
}

export function Notice({ tone = "info", children, icon, action, style }: { tone?: "info" | "warn" | "good" | "error" | "mock"; children: ReactNode; icon?: ReactNode; action?: ReactNode; style?: CSSProperties }) {
  const glyph = icon ?? (tone === "warn" ? "!" : tone === "good" ? "✓" : tone === "error" ? "×" : "i");
  return <div className={`notice ${tone}`} role={tone === "error" ? "alert" : undefined} style={style}><span className="notice-icon">{glyph}</span><span style={{ flex: 1 }}>{children}</span>{action}</div>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "small"; icon?: LucideIcon };
export function Button({ variant = "ghost", icon: Icon, children, className = "", ...rest }: BtnProps) {
  const cls = variant === "primary" ? "primary-button" : variant === "danger" ? "danger-button" : variant === "small" ? "small-control" : "ghost-button";
  return <button type="button" className={`${cls} ${className}`} {...rest}>{Icon && <Icon size={13} />}{children}</button>;
}
export function LinkButton({ children, onClick, className = "", title }: { children: ReactNode; onClick?: () => void; className?: string; title?: string }) {
  return <button type="button" className={`link ${className}`} onClick={onClick} title={title}>{children}</button>;
}

export function CopyButton({ value, label = "Copy", className = "" }: { value: string; label?: string; className?: string }) {
  const { toast } = useSettings();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`link ${className}`} onClick={async () => { const ok = await copyText(value); setDone(ok); toast(ok ? "Copied to clipboard" : "Clipboard unavailable"); setTimeout(() => setDone(false), 1500); }} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {done ? <Check size={11} /> : <Copy size={11} />}{done ? "Copied" : label}
    </button>
  );
}

export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? "on" : ""}`} disabled={disabled} onClick={() => onChange(!on)} />;
}

export function EmptyState({ icon, title, detail, action, minHeight }: { icon?: ReactNode; title: string; detail?: ReactNode; action?: ReactNode; minHeight?: number }) {
  return (
    <div className="empty-state" style={minHeight ? { minHeight } : undefined}>
      <div>
        {icon && <div className="empty-icon">{icon}</div>}
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
        {action && <div style={{ marginTop: 12 }}>{action}</div>}
      </div>
    </div>
  );
}

export function KpiCard({ label, value, unit, tone, icon: Icon, meta, metaTone = "good", info, source, onClick }: {
  label: string; value: string; unit?: string; tone: "blue" | "green" | "purple" | "orange" | "teal" | "red" | "slate"; icon: LucideIcon; meta?: string; metaTone?: "good" | "neutral"; info?: ReactNode; source?: string; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "section";
  return (
    <Tag className="card kpi-card" onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      <div className="kpi-top"><div className={`icon-tile ${tone}`}><Icon size={17} /></div><div className="kpi-label">{label}</div>{info && <InfoTip content={info} source={source} />}</div>
      <div className="kpi-value">{value}{unit && <span className="kpi-unit">{unit}</span>}</div>
      {meta && <div className={`kpi-meta ${metaTone === "neutral" ? "neutral" : ""}`}>{meta}</div>}
    </Tag>
  );
}

export function Sparkline({ values, color, height = 31, baseline = true }: { values: number[]; color: string; height?: number; baseline?: boolean }) {
  if (!values.length) return <div className="spark" style={{ height }} />;
  const w = 113, h = 30, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2), h - pad - ((v - min) / span) * (h - pad * 2 - 2)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return <div className="spark" style={{ height }}><svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">{baseline && <path d={`M1 ${h - 1}H${w - 1}`} stroke="#edf0f4" />}<path d={d} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></div>;
}

export function Kv({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return <div className="kv"><span>{k}</span><span className={mono ? "mono" : ""}>{v}</span></div>;
}
export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) { return <div className="drawer-label" style={style}>{children}</div>; }
export function Skeleton({ h = 14, w = "100%", style }: { h?: number; w?: number | string; style?: CSSProperties }) { return <div className="skeleton" style={{ height: h, width: w, ...style }} aria-hidden="true" />; }
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div className="legend">{items.map((i) => <span key={i.label} className="legend-item" style={{ color: i.color }}><span className="legend-line" />{i.label}</span>)}</div>;
}
