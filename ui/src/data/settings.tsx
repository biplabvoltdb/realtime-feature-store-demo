import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type DataMode = "mock" | "live";
export type Settings = {
  environmentName: string; voltApiUrl: string; vmcUrl: string; kafkaBootstrap: string;
  kafkaLag: boolean; dlqTail: boolean; pollMs: number; pauseHidden: boolean;
  dataMode: DataMode; presenter: { name: string; initials: string; role: string };
};
export const DEFAULT_SETTINGS: Settings = {
  environmentName: "Local PoC", voltApiUrl: "http://localhost:8080", vmcUrl: "http://localhost:8080", kafkaBootstrap: "localhost:9092",
  kafkaLag: false, dlqTail: false, pollMs: 3000, pauseHidden: true, dataMode: import.meta.env.VITE_DEFAULT_MODE === "mock" ? "mock" : "live",
  presenter: { name: "Alex Morgan", initials: "AM", role: "Solutions Architect" },
};

type Toast = { id: number; text: string };
type Ctx = {
  settings: Settings; update: (patch: Partial<Settings>) => void; reset: () => void;
  readOnly: boolean; unlockToken: string | null; unlockWrites: (token?: string | null) => void; lockWrites: () => void;
  selectedCustomer: string; setSelectedCustomer: (id: string) => void;
  selectedMerchant: string; setSelectedMerchant: (id: string) => void;
  doneSteps: Record<number, boolean>; setStepDone: (n: number, done: boolean) => void; resetSteps: () => void;
  toasts: Toast[]; toast: (text: string) => void;
};

const SettingsContext = createContext<Ctx | null>(null);
const LS_KEY = "pfsc.settings.v2";
const LS_DEMO = "pfsc.demo.v1";

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => load(LS_KEY, DEFAULT_SETTINGS));
  const [readOnly, setReadOnly] = useState(true); // never persisted (DESIGN §7.6)
  const [unlockToken, setUnlockToken] = useState<string | null>(null);
  const [demo, setDemo] = useState(() => load(LS_DEMO, { selectedCustomer: "100000012345", selectedMerchant: "M-00042", doneSteps: {} as Record<number, boolean> }));
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } }, [settings]);
  useEffect(() => { try { localStorage.setItem(LS_DEMO, JSON.stringify(demo)); } catch { /* ignore */ } }, [demo]);

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400);
  }, []);

  const value = useMemo<Ctx>(() => ({
    settings,
    update: (patch) => setSettings((s) => ({ ...s, ...patch })),
    reset: () => setSettings(DEFAULT_SETTINGS),
    readOnly, unlockToken, unlockWrites: (token = null) => { setUnlockToken(token); setReadOnly(false); }, lockWrites: () => { setUnlockToken(null); setReadOnly(true); },
    selectedCustomer: demo.selectedCustomer, setSelectedCustomer: (id) => setDemo((d) => ({ ...d, selectedCustomer: id })),
    selectedMerchant: demo.selectedMerchant, setSelectedMerchant: (id) => setDemo((d) => ({ ...d, selectedMerchant: id })),
    doneSteps: demo.doneSteps, setStepDone: (n, done) => setDemo((d) => ({ ...d, doneSteps: { ...d.doneSteps, [n]: done } })),
    resetSteps: () => setDemo((d) => ({ ...d, doneSteps: {} })),
    toasts, toast,
  }), [settings, readOnly, unlockToken, demo, toasts, toast]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("SettingsProvider missing");
  return ctx;
}
