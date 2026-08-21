import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface AnimalOrderTimePolicySummary {
  defaultMode: string;
  canOrderNow: boolean;
  closedReason: string | null;
  nextOpenAt: string | null;
  etaMode: string;
  estimatedDeliveryDate: string | null;
  etaWorkdayOffset: number;
  etaWeekday: number | null;
  warnings: string[];
}

export interface AnimalOrderWindowRule {
  id?: number;
  scope: "GLOBAL" | "CATEGORY";
  categoryKey?: string | null;
  effect: "OPEN" | "DISABLE";
  /**
   * WEEKLY = Form A: same daily window on selected weekdays;
   * WEEKLY_SPAN = Form B: continuous arc startWeekday+time → endWeekday+time;
   * DAILY/RANGE are legacy.
   */
  shape: "WEEKLY" | "WEEKLY_SPAN" | "DAILY" | "RANGE";
  /** Form A: ISO weekdays comma-separated, e.g. "1,2,3,4,5" (1=Mon … 7=Sun) */
  weekdays?: string | null;
  /** Form B: start ISO weekday 1–7 */
  startWeekday?: number | null;
  /** Form B: end ISO weekday 1–7 */
  endWeekday?: number | null;
  /** Form A daily start / Form B span start time */
  dailyStartTime?: string;
  /** Form A daily end / Form B span end time */
  dailyEndTime?: string;
  rangeStartAt?: string;
  rangeEndAt?: string;
  label?: string;
  sortOrder?: number;
  active?: number;
}

export interface AnimalOrderTimePolicyAdmin {
  defaultMode: string;
  etaMode: string;
  etaWorkdayOffset: number;
  etaWeekday: number | null;
  rules: AnimalOrderWindowRule[];
}

export interface AnimalOrderHoliday {
  id?: number;
  holidayDate: string;
  dayType: "HOLIDAY" | "WORKDAY_SHIFT" | string;
  name?: string | null;
  source?: string;
}

export interface HolidayImportResult {
  upserted: number;
  year: number;
  warnings: string[];
}

export async function fetchTimePolicySummary(params?: {
  categoryKey?: string;
  at?: string;
}): Promise<AnimalOrderTimePolicySummary> {
  const res = await authHttp.get<Result<AnimalOrderTimePolicySummary>>(
    "/animal-order/time-policy",
    { params },
  );
  return res.data.data;
}

export async function fetchTimePolicyAdmin(): Promise<AnimalOrderTimePolicyAdmin> {
  const res = await authHttp.get<Result<AnimalOrderTimePolicyAdmin>>(
    "/animal-order/time-policy/admin",
  );
  return res.data.data;
}

export async function saveTimePolicyAdmin(body: AnimalOrderTimePolicyAdmin): Promise<void> {
  await authHttp.put<Result<null>>("/animal-order/time-policy/admin", body);
}

export async function fetchHolidays(year: number): Promise<AnimalOrderHoliday[]> {
  const res = await authHttp.get<Result<AnimalOrderHoliday[]>>("/animal-order/holidays", {
    params: { year },
  });
  return res.data.data ?? [];
}

export async function createHoliday(body: AnimalOrderHoliday): Promise<AnimalOrderHoliday> {
  const res = await authHttp.post<Result<AnimalOrderHoliday>>("/animal-order/holidays", body);
  return res.data.data;
}

export async function deleteHoliday(id: number): Promise<void> {
  await authHttp.delete<Result<null>>(`/animal-order/holidays/${id}`);
}

export async function importHolidays(file: File): Promise<HolidayImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await authHttp.post<Result<HolidayImportResult>>(
    "/animal-order/holidays/import",
    fd,
    { timeout: 120_000 },
  );
  return res.data.data;
}

export async function syncHolidaysCdn(year?: number): Promise<HolidayImportResult> {
  const res = await authHttp.post<Result<HolidayImportResult>>(
    "/animal-order/holidays/sync-cdn",
    year != null ? { year } : {},
  );
  return res.data.data;
}
