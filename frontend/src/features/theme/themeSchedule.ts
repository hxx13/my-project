/** 默认亮色时段：早 8:00 — 下午 16:30 */
export const DEFAULT_LIGHT_START = "08:00";
export const DEFAULT_LIGHT_END = "16:30";

export type ColorMode = "light" | "dark";

export interface AppearanceSchedulePrefs {
  /** 是否启用定时自动切换；缺省视为 true */
  autoScheduleEnabled?: boolean;
  /** 手动覆盖亮/暗色，至下一 schedule 边界前有效 */
  manualOverride?: ColorMode | null;
  lightStart?: string;
  lightEnd?: string;
  /** 关闭自动切换时用户自选主题 id（standard | standard-dark | scifi） */
  manualThemeId?: string;
}

export const APPEARANCE_SCHEDULE_STORAGE_KEY = "twin-appearance-schedule";

export function defaultAppearanceSchedulePrefs(): Required<
  Pick<AppearanceSchedulePrefs, "autoScheduleEnabled" | "manualOverride" | "lightStart" | "lightEnd">
> &
  AppearanceSchedulePrefs {
  return {
    autoScheduleEnabled: true,
    manualOverride: null,
    lightStart: DEFAULT_LIGHT_START,
    lightEnd: DEFAULT_LIGHT_END,
    manualThemeId: "standard",
  };
}

export function parseTimeToMinutes(hhmm: string): number {
  const parts = String(hhmm || "").trim().split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m));
}

export function getScheduledMode(
  now: Date = new Date(),
  lightStart: string = DEFAULT_LIGHT_START,
  lightEnd: string = DEFAULT_LIGHT_END
): ColorMode {
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = parseTimeToMinutes(lightStart);
  const end = parseTimeToMinutes(lightEnd);
  if (start === end) return "light";
  if (start < end) {
    return mins >= start && mins < end ? "light" : "dark";
  }
  // 跨午夜（预留）
  return mins >= start || mins < end ? "light" : "dark";
}

/** 距下一 schedule 边界（lightStart / lightEnd）的毫秒数 */
export function msUntilNextScheduleBoundary(
  now: Date = new Date(),
  lightStart: string = DEFAULT_LIGHT_START,
  lightEnd: string = DEFAULT_LIGHT_END
): number {
  const boundaries = [lightStart, lightEnd].map((t) => {
    const m = parseTimeToMinutes(t);
    const d = new Date(now);
    d.setSeconds(0, 0);
    d.setHours(Math.floor(m / 60), m % 60, 0, 0);
    return d.getTime();
  });

  let next = boundaries.find((t) => t > now.getTime());
  if (next == null) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setSeconds(0, 0);
    const m = parseTimeToMinutes(lightStart);
    tomorrow.setHours(Math.floor(m / 60), m % 60, 0, 0);
    next = tomorrow.getTime();
  }
  return Math.max(1000, next - now.getTime());
}

export function themeIdForColorMode(mode: ColorMode): string {
  return mode === "light" ? "standard" : "standard-dark";
}

export function colorModeFromThemeId(themeId: string): ColorMode {
  const t = getThemeModeFromId(themeId);
  return t;
}

function getThemeModeFromId(themeId: string): ColorMode {
  if (themeId === "standard") return "light";
  return "dark";
}

export function normalizeAppearanceSchedulePrefs(
  raw: AppearanceSchedulePrefs | null | undefined
): AppearanceSchedulePrefs {
  const d = defaultAppearanceSchedulePrefs();
  if (!raw) return d;
  return {
    autoScheduleEnabled: raw.autoScheduleEnabled !== false,
    manualOverride:
      raw.manualOverride === "light" || raw.manualOverride === "dark" ? raw.manualOverride : null,
    lightStart: formatScheduleTimeForInput(raw.lightStart?.trim() || d.lightStart || DEFAULT_LIGHT_START),
    lightEnd: formatScheduleTimeForInput(raw.lightEnd?.trim() || d.lightEnd || DEFAULT_LIGHT_END),
    manualThemeId: raw.manualThemeId?.trim() || d.manualThemeId,
  };
}

export function resolveEffectiveColorMode(
  prefs: AppearanceSchedulePrefs,
  now: Date = new Date()
): ColorMode {
  const p = normalizeAppearanceSchedulePrefs(prefs);
  if (p.autoScheduleEnabled) {
    if (p.manualOverride === "light" || p.manualOverride === "dark") {
      return p.manualOverride;
    }
    return getScheduledMode(now, p.lightStart, p.lightEnd);
  }
  const tid = p.manualThemeId || "standard";
  return getThemeModeFromId(tid);
}

export function resolveEffectiveThemeId(
  prefs: AppearanceSchedulePrefs,
  now: Date = new Date()
): string {
  const p = normalizeAppearanceSchedulePrefs(prefs);
  if (p.autoScheduleEnabled) {
    const mode = resolveEffectiveColorMode(p, now);
    return themeIdForColorMode(mode);
  }
  const tid = p.manualThemeId || "standard";
  if (tid === "standard" || tid === "standard-dark" || tid === "scifi") return tid;
  return "standard";
}

export function readLocalAppearanceSchedule(): AppearanceSchedulePrefs {
  if (typeof window === "undefined") return defaultAppearanceSchedulePrefs();
  try {
    const raw = window.localStorage.getItem(APPEARANCE_SCHEDULE_STORAGE_KEY);
    if (raw) {
      return normalizeAppearanceSchedulePrefs(JSON.parse(raw) as AppearanceSchedulePrefs);
    }
  } catch {
    /* fall through */
  }
  try {
    const legacy = window.localStorage.getItem("twin-theme");
    if (legacy && (legacy === "standard" || legacy === "standard-dark" || legacy === "scifi")) {
      return normalizeAppearanceSchedulePrefs({
        autoScheduleEnabled: false,
        manualThemeId: legacy,
      });
    }
  } catch {
    /* ignore */
  }
  return defaultAppearanceSchedulePrefs();
}

export function formatScheduleTimeForInput(hhmm: string): string {
  const parts = String(hhmm || "").trim().split(":");
  const h = Math.max(0, Math.min(23, Number(parts[0]) || 0));
  const m = Math.max(0, Math.min(59, Number(parts[1]) || 0));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseScheduleTimeFromInput(value: string): string | null {
  const t = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return formatScheduleTimeForInput(t);
}

export function writeLocalAppearanceSchedule(prefs: AppearanceSchedulePrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APPEARANCE_SCHEDULE_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
