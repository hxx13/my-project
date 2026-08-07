import { useState, useEffect, useRef, useCallback } from "react";
import type { StatsSnapshot } from "@/api/domains/agv-stats.api";

interface SseStatsState {
  data: StatsSnapshot[] | null;
  connected: boolean;
  error: string | null;
}

/**
 * Custom hook for SSE subscription to AGV stats pipeline.
 * Connects to /api/v1/agv/stats/pipe/{slug} SSE endpoint.
 * Auto-reconnects with exponential backoff (max 30s).
 * Cleans up on unmount or slug change.
 */
export function useSseStats(slug: string | null, from?: string, to?: string): SseStatsState {
  const [state, setState] = useState<SseStatsState>({
    data: null,
    connected: false,
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000); // start at 1s
  const maxReconnectDelay = 30_000;
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!slug) return;

    cleanup();

    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    const url = `/api/v1/agv/stats/pipe/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setState((prev) => ({ ...prev, connected: true, error: null }));
      reconnectDelayRef.current = 1000; // reset backoff on successful connection
    };

    es.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const parsed: StatsSnapshot[] = JSON.parse(event.data);
        if (Array.isArray(parsed)) {
          setState((prev) => ({ ...prev, data: parsed, connected: true, error: null }));
        } else if (parsed && typeof parsed === "object") {
          // Single snapshot update — merge into existing data
          setState((prev) => {
            const existing = prev.data || [];
            const single = parsed as unknown as StatsSnapshot;
            const idx = existing.findIndex(
              (s) => s.configId === single.configId && s.metricKey === single.metricKey
            );
            if (idx >= 0) {
              const next = [...existing];
              next[idx] = single;
              return { ...prev, data: next, connected: true, error: null };
            }
            return { ...prev, data: [...existing, single], connected: true, error: null };
          });
        }
      } catch (e) {
        // Non-JSON message — could be heartbeat or comment
      }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      es.close();
      eventSourceRef.current = null;
      setState((prev) => ({ ...prev, connected: false }));

      // Exponential backoff reconnect
      const delay = reconnectDelayRef.current;
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          reconnectDelayRef.current = Math.min(delay * 2, maxReconnectDelay);
          connect();
        }
      }, delay);
    };
  }, [slug, from, to, cleanup]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [connect, cleanup]);

  // Reset data when slug changes (before new connection delivers data)
  useEffect(() => {
    setState((prev) => ({ ...prev, data: null, connected: false, error: null }));
  }, [slug]);

  return state;
}
