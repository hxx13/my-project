import type { TelemetryWinccDockPollConfig } from "./types";

function parseHmToMinutes(s: string | undefined, fallback: string): number {
  const t = ((s && s.length >= 4 ? s : fallback) || fallback).trim().slice(0, 5);
  const parts = t.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h)) return 7 * 60;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

/** 与 JobSchedulerService.inWindow + matchesDay 对齐（程序坞是否自动轮询） */
export function computeDockPollGate(cfg: TelemetryWinccDockPollConfig | null | undefined): {
  inTimeWindow: boolean;
  inWeekday: boolean;
  allowed: boolean;
} {
  if (!cfg) {
    return { inTimeWindow: true, inWeekday: true, allowed: true };
  }
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const start = parseHmToMinutes(cfg.scheduleStartTime, "07:00");
  const end = parseHmToMinutes(cfg.scheduleEndTime, "22:00");
  let inTimeWindow: boolean;
  if (end === start) {
    inTimeWindow = true;
  } else if (end > start) {
    inTimeWindow = nowMin >= start && nowMin <= end;
  } else {
    inTimeWindow = nowMin >= start || nowMin <= end;
  }
  const type = (cfg.scheduleType || "DAILY").toUpperCase();
  let inWeekday = true;
  if (type === "WEEKLY" && cfg.weekDays?.trim()) {
    const set = new Set(
      cfg.weekDays
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    );
    if (set.size > 0) {
      const d = now.getDay();
      const iso = d === 0 ? 7 : d;
      inWeekday = set.has(iso);
    }
  }
  const allowed = inTimeWindow && inWeekday;
  return { inTimeWindow, inWeekday, allowed };
}
