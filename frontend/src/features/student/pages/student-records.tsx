import React, { useState, useMemo } from "react";
import {
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  StudentSelect,
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

const PAGE_SIZE = 20;

const thClass =
  "px-4 py-3 text-left text-[13px] font-medium text-[var(--student-body)]";
const tdClass = "px-4 py-3 text-[13px] text-[var(--student-ink)]";

function handleRowKeyDown(e: React.KeyboardEvent, handler: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    handler();
  }
}

/* ------------------------------------------------------------------ */
/*  Shared Table Skeleton                                               */
/* ------------------------------------------------------------------ */

function TableSkeleton({ cols = 5, rows = 6 }: { cols?: number; rows?: number }) {
  return (
    <div className="space-y-0 border border-[var(--student-border)] rounded-[var(--student-radius-md)]">
      <div
        className="flex gap-4 px-4 py-3 bg-[var(--student-canvas-soft-2)]"
      >
        <Skeleton className="h-4 w-4" variant="circular" />
        {Array.from({ length: cols - 1 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 px-4 py-3 border-b border-[var(--student-hairline)]"
        >
          <Skeleton className="h-4 w-4" variant="circular" />
          {Array.from({ length: cols - 1 }).map((_, j) => (
            <Skeleton key={j} className="h-4 w-20" />
          ))}
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
      <span>共 {total} 条记录</span>

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
/*  Record entry type (subset of StudentAccessRecord for display)       */
/* ------------------------------------------------------------------ */

interface RecordEntry {
  id: string;
  eventTime: string;
  eventType: string;
  roomName: string;
  personName: string;
}

/* ================================================================== */
/*  RecordsTab (module-scope)                                           */
/* ================================================================== */

interface RecordsTabProps {
  records: RecordEntry[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  total: number;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}

function RecordsTab({
  records,
  isLoading,
  isError,
  onRetry,
  total,
  expandedIds,
  onToggleExpand,
  page,
  onPageChange,
}: RecordsTabProps) {
  if (isLoading) return <TableSkeleton rows={6} />;

  if (isError) {
    return (
      <ErrorRetry message="加载出入记录失败" onRetry={onRetry} />
    );
  }

  if (records.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="暂无出入记录"
        description="近期没有出入记录数据"
      />
    );
  }

  return (
    <div>
      <div className="w-full overflow-auto rounded-[var(--student-radius-md)] border border-[var(--student-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--student-canvas-soft-2)]">
              <th className={cn(thClass, "w-10")} />
              <th className={thClass}>时间</th>
              <th className={thClass}>类型</th>
              <th className={thClass}>房间</th>
              <th className={thClass}>门禁点/人员</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const expanded = expandedIds.has(record.id);

              return (
                <React.Fragment key={record.id}>
                  <tr
                    tabIndex={0}
                    role="button"
                    aria-expanded={expanded}
                    className={cn(
                      "border-b border-[var(--student-hairline)] transition-colors hover:bg-[var(--student-canvas-soft)] cursor-pointer",
                      expanded && "bg-[var(--student-canvas-soft)]",
                    )}
                    onClick={() => onToggleExpand(record.id)}
                    onKeyDown={(e) =>
                      handleRowKeyDown(e, () => onToggleExpand(record.id))
                    }
                  >
                    <td className={cn(tdClass, "w-10")}>
                      {expanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </td>
                    <td className={tdClass}>{record.eventTime}</td>
                    <td className={tdClass}>
                      <Badge
                        variant={
                          record.eventType === "进入" ? "success" : "warning"
                        }
                      >
                        {record.eventType}
                      </Badge>
                    </td>
                    <td className={tdClass}>{record.roomName}</td>
                    <td className={tdClass}>{record.personName}</td>
                  </tr>

                  {expanded && (
                    <tr
                      key={`${record.id}-detail`}
                      className="border-b border-[var(--student-hairline)] bg-[var(--student-canvas-soft-2)]"
                    >
                      <td colSpan={5} className="px-4 py-3">
                        <div className="grid grid-cols-4 gap-4 text-[13px] text-[var(--student-ink)]">
                          <div>
                            <span className="text-[var(--student-mute)]">
                              授权方式
                            </span>
                            <br />
                            <span>刷卡</span>
                          </div>
                          <div>
                            <span className="text-[var(--student-mute)]">
                              设备编号
                            </span>
                            <br />
                            <span>N/A</span>
                          </div>
                          <div>
                            <span className="text-[var(--student-mute)]">
                              在室时长
                            </span>
                            <br />
                            <span>待统计</span>
                          </div>
                          <div>
                            <span className="text-[var(--student-mute)]">
                              记录 ID
                            </span>
                            <br />
                            <span className="font-mono text-xs">
                              {record.id}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} onPageChange={onPageChange} />
    </div>
  );
}

/* ================================================================== */
/*  ViolationsTab (module-scope)                                        */
/* ================================================================== */

const statusVariant: Record<
  ViolationData["status"],
  "warning" | "success" | "error"
> = {
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
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}

function ViolationsTab({
  violations,
  isLoading,
  isError,
  onRetry,
  total,
  expandedIds,
  onToggleExpand,
  page,
  onPageChange,
}: ViolationsTabProps) {
  if (isLoading) return <TableSkeleton cols={6} rows={6} />;

  if (isError) {
    return (
      <ErrorRetry message="加载违规记录失败" onRetry={onRetry} />
    );
  }

  if (violations.length === 0) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="暂无违规记录"
        description="暂无违规记录，请继续保持"
      />
    );
  }

  return (
    <div>
      <div className="w-full overflow-auto rounded-[var(--student-radius-md)] border border-[var(--student-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--student-canvas-soft-2)]">
              <th className={cn(thClass, "w-10")} />
              <th className={thClass}>时间</th>
              <th className={thClass}>类型</th>
              <th className={thClass}>房间</th>
              <th className={thClass}>扣分</th>
              <th className={thClass}>状态</th>
            </tr>
          </thead>
          <tbody>
            {violations.map((v) => {
              const expanded = expandedIds.has(v.id);

              return (
                <React.Fragment key={v.id}>
                  <tr
                    tabIndex={0}
                    role="button"
                    aria-expanded={expanded}
                    className={cn(
                      "border-b border-[var(--student-hairline)] transition-colors hover:bg-[var(--student-canvas-soft)] cursor-pointer",
                      expanded && "bg-[var(--student-canvas-soft)]",
                    )}
                    onClick={() => onToggleExpand(v.id)}
                    onKeyDown={(e) =>
                      handleRowKeyDown(e, () => onToggleExpand(v.id))
                    }
                  >
                    <td className={cn(tdClass, "w-10")}>
                      {expanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </td>
                    <td className={tdClass}>{v.time}</td>
                    <td className={tdClass}>{v.type}</td>
                    <td className={tdClass}>{v.roomName}</td>
                    <td className={tdClass}>
                      <span className="text-[var(--student-error)] font-medium">
                        {v.penalty}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <Badge variant={statusVariant[v.status]}>
                        {statusLabel[v.status]}
                      </Badge>
                    </td>
                  </tr>

                  {expanded && (
                    <tr
                      key={`${v.id}-detail`}
                      className="border-b border-[var(--student-hairline)] bg-[var(--student-canvas-soft-2)]"
                    >
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid grid-cols-4 gap-4 text-[13px] text-[var(--student-ink)]">
                          <div>
                            <span className="text-[var(--student-mute)]">
                              违规描述
                            </span>
                            <br />
                            <span>{v.description}</span>
                          </div>
                          <div>
                            <span className="text-[var(--student-mute)]">
                              处理人
                            </span>
                            <br />
                            <span>{v.processedBy || "--"}</span>
                          </div>
                          <div>
                            <span className="text-[var(--student-mute)]">
                              处理时间
                            </span>
                            <br />
                            <span>{v.processedTime || "--"}</span>
                          </div>
                          <div>
                            <span className="text-[var(--student-mute)]">
                              门禁点
                            </span>
                            <br />
                            <span>{v.doorName}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} onPageChange={onPageChange} />
    </div>
  );
}

/* ================================================================== */
/*  Main Page                                                           */
/* ================================================================== */

export default function StudentRecordsPage() {
  const [activeTab, setActiveTab] = useState<"records" | "violations">(
    "records",
  );

  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(() => formatDate(new Date()));
  const [typeFilter, setTypeFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");

  const [recordsPage, setRecordsPage] = useState(1);
  const [violationsPage, setViolationsPage] = useState(1);

  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(
    new Set(),
  );
  const [expandedViolations, setExpandedViolations] = useState<Set<string>>(
    new Set(),
  );

  const recordsQuery = useStudentAccessRecords({
    page: recordsPage,
    size: PAGE_SIZE,
  });

  const violationsQuery = useStudentViolations({
    page: violationsPage,
    size: PAGE_SIZE,
    startDate,
    endDate,
  });

  const filteredRecords = useMemo(() => {
    const data = recordsQuery.data?.data ?? [];
    return data.filter((r) => {
      if (typeFilter && r.eventType !== typeFilter) return false;
      if (roomFilter && !r.roomName.includes(roomFilter)) return false;
      if (startDate && r.eventTime < startDate) return false;
      if (endDate && r.eventTime > endDate + "T23:59:59") return false;
      return true;
    });
  }, [recordsQuery.data, typeFilter, roomFilter, startDate, endDate]);

  const violationsTotal = violationsQuery.data?.total ?? 0;

  const roomOptions = useMemo(() => {
    const names = new Set(
      (recordsQuery.data?.data ?? []).map((r) => r.roomName).filter(Boolean),
    );
    return Array.from(names).map((n) => ({ value: n, label: n }));
  }, [recordsQuery.data]);

  function toggleRecordExpand(id: string) {
    setExpandedRecords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleViolationExpand(id: string) {
    setExpandedViolations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-6 bg-[var(--student-canvas-soft)] min-h-full">
      <Tabs
        variant="pills"
        tabs={[
          { id: "records", label: "出入记录" },
          {
            id: "violations",
            label:
              violationsTotal > 0
                ? `⚠️ 违规记录 (${violationsTotal})`
                : "⚠️ 违规记录",
          },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as "records" | "violations")}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mt-4 mb-4">
        <div className="w-36">
          <StudentInput
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="w-36">
          <StudentInput
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {activeTab === "records" && (
          <div className="w-28">
            <StudentSelect
              placeholder="进出类型"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[
                { value: "进入", label: "进入" },
                { value: "离开", label: "离开" },
              ]}
            />
          </div>
        )}

        <div className="w-28">
          <StudentSelect
            placeholder="房间筛选"
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            options={roomOptions}
          />
        </div>

        <StudentButton
          variant="secondary"
          size="sm"
          onClick={() => {
            if (activeTab === "records") {
              setRecordsPage(1);
            } else {
              setViolationsPage(1);
              violationsQuery.refetch();
            }
          }}
        >
          查询
        </StudentButton>
      </div>

      {/* Content area */}
      <StudentCard variant="bordered" padding="md">
        {activeTab === "records" ? (
          <RecordsTab
            records={filteredRecords}
            isLoading={recordsQuery.isLoading}
            isError={recordsQuery.isError}
            onRetry={() => recordsQuery.refetch()}
            total={recordsQuery.data?.total ?? 0}
            expandedIds={expandedRecords}
            onToggleExpand={toggleRecordExpand}
            page={recordsPage}
            onPageChange={setRecordsPage}
          />
        ) : (
          <ViolationsTab
            violations={violationsQuery.data?.data ?? []}
            isLoading={violationsQuery.isLoading}
            isError={violationsQuery.isError}
            onRetry={() => violationsQuery.refetch()}
            total={violationsTotal}
            expandedIds={expandedViolations}
            onToggleExpand={toggleViolationExpand}
            page={violationsPage}
            onPageChange={setViolationsPage}
          />
        )}
      </StudentCard>
    </div>
  );
}
