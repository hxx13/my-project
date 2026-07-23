export type TimePreset = "yesterday" | "week" | "month" | "last_week" | "last_month" | "custom";

export function presetToRange(preset: TimePreset): { start: string; end: string } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const end = yesterdayStr + " 23:59:59";
  let start = yesterdayStr + " 00:00:00";

  if (preset === "yesterday") {
    // start = yesterday, end = yesterday
  } else if (preset === "week") {
    const monday = new Date(now);
    const dayOfWeek = monday.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setDate(monday.getDate() - daysFromMonday);
    if (monday > yesterday) {
      start = yesterdayStr + " 00:00:00";
    } else {
      start = monday.toISOString().slice(0, 10) + " 00:00:00";
    }
  } else if (preset === "month") {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    start = firstDay.toISOString().slice(0, 10) + " 00:00:00";
  } else if (preset === "last_week") {
    const d = new Date(now);
    const dayOfWeek = d.getDay();
    const daysSinceLastMonday = dayOfWeek === 0 ? 7 : dayOfWeek;
    d.setDate(d.getDate() - daysSinceLastMonday - 6);
    start = d.toISOString().slice(0, 10) + " 00:00:00";
    d.setDate(d.getDate() + 6);
    return { start, end: d.toISOString().slice(0, 10) + " 23:59:59" };
  } else if (preset === "last_month") {
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    start = firstDay.toISOString().slice(0, 10) + " 00:00:00";
    return { start, end: lastDay.toISOString().slice(0, 10) + " 23:59:59" };
  }
  return { start, end };
}

export const STUDENT_ACTIVITY_PRESETS: { key: TimePreset; label: string }[] = [
  { key: "yesterday", label: "昨日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "last_week", label: "上周" },
  { key: "last_month", label: "上月" },
];

export function resolveActivityTimeLabel(startTime: string, endTime: string): string {
  const s = startTime.slice(0, 10);
  const e = endTime.slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (s === yesterday && e === yesterday) return "昨日";
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - daysFromMonday);
  const mondayStr = monday.toISOString().slice(0, 10);
  if (s === mondayStr && e === yesterday) return "本周";
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  if (s === firstDay && e === yesterday) return "本月";
  return s.slice(5) + "-" + e.slice(5);
}
