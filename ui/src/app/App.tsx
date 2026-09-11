import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SettingsProvider } from "@/data/settings";
import { InspectorProvider } from "@/components/shell/Inspector";
import { ConsoleShell } from "@/components/shell/ConsoleShell";

const Overview = lazy(() => import("@/pages/Overview"));
const Architecture = lazy(() => import("@/pages/Architecture"));
const Schema = lazy(() => import("@/pages/Schema"));
const Procedures = lazy(() => import("@/pages/Procedures"));
const SqlConsole = lazy(() => import("@/pages/SqlConsole"));
const Explorer = lazy(() => import("@/pages/Explorer"));
const Hygiene = lazy(() => import("@/pages/Hygiene"));
const Benchmarks = lazy(() => import("@/pages/Benchmarks"));
const Sizing = lazy(() => import("@/pages/Sizing"));
const Runbook = lazy(() => import("@/pages/Runbook"));
const DecayStory = lazy(() => import("@/pages/DecayStory"));
const Control = lazy(() => import("@/pages/Control"));
const Settings = lazy(() => import("@/pages/Settings"));

function Fallback() { return <div style={{ padding: 24, display: "grid", gap: 12 }}><div className="skeleton" style={{ height: 91 }} /><div className="skeleton" style={{ height: 300 }} /></div>; }

export default function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <InspectorProvider>
          <Routes>
            <Route element={<ConsoleShell />}>
              <Route index element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<Suspense fallback={<Fallback />}><Overview /></Suspense>} />
              <Route path="/architecture" element={<Suspense fallback={<Fallback />}><Architecture /></Suspense>} />
              <Route path="/schema" element={<Suspense fallback={<Fallback />}><Schema /></Suspense>} />
              <Route path="/procedures" element={<Suspense fallback={<Fallback />}><Procedures /></Suspense>} />
              <Route path="/sql" element={<Suspense fallback={<Fallback />}><SqlConsole /></Suspense>} />
              <Route path="/explorer" element={<Suspense fallback={<Fallback />}><Explorer /></Suspense>} />
              <Route path="/hygiene" element={<Suspense fallback={<Fallback />}><Hygiene /></Suspense>} />
              <Route path="/benchmarks" element={<Suspense fallback={<Fallback />}><Benchmarks /></Suspense>} />
              <Route path="/sizing" element={<Suspense fallback={<Fallback />}><Sizing /></Suspense>} />
              <Route path="/runbook" element={<Suspense fallback={<Fallback />}><Runbook /></Suspense>} />
              <Route path="/decay" element={<Suspense fallback={<Fallback />}><DecayStory /></Suspense>} />
              <Route path="/control" element={<Suspense fallback={<Fallback />}><Control /></Suspense>} />
              <Route path="/settings" element={<Suspense fallback={<Fallback />}><Settings /></Suspense>} />
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Route>
          </Routes>
        </InspectorProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}
