import React, { useState, useMemo } from "react";
import {
  FileText,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Clock,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { useStudentAccessRecords } from "../hooks/use-student-access-records";
import { useStudentViolations } from "../hooks/use-student-violations";
import type { ViolationData } from "../api/student.api";
import {
  Tabs,
  Badge,
  StudentCard,
  EmptyState,
  ErrorRetry,
  Skeleton,
  StudentButton,
  StudentInput,
} from "../components/ui";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

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
  // "2026-05-29 14:30:00" -> "14:30"
  const match = iso.match(/[\sT](\d{2}:\d{2})/);
  return match ? match[1] : iso;
}

function formatDateDisplay(iso: string): string {
  if (!iso) return "";
  // "2026-05-29 14:30:00" -> "05-29"
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}-${match[3]}` : iso;
}

function groupByDate<T extends { eventTime?: string; time?: string }>(
  items: T[],
): { date: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const ts = (item as any).eventTime || (item as any).time || "";
    const dateKey = ts.substring(0, 10); // "2026-05-29"
    if (!map.has(dateKey)) map.set(dateKey, []);
    map.get(dateKey)!.push(item);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }));
}

const FETCH_SIZE = 200; // 一次拉取足够多，日期筛选后客户端分页
const PAGE_SIZE = 50;

/* ------------------------------------------------------------------ */
/*  Skeleton                                                            */
/* ------------------------------------------------------------------ */

function RecordsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-[var(--student-surface)] p-3"
        >
          <Skeleton variant="circular" className="size-8 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pagination                                                          */
/* ------------------------------------------------------------------ */

function Pagination({
  page,
  total,
  onPageChange,
}: {
  page: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= 0) return null;

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-[var(--student-mute)]">
      <span>共 {total} 条</span>
      <div className="flex items-center gap-2">
        <StudentButton
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" />
          上一页
        </StudentButton>
        <span className="text-[var(--student-foreground)] min-w-[3rem] text-center">
          {page} / {totalPages}
        </span>
        <StudentButton
          variant="ghost"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
          <ChevronRight className="size-4" />
        </StudentButton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Date Group Header                                                    */
/* ------------------------------------------------------------------ */

function DateGroupHeader({ date }: { date: string }) {
  const d = new Date(date);
  const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const label = `${date} ${weekDays[d.getDay()]}`;
  return (
    <div className="flex items-center gap-2 pt-2 first:pt-0">
      <div className="h-px flex-1 bg-[var(--student-hairline)]" />
      <span className="text-xs font-medium text-[var(--student-mute)] shrink-0">
        {label}
      </span>
      <div className="h-px flex-1 bg-[var(--student-hairline)]" />
    </div>
  );
}

/* ================================================================== */
/*  RecordsTab                                                          */
/* ================================================================== */

interface RecordEntry {
  id: string;
  eventTime: string;
  eventType: string;
  roomName: string;
  personName: string;
}

interface RecordsTabProps {
  records: RecordEntry[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  total: number;
  page: number;
  onPageChange: (page: number) => void;
}

function RecordsTab({
  records,
  isLoading,
  isError,
  onRetry,
  total,
  page,
  onPageChange,
}: RecordsTabProps) {
  if (isLoading) return <RecordsSkeleton />;
  if (isError) return <ErrorRetry message="加载出入记录失败" onRetry={onRetry} />;
  if (records.length === 0)
    return (
      <EmptyState
        icon={FileText}
        title="暂无出入记录"
        description="近期没有出入记录数据"
      />
    );

  const grouped = groupByDate(records);

  return (
    <div>
      <div className="space-y-1">
        {grouped.map(({ date, items }) => (
          <div key={date} className="space-y-0.5">
            <DateGroupHeader date={date} />
            {items.map((record) => (
              <div
                key={record.id}
                className="flex items-center gap-3 rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-[var(--student-surface)] px-4 py-2.5 hover:bg-[var(--student-canvas-soft)] transition-colors"
              >
                {/* Icon */}
                <div
                  className={cn(
                    "size-8 shrink-0 rounded-full flex items-center justify-center",
                    record.eventType === "进入"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-amber-50 text-amber-600",
                  )}
                >
                  {record.eventType === "进入" ? (
                    <LogIn className="size-4" />
                  ) : (
                    <LogOut className="size-4" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[var(--student-ink)]">
                      {record.eventType}
                    </span>
                    <Badge
                      variant={record.eventType === "进入" ? "success" : "warning"}
                      className="text-[11px]"
                    >
                      {record.eventType}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[12px] text-[var(--student-mute)]">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatTimeDisplay(record.eventTime)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" />
                      {record.roomName}
                    </span>
                  </div>
                </div>

                {/* Time on right */}
                <span className="text-[11px] text-[var(--student-mute)] shrink-0">
                  {formatDateDisplay(record.eventTime)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <Pagination page={page} total={total} onPageChange={onPageChange} />
    </div>
  );
}

/* ================================================================== */
/*  ViolationsTab                                                       */
/* ================================================================== */

const statusVariant: Record<ViolationData["status"], "warning" | "success" | "error"> = {
  pending: "warning",
  processed: "success",
  appealing: "error",
};

const statusLabel: Record<ViolationData["status"], string> = {
  pending: "待处理",
  processed: "已处理",
  appealing: "申诉中",
};

interface ViolationsTabProps {
  violations: ViolationData[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  total: number;
  page: number;
  onPageChange: (page: number) => void;
}

function ViolationsTab({
  violations,
  isLoading,
  isError,
  onRetry,
  total,
  page,
  onPageChange,
}: ViolationsTabProps) {
  if (isLoading) return <RecordsSkeleton count={5} />;
  if (isError) return <ErrorRetry message="加载违规记录失败" onRetry={onRetry} />;
  if (violations.length === 0)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="暂无违规记录"
        description="暂无违规记录，请继续保持"
      />
    );

  const grouped = groupByDate(violations);

  return (
    <div>
      <div className="space-y-1">
        {grouped.map(({ date, items }) => (
          <div key={date} className="space-y-0.5">
            <DateGroupHeader date={date} />
            {items.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-3 rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-[var(--student-surface)] px-4 py-2.5 hover:bg-[var(--student-canvas-soft)] transition-colors"
              >
                {/* Icon */}
                <div className="size-8 shrink-0 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
                  <AlertTriangle className="size-4" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[var(--student-ink)]">
                      {v.type}
                    </span>
                    <Badge variant={statusVariant[v.status]}>
                      {statusLabel[v.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[12px] text-[var(--student-mute)]">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatTimeDisplay(v.time)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" />
                      {v.roomName}
                    </span>
                    {v.doorName && (
                      <span className="text-[11px]">门禁: {v.doorName}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[var(--student-body)]">
                    {v.description}
                  </div>
                </div>

                {/* Penalty & date on right */}
                <div className="text-right shrink-0">
                  <div className="text-[13px] font-semibold text-[var(--student-error)]">
                    {v.penalty}
                  </div>
                  <div className="text-[11px] text-[var(--student-mute)]">
                    {formatDateDisplay(v.time)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <Pagination page={page} total={total} onPageChange={onPageChange} />
    </div>
  );
}

/* ================================================================== */
/*  Main Page                                                           */
/* ================================================================== */

export default function StudentRecordsPage({ embedded }: { embedded?: boolean }) {
  const [activeTab, setActiveTab] = useState<"records" | "violations">("records");
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(() => formatDate(new Date()));
  const [recordsPage, setRecordsPage] = useState(1);
  const [violationsPage, setViolationsPage] = useState(1);

  // Fetch all records (large batch), then filter + paginate client-side
  const recordsQuery = useStudentAccessRecords({
    page: 1,
    size: FETCH_SIZE,
  });

  const violationsQuery = useStudentViolations({
    page: violationsPage,
    size: PAGE_SIZE,
    startDate,
    endDate,
  });

  // Client-side date filter → client-side paginate
  const { filteredRecords, filteredTotal } = useMemo(() => {
    const all = recordsQuery.data?.data ?? [];
    const filtered = all.filter((r) => {
      if (startDate && r.eventTime < startDate) return false;
      if (endDate && r.eventTime > endDate + "T23:59:59") return false;
      return true;
    });
    const start = (recordsPage - 1) * PAGE_SIZE;
    const paged = filtered.slice(start, start + PAGE_SIZE);
    return { filteredRecords: paged, filteredTotal: filtered.length };
  }, [recordsQuery.data, startDate, endDate, recordsPage]);

  const violations = violationsQuery.data?.data ?? [];
  const violationsTotal = violationsQuery.data?.total ?? 0;

  const content = (
      <div className="min-h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
        <Tabs
          variant="pills"
          tabs={[
            { id: "records", label: "出入记录" },
            {
              id: "violations",
              label: violationsTotal > 0
                ? `违规记录 (${violationsTotal})`
                : "违规记录",
            },
          ]}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as "records" | "violations")}
        />
      </div>

      {/* Date filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 text-[13px] text-[var(--student-mute)]">
          <span>日期范围:</span>
          <StudentInput
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (activeTab === "records") setRecordsPage(1);
              else setViolationsPage(1);
            }}
          />
          <span>至</span>
          <StudentInput
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              if (activeTab === "records") setRecordsPage(1);
              else setViolationsPage(1);
            }}
          />
        </div>
      </div>

      {/* Content */}
      <StudentCard variant="bordered" padding="md">
        {activeTab === "records" ? (
          <RecordsTab
            records={filteredRecords}
            isLoading={recordsQuery.isLoading}
            isError={recordsQuery.isError}
            onRetry={() => recordsQuery.refetch()}
            total={filteredTotal}
            page={recordsPage}
            onPageChange={setRecordsPage}
          />
        ) : (
          <ViolationsTab
            violations={violations}
            isLoading={violationsQuery.isLoading}
            isError={violationsQuery.isError}
            onRetry={() => violationsQuery.refetch()}
            total={violationsTotal}
            page={violationsPage}
            onPageChange={setViolationsPage}
          />
        )}
      </StudentCard>
      </div>
  );

  if (embedded) return content;
  return <AdminPageShell>{content}</AdminPageShell>;
}
