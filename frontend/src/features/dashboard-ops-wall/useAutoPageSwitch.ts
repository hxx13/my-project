import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'dash_auto_switch';
const DASHBOARD_STAY_MS = 15_000;
const PREVIEW_LAST_SECTION = 4;
const PAGES = ['/console/dashboard', '/console/dashboard-preview'];

/** Module-level callback — set by useAutoPageSwitch, called by page components */
let onLastSectionReached: (() => void) | null = null;

export function notifyLastSectionReached() {
  onLastSectionReached?.();
}

export function useAutoPageSwitch() {
  const location = useLocation();
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchedRef = useRef(false);
  const lastSectionReachedRef = useRef(false);

  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
    catch { return false; }
  });

  const toggle = useCallback(() => setEnabled((p) => {
    const next = !p;
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
    return next;
  }), []);

  const isPreview = location.pathname.includes('/dashboard-preview');
  const isDashboard = location.pathname === '/console/dashboard' || location.pathname.endsWith('/dashboard');

  /* ── Reset on each page load ── */
  useEffect(() => {
    switchedRef.current = false;
    lastSectionReachedRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [location.pathname]);

  const doSwitch = useCallback(() => {
    if (switchedRef.current) return;
    const idx = PAGES.findIndex((p) => location.pathname === p || location.pathname.endsWith(p));
    const nextIdx = idx >= 0 ? (idx + 1) % PAGES.length : 1;
    switchedRef.current = true;
    navigate(PAGES[nextIdx]);
  }, [location.pathname, navigate]);

  /* ── Register callback so page components can notify ── */
  useEffect(() => {
    onLastSectionReached = () => {
      if (!enabled || switchedRef.current || lastSectionReachedRef.current) return;
      lastSectionReachedRef.current = true;
      // Allow the typewriter to finish its current sentence display
      // (pauseDuration ≈2.5s), then give the viewer 3s of reading time.
      // Allow all 5 sentences of scene 4 TextType to finish typing + reading time
      timerRef.current = setTimeout(doSwitch, 15000);
    };
    return () => { onLastSectionReached = null; };
  }, [enabled, doSwitch]);

  /* ── Dashboard: auto-switch after 30s ── */
  useEffect(() => {
    if (!enabled || !isDashboard) return;
    timerRef.current = setTimeout(doSwitch, DASHBOARD_STAY_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [enabled, isDashboard, doSwitch, location.pathname]);

  return { enabled, toggle };
}
