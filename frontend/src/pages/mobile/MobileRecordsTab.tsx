/** 手机版 — 出入记录（独立页面，日期筛选 + 日期分组） */
import { useEffect, useState, useMemo } from "react";
import {
  Loader2,
  ClipboardList,
  LogIn,
  LogOut,
  Clock,
  MapPin,
  WifiOff,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fetchMobileAccessRecords, type MobileAccessRecord } from "@/api/domains/mobileStudent.api";
import { fetchStudentMobileAccessRecords } from "@/api/domains/studentMobile.api";

const PAGE_SIZE = 20;

/* ================================================================== */
/* Helpers                                                             */
/* ================================================================== */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDefaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return formatDate(d);
}

function formatTimeDisplay(iso: string): string {
  if (!iso) return "";
  const match = iso.match(/[\sT](\d{2}:\d{2})/);
  return match ? match[1] : iso;
}

function groupByDate<T extends { eventTime?: string; time?: string }>(
  items: T[],
): { date: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const ts = (item as any).eventTime || (item as any).time || "";
    const dateKey = ts.substring(0, 10);
    if (!map.has(dateKey)) map.set(dateKey, []);
    map.get(dateKey)!.push(item);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }));
}

const WEEK_DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function DateGroupHeader({ date }: { date: string }) {
  const d = new Date(date);
  const label = `${date} ${WEEK_DAYS[d.getDay()]}`;
  return (
    <div className="flex items-center gap-2 pt-3 first:pt-0 pb-1">
      <div className="h-px flex-1" style={{ background: "rgba(30,55,90,0.06)" }} />
      <span className="text-[11px] font-medium shrink-0" style={{ color: "#94a3b8" }}>
        {label}
      </span>
      <div className="h-px flex-1" style={{ background: "rgba(30,55,90,0.06)" }} />
    </div>
  );
}

/* ================================================================== */
export default function MobileRecordsTab({ token, jwtMode }: { token: string; jwtMode?: boolean }) {
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(() => formatDate(new Date()));
  const [page, setPage] = useState(1);

  const [allRecords, setAllRecords] = useState<MobileAccessRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jwtMode && !token) return;
    setLoading(true);
    setError(null);
    (jwtMode
      ? fetchStudentMobileAccessRecords(1, 200)
      : fetchMobileAccessRecords(token!, 1, 200)
    )
      .then((d) => {
        setAllRecords(d.data ?? []);
        setTotal(d.total ?? 0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [token, jwtMode]);

  const filteredRecords = useMemo(() => {
    return allRecords.filter((r) => {
      if (startDate && r.eventTime < startDate) return false;
      if (endDate && r.eventTime > endDate + "T23:59:59") return false;
      return true;
    });
  }, [allRecords, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const pagedRecords = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRecords.slice(start, start + PAGE_SIZE);
  }, [filteredRecords, page]);

  function handleDateChange(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  if (loading)
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" style={{ color: "#94a3b8" }} />
      </div>
    );

  if (error)
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-3">
        <WifiOff className="size-8" style={{ color: "#c8c9cc" }} />
        <p className="text-xs" style={{ color: "#969799" }}>{error}</p>
        <button onClick={() => window.location.reload()} className="rounded-full px-4 py-1.5 text-xs font-medium text-white" style={{ background: "#ac1736" }}>重试</button>
      </div>
    );

  return (
    <div className="h-full overflow-y-auto flex flex-col px-3 pt-3 pb-4">
      <h2 className="text-[17px] font-extrabold px-1 mb-3" style={{ color: "#1e293b" }}>出入记录</h2>

      {/* Date filter */}
      <div className="flex items-center gap-2 mb-3 px-1" style={{ color: "#94a3b8" }}>
        <span className="text-[11px] shrink-0">日期:</span>
        <input type="date" value={startDate} onChange={(e) => handleDateChange(setStartDate, e.target.value)}
          className="flex-1 rounded-lg px-2 py-1.5 text-[12px] border-0 outline-none"
          style={{ background: "rgba(255,255,255,0.7)", color: "#1e293b", border: "1px solid rgba(30,55,90,0.06)" }} />
        <span className="text-[11px] shrink-0">至</span>
        <input type="date" value={endDate} onChange={(e) => handleDateChange(setEndDate, e.target.value)}
          className="flex-1 rounded-lg px-2 py-1.5 text-[12px] border-0 outline-none"
          style={{ background: "rgba(255,255,255,0.7)", color: "#1e293b", border: "1px solid rgba(30,55,90,0.06)" }} />
      </div>

      {pagedRecords.length > 0 ? (
        <div className="flex-1">
          {groupByDate(pagedRecords).map(({ date, items }) => (
            <div key={date} className="mb-1">
              <DateGroupHeader date={date} />
              {items.map((rec, idx) => (
                <div key={rec.id || idx} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-1"
                  style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(30,55,90,0.04)" }}>
                  <div className="size-8 shrink-0 rounded-full flex items-center justify-center"
                    style={{ background: rec.eventType === "进入" ? "#dcfce7" : "#fef3c7", color: rec.eventType === "进入" ? "#16a34a" : "#d97706" }}>
                    {rec.eventType === "进入" ? <LogIn className="size-4" /> : <LogOut className="size-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold" style={{ color: "#1e293b" }}>{rec.eventType}</span>
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                        style={{ background: rec.eventType === "进入" ? "#dcfce7" : "#fef3c7", color: rec.eventType === "进入" ? "#16a34a" : "#d97706" }}>{rec.eventType}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: "#94a3b8" }}><Clock className="size-2.5" />{formatTimeDisplay(rec.eventTime)}</span>
                      <span className="inline-flex items-center gap-0.5 text-[10px] truncate" style={{ color: "#94a3b8" }}><MapPin className="size-2.5" />{rec.roomName}</span>
                    </div>
                  </div>
                  <span className="text-[10px] shrink-0" style={{ color: "#94a3b8" }}>{rec.eventTime?.slice(5, 10) ?? ""}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl py-16 text-center flex-1" style={{ background: "rgba(255,255,255,0.45)" }}>
          <ClipboardList className="size-10 mx-auto mb-2" style={{ color: "#c8c9cc" }} />
          <p className="text-xs" style={{ color: "#969799" }}>暂无出入记录</p>
        </div>
      )}

      {filteredRecords.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 py-3 mt-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium disabled:opacity-30 active:scale-95 transition-transform"
            style={{ background: "rgba(255,255,255,0.6)", color: "#ac1736" }}>
            <ChevronLeft className="size-3.5" />上一页</button>
          <span className="text-[11px]" style={{ color: "#94a3b8" }}>{page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium disabled:opacity-30 active:scale-95 transition-transform"
            style={{ background: "rgba(255,255,255,0.6)", color: "#ac1736" }}>
            下一页<ChevronRight className="size-3.5" /></button>
        </div>
      )}
    </div>
  );
}
