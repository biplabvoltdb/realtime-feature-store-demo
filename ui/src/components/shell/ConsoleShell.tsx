import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, Bell, Search, ChevronDown } from "lucide-react";
import { ROUTES, routeByPath } from "@/app/routes";
import { useSettings } from "@/data/settings";
import { useLatest, useTelemetry, startTelemetry, setPollInterval } from "@/data/telemetry";
import { useHealth } from "@/data/api";
import { fmtAgo, fmtInt } from "@/lib/format";
import { Dot } from "@/components/ui/primitives";
import { CommandPalette } from "./CommandPalette";
import { useNow } from "@/data/hooks";

export function ConsoleShell() {
  const loc = useLocation();
  const nav = useNavigate();
  const route = routeByPath(loc.pathname);
  const { settings, update } = useSettings();
  const [rail, setRail] = useState(false);
  const [palette, setPalette] = useState(false);
  const latest = useLatest();
  const t = useTelemetry();
  const health = useHealth();
  const now = useNow(1000);

  useEffect(() => startTelemetry(settings.dataMode, settings.pollMs), [settings.dataMode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPollInterval(settings.pollMs); }, [settings.pollMs]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
  useEffect(() => { document.title = `${route.title} · NovaPay Feature Store Console`; }, [route]);

  const mock = settings.dataMode === "mock";
  const hasRates = t.samples.length >= 1;
  const stale = !mock && t.lastSuccessAt != null && now - t.lastSuccessAt > settings.pollMs * 2 + 1500;
  const unreachable = !mock && (t.lastError != null && (!health || !health.ok || t.ticks > 0 && t.samples.length === 0 && t.lastError != null));
  const connecting = !mock && t.ticks === 0;
  const idle = !mock && hasRates && latest != null && latest.ingest === 0;
  const status = mock ? { cls: "mock", dot: "purple", label: "Mock data · not connected" }
    : connecting ? { cls: "warn", dot: "amber", label: "Connecting to BFF…" }
    : unreachable ? { cls: "error", dot: "red", label: health?.error?.includes("BFF") || t.lastError?.includes("BFF") ? "BFF unreachable" : "VoltDB unreachable" }
    : stale ? { cls: "warn", dot: "amber", label: "Telemetry stale" }
    : idle ? { cls: "warn", dot: "amber", label: "Pipeline idle" }
    : { cls: "", dot: "green", label: "All Systems Operational" };
  const pill = mock ? { cls: "mock", dot: "purple", label: t.paused ? "Mock · paused" : "Mock" } : unreachable ? { cls: "stale", dot: "red", label: "Offline" } : stale ? { cls: "stale", dot: "amber", label: "Stale" } : { cls: "", dot: "green", label: "Live" };
  const clusterLabel = mock ? "Mock" : health?.ok ? "Healthy" : health ? "Unreachable" : "Connecting…";
  const clusterColor = mock ? "var(--purple)" : health?.ok ? "var(--green)" : health ? "var(--red)" : "var(--amber)";

  return (
    <div className={`app-shell ${rail ? "rail" : ""}`}>
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className="sidebar" aria-label="Primary">
        <div className="brand"><span className="brand-mark" aria-hidden="true" /><span className="brand-word">Volt</span></div>
        <nav className="nav" aria-label="Console pages">
          {ROUTES.map((r) => { const Icon = r.icon; const active = route.id === r.id; return (
            <button key={r.id} type="button" className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => nav(r.path)} title={r.label}><Icon className="nav-icon" size={16} strokeWidth={1.8} /><span>{r.label}</span></button>
          ); })}
        </nav>
        <div className="cluster-card">
          <div className="cluster-title">VoltDB Cluster <Dot color={mock ? "purple" : health?.ok ? "green" : health ? "red" : "amber"} /><span style={{ color: clusterColor, fontSize: 9 }}>{clusterLabel}</span></div>
          <div className="cluster-host" title={`${settings.voltApiUrl}${health?.version ? ` · VoltDB ${health.version}` : ""}${health?.hosts ? ` · ${health.hosts} host${health.hosts === 1 ? "" : "s"}` : ""}${health?.uptime ? ` · up ${health.uptime}` : ""}`}>{settings.voltApiUrl.replace(/^https?:\/\//, "")} · updated {t.lastSuccessAt ? fmtAgo(t.lastSuccessAt, now) : "—"}</div>
          <a className="cluster-link" href={settings.vmcUrl} target="_blank" rel="noreferrer">Open Volt Management Center ↗</a>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="hamburger" aria-label="Toggle navigation width" onClick={() => setRail((r) => !r)}><Menu size={18} /></button>
            <div className="page-heading"><h1 className="page-title" style={{ margin: 0 }}>{route.title}</h1><div className="page-subtitle">{route.subtitle}</div></div>
          </div>
          <div className="topbar-right">
            <button type="button" className="environment" onClick={() => nav("/settings")} title="Environment · edit in Settings"><div className="environment-label">Environment</div><div className="environment-value">{settings.environmentName} <ChevronDown size={12} color="#8290a7" /></div></button>
            <div className={`system-status ${status.cls}`} role="status" aria-live="polite" title={t.lastError ?? health?.error ?? undefined}><Dot color={status.dot} /> {status.label}</div>
            <button type="button" className="search-box" onClick={() => setPalette(true)} aria-label="Open command palette"><Search size={14} /><span className="placeholder">Search tables, procedures, subjects…</span><span className="keycap">⌘K</span></button>
            <button type="button" className="bell" aria-label="Notifications" title="No notifications"><Bell size={17} /></button>
            <button type="button" className="user" onClick={() => nav("/settings")} title="Presenter · edit in Settings"><div className="avatar">{settings.presenter.initials}</div><div><div className="user-name">{settings.presenter.name}</div><div className="user-role">{settings.presenter.role}</div></div><ChevronDown size={12} color="#8290a7" /></button>
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          {mock && <div className="mock-banner">Mock data mode · deterministic fixtures, no cluster connected · repository sources are real <button type="button" onClick={() => update({ dataMode: "live" })}>Switch to live cluster</button><button type="button" onClick={() => nav("/settings")}>Settings</button></div>}
          {!mock && t.baselineReset && <div className="mock-banner" style={{ background: "var(--amber-soft)", color: "var(--amber)", borderColor: "#fed7aa" }}>{t.baselineReset}</div>}
          {!mock && unreachable && <div className="mock-banner" style={{ background: "var(--red-soft)", color: "var(--red)", borderColor: "#fecaca" }}>{t.lastError ?? health?.error ?? "VoltDB unreachable"} <button type="button" onClick={() => nav("/settings")} style={{ color: "var(--red)" }}>Connection settings</button></div>}
          <div className="content-inner"><Outlet /></div>
        </main>
        <footer className="footer">
          <div>© 2026 Volt Active Data</div>
          <div className="footer-center">Feature ingest and reads powered by VoltDB + VoltSP</div>
          <div className="footer-right">
            <span>Ingest {hasRates && latest ? `${fmtInt(latest.ingest)} ev/s` : "—"} · reads {hasRates && latest ? `${fmtInt(latest.reads)} q/s` : "—"} · VoltDB {health?.version ?? "—"}</span>
            <span className={`live-pill ${pill.cls}`}><Dot color={pill.dot} /> {pill.label}</span>
          </div>
        </footer>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Toasts />
    </div>
  );
}

function Toasts() {
  const { toasts } = useSettings();
  if (!toasts.length) return null;
  return <div className="toast-stack" aria-live="polite">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>;
}
