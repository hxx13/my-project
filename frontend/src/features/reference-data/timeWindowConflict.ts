import type { AnimalOrderWindowRule } from "@/api/domains/animalOrderTime.api";

const EFFECT_OPEN = "OPEN";
const EFFECT_DISABLE = "DISABLE";
const SHAPE_WEEKLY = "WEEKLY";
const SHAPE_WEEKLY_SPAN = "WEEKLY_SPAN";
const SHAPE_DAILY = "DAILY";
const SHAPE_RANGE = "RANGE";
const MAX_PROBE_DAYS = 400;
const CONFLICT_MESSAGE = "存在相反效果的重叠时间段，请调整规则";
const SECONDS_PER_DAY = 86_400;

function parseTimeToMinutes(value: string): number {
  const [h = "0", m = "0"] = value.split(":");
  return Number(h) * 60 + Number(m);
}

function parseTimeToSeconds(value: string): number {
  const [h = "0", m = "0", s = "0"] = value.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

function parseWeekdays(weekdaysCsv?: string | null): number[] {
  if (!weekdaysCsv || !weekdaysCsv.trim()) return [];
  return weekdaysCsv
    .split(",")
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
}

/** JS Date.getDay(): 0=Sun … 6=Sat → ISO 1=Mon … 7=Sun */
function isoWeekday(instant: Date): number {
  const d = instant.getDay();
  return d === 0 ? 7 : d;
}

function weekdayMatches(weekdaysCsv: string | null | undefined, instant: Date): boolean {
  const days = parseWeekdays(weekdaysCsv);
  if (days.length === 0) return true;
  return days.includes(isoWeekday(instant));
}

function dailyCovers(instant: Date, start: string, end: string): boolean {
  const t = instant.getHours() * 60 + instant.getMinutes();
  const startM = parseTimeToMinutes(start);
  const endM = parseTimeToMinutes(end);
  if (startM <= endM) {
    return t >= startM && t <= endM;
  }
  return t >= startM || t <= endM;
}

function secondOfWeek(isoDow: number, timeValue: string): number {
  return (isoDow - 1) * SECONDS_PER_DAY + parseTimeToSeconds(timeValue);
}

function timeFromDate(instant: Date): string {
  const hh = String(instant.getHours()).padStart(2, "0");
  const mm = String(instant.getMinutes()).padStart(2, "0");
  const ss = String(instant.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Form B: circular-week arc from (startDow,startTime) to (endDow,endTime). */
function weekSpanCovers(
  startDow: number,
  startTime: string,
  endDow: number,
  endTime: string,
  instant: Date,
): boolean {
  const startSec = secondOfWeek(startDow, startTime);
  const endSec = secondOfWeek(endDow, endTime);
  const instantSec = secondOfWeek(isoWeekday(instant), timeFromDate(instant));
  if (startSec <= endSec) {
    return instantSec >= startSec && instantSec <= endSec;
  }
  return instantSec >= startSec || instantSec <= endSec;
}

function ruleCoversInstant(rule: AnimalOrderWindowRule, instant: Date): boolean {
  if (rule.shape === SHAPE_WEEKLY || rule.shape === SHAPE_DAILY) {
    if (!weekdayMatches(rule.weekdays, instant)) return false;
    if (!rule.dailyStartTime || !rule.dailyEndTime) return false;
    return dailyCovers(instant, rule.dailyStartTime, rule.dailyEndTime);
  }
  if (rule.shape === SHAPE_WEEKLY_SPAN) {
    const startDow = rule.startWeekday;
    const endDow = rule.endWeekday;
    if (
      startDow == null ||
      endDow == null ||
      startDow < 1 ||
      startDow > 7 ||
      endDow < 1 ||
      endDow > 7 ||
      !rule.dailyStartTime ||
      !rule.dailyEndTime
    ) {
      return false;
    }
    return weekSpanCovers(startDow, rule.dailyStartTime, endDow, rule.dailyEndTime, instant);
  }
  if (rule.shape === SHAPE_RANGE) {
    if (!rule.rangeStartAt || !rule.rangeEndAt) return false;
    const start = new Date(rule.rangeStartAt);
    const end = new Date(rule.rangeEndAt);
    return instant >= start && instant <= end;
  }
  return false;
}

function hasOppositeOverlapAt(instant: Date, rules: AnimalOrderWindowRule[]): boolean {
  let hasOpen = false;
  let hasDisable = false;
  for (const rule of rules) {
    if (!ruleCoversInstant(rule, instant)) continue;
    if (rule.effect === EFFECT_OPEN) hasOpen = true;
    else if (rule.effect === EFFECT_DISABLE) hasDisable = true;
    if (hasOpen && hasDisable) return true;
  }
  return false;
}

/** Same grouping as backend saveAdmin: scope + categoryKey. */
export function validateRuleGroups(rules: AnimalOrderWindowRule[]): void {
  const groups = new Map<string, AnimalOrderWindowRule[]>();
  for (const rule of rules) {
    if (rule.active === 0) continue;
    const key = `${rule.scope}:${rule.categoryKey ?? ""}`;
    const list = groups.get(key) ?? [];
    list.push(rule);
    groups.set(key, list);
  }
  for (const group of groups.values()) {
    validateNoOppositeOverlap(group);
  }
}

export function validateNoOppositeOverlap(rules: AnimalOrderWindowRule[]): void {
  if (rules.length < 2) return;
  const start = new Date(2026, 0, 1, 0, 0, 0, 0);
  const limit = new Date(start.getTime() + MAX_PROBE_DAYS * 24 * 60 * 60 * 1000);
  const cursor = new Date(start);
  while (cursor <= limit) {
    if (hasOppositeOverlapAt(cursor, rules)) {
      throw new Error(CONFLICT_MESSAGE);
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
}
