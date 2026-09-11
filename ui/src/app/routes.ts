import { Home, Network, Database, Braces, Terminal, Search, ShieldCheck, Gauge, Calculator, ListChecks, Hourglass, SlidersHorizontal, Settings, type LucideIcon } from "lucide-react";

export type RouteDef = { id: string; path: string; label: string; icon: LucideIcon; title: string; subtitle: string };
export const ROUTES: RouteDef[] = [
  { id: "overview", path: "/overview", label: "Overview", icon: Home, title: "NovaPay Feature Store Console", subtitle: "Real-time segmentation PoC v4 · Kafka → VoltSP → VoltDB" },
  { id: "architecture", path: "/architecture", label: "Architecture", icon: Network, title: "Architecture", subtitle: "Live event path · pipeline contract · tiered storage" },
  { id: "schema", path: "/schema", label: "Schema & DDL", icon: Database, title: "Schema & DDL", subtitle: "Repository definitions compared with the deployed VoltDB catalog" },
  { id: "procedures", path: "/procedures", label: "Procedures", icon: Braces, title: "Procedures", subtitle: "Stored procedure source, signatures, execution, and plans" },
  { id: "sql", path: "/sql", label: "SQL Console", icon: Terminal, title: "SQL Console", subtitle: "Ad-hoc SQL, stored procedures, system statistics, and execution plans" },
  { id: "explorer", path: "/explorer", label: "Feature Explorer", icon: Search, title: "Feature Explorer", subtitle: "Inspect customer and merchant features across hot and warm windows" },
  { id: "hygiene", path: "/hygiene", label: "Ingest Hygiene", icon: ShieldCheck, title: "Ingest Hygiene", subtitle: "Rejected events, retry evidence, and physical TTL activity" },
  { id: "benchmarks", path: "/benchmarks", label: "Benchmarks", icon: Gauge, title: "Benchmarks", subtitle: "Server procedure performance and client benchmark evidence" },
  { id: "sizing", path: "/sizing", label: "Sizing (§8)", icon: Calculator, title: "Sizing (§8)", subtitle: "Measured table memory, bytes per subject, and RAM projection" },
  { id: "runbook", path: "/runbook", label: "Demo Runbook", icon: ListChecks, title: "Demo Runbook", subtitle: "Ten source-linked steps for a repeatable technical evaluation" },
  { id: "decay", path: "/decay", label: "Decay Story", icon: Hourglass, title: "Decay Story", subtitle: "One customer, executed live: silence → decay → sudden reactivation → floor → tail-out" },
  { id: "control", path: "/control", label: "Demo Control", icon: SlidersHorizontal, title: "Demo Control", subtitle: "Start and stop benchmarks · reset the demo to zero across Kafka, VoltSP, and VoltDB" },
  { id: "settings", path: "/settings", label: "Settings", icon: Settings, title: "Settings", subtitle: "Connection, telemetry, safety, review mode, and presenter identity" },
];
export const routeByPath = (pathname: string) => ROUTES.find((r) => pathname.startsWith(r.path)) ?? ROUTES[0];
