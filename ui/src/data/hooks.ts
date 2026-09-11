import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecResponse } from "@/lib/volt";
import { useSettings } from "./settings";

export type AsyncState<T> = { loading: boolean; data: T | null; error: string | null; startedAt: number | null; finishedAt: number | null };

/** Runs an async producer whenever `deps` change; keeps the last good result while reloading. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], enabled = true): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ loading: enabled, data: null, error: null, startedAt: null, finishedAt: null });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, startedAt: Date.now() }));
    fnRef.current().then((data) => { if (!cancelled) setState({ loading: false, data, error: null, startedAt: null, finishedAt: Date.now() }); })
      .catch((e) => { if (!cancelled) setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e), finishedAt: Date.now() })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Convenience for procedure calls: surfaces VoltDB statusstring failures as `error`. */
export function useCall(fn: () => Promise<ExecResponse>, deps: unknown[], enabled = true) {
  const mode = useSettings().settings.dataMode;
  const r = useAsync(fn, [...deps, mode], enabled);
  const failed = r.data && !r.data.ok ? r.data.statusstring ?? "Call failed" : null;
  return { ...r, response: r.data, error: r.error ?? failed, table: r.data?.ok ? r.data.results[0] : undefined };
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }, [key, v]);
  return [v, setV];
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}
