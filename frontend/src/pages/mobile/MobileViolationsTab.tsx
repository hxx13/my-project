/** 手机版 — 违规记录（独立页面，日期分组） */
import { useEffect, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  Clock,
  WifiOff,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fetchMobileViolations, type MobileViolationItem } from "@/api/domains/mobileStudent.api";
import { fetchStudentMobileViolations } from "@/api/domains/studentMobile.api";
import { prepareMobileNoticeHtml, MOBILE_NOTICE_BODY_CLASS } from "./mobileNoticePresentation";

const PAGE_SIZE = 20;

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
    const ts = (item as { eventTime?: string; time?: string }).eventTime || (item as { time?: string }).time || "";
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

const STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  processed: "已处理",
  appealing: "申诉中",
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#fef3c7", text: "#d97706" },
  processed: { bg: "#dcfce7", text: "#16a34a" },
  appealing: { bg: "#fee2e2", text: "#dc2626" },
};

export default function MobileViolationsTab({ token, jwtMode }: { token: string; jwtMode?: boolean }) {
  const [page, setPage] = useState(1);
  const [violations, setViolations] = useState<MobileViolationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!jwtMode && !token) return;
    setLoading(true);
    setError(null);
    (jwtMode
      ? fetchStudentMobileViolations(page, PAGE_SIZE)
      : fetchMobileViolations(token!, page, PAGE_SIZE)
    )
      .then((d) => {
        setViolations(d.data ?? []);
        setTotal(d.total ?? 0);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => setLoading(false));
  }, [token, jwtMode, page, reloadKey]);

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
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded-full px-4 py-1.5 text-xs font-medium text-white"
          style={{ background: "#ac1736" }}
        >
          重试
        </button>
      </div>
    );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="h-full overflow-y-auto flex flex-col px-3 pt-3 pb-4 relative z-10">
      <h2 className="text-[17px] font-extrabold px-1 mb-3" style={{ color: "#1e293b" }}>违规记录</h2>

      {violations.length > 0 ? (
        <div className="flex-1">
          {groupByDate(violations).map(({ date, items }) => (
            <div key={date} className="mb-1">
              <DateGroupHeader date={date} />
              {items.map((v) => (
                <div
                  key={v.id}
                  className="px-3 py-3 rounded-xl mb-1.5"
                  style={{ background: "rgba(254,242,242,0.7)", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="size-8 shrink-0 rounded-full bg-red-50 flex items-center justify-center mt-0.5">
                      <AlertTriangle className="size-4" style={{ color: "#ef4444" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12px] font-semibold" style={{ color: "#1e293b" }}>
                          {v.type || "违规通告"}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                          style={{
                            background: STATUS_STYLE[v.status]?.bg || "#f1f5f9",
                            color: STATUS_STYLE[v.status]?.text || "#64748b",
                          }}
                        >
                          {STATUS_LABEL[v.status] || v.status}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-0.5 text-[10px] mt-0.5" style={{ color: "#94a3b8" }}>
                        <Clock className="size-2.5" />
                        {formatTimeDisplay(v.time)}
                        {v.time?.length >= 10 ? (
                          <span className="ml-1">{v.time.slice(0, 10)}</span>
                        ) : null}
                      </span>
                      {v.contentHtml ? (
                        <div
                          className={`mt-2 text-[11px] ${MOBILE_NOTICE_BODY_CLASS}`}
                          style={{ color: "#475569" }}
                          dangerouslySetInnerHTML={{
                            __html: prepareMobileNoticeHtml(v.contentHtml),
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl py-16 text-center flex-1" style={{ background: "rgba(255,255,255,0.45)" }}>
          <AlertTriangle className="size-10 mx-auto mb-2" style={{ color: "#c8c9cc" }} />
          <p className="text-xs" style={{ color: "#969799" }}>暂无违规记录</p>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 py-3 mt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium disabled:opacity-30 active:scale-95 transition-transform"
            style={{ background: "rgba(255,255,255,0.6)", color: "#ac1736" }}
          >
            <ChevronLeft className="size-3.5" />
            上一页
          </button>
          <span className="text-[11px]" style={{ color: "#94a3b8" }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium disabled:opacity-30 active:scale-95 transition-transform"
            style={{ background: "rgba(255,255,255,0.6)", color: "#ac1736" }}
          >
            下一页
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
