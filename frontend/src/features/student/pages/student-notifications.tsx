import { useState, useCallback, useMemo } from "react";
import { Bell, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudentNotifications, useMarkNotificationRead } from "../hooks/use-student-notifications";
import type { FetchNotificationsParams, NotificationData } from "../api/student.api";
import {
  NotificationItem,
  Skeleton,
  EmptyState,
  ErrorRetry,
} from "../components/ui";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 25;

const TYPE_FILTERS: Array<{ id: string; label: string }> = [
  { id: "ALL", label: "全部" },
  { id: "ARO", label: "ARO 官方" },
  { id: "PLATFORM", label: "平台公告" },
];

/* ------------------------------------------------------------------ */
/*  FilterPill                                                         */
/* ------------------------------------------------------------------ */

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-[var(--student-primary)] text-white shadow-sm"
          : "bg-white text-[var(--student-mute-foreground)] hover:bg-[var(--student-primary-soft)]/20",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function NotificationsSkeleton() {
  return (
    <div className="p-6 bg-[var(--student-canvas-soft)] min-h-full">
      {/* Filter pills skeleton */}
      <div className="flex items-center gap-2 mb-4">
        <Skeleton variant="rectangular" className="h-8 w-16 rounded-full" />
        <Skeleton variant="rectangular" className="h-8 w-24 rounded-full" />
        <Skeleton variant="rectangular" className="h-8 w-24 rounded-full" />
        <Skeleton className="ml-auto h-4 w-36" />
      </div>

      {/* Notification items skeleton */}
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-[10px] bg-white px-4 py-3"
          >
            <Skeleton variant="circular" className="mt-[6px] h-2 w-2 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton variant="rectangular" className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function StudentNotificationsPage() {
  /* ---- Local state ---- */
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  /* ---- Query params ---- */
  const apiType = typeFilter === "ALL" ? undefined : typeFilter;

  const params = useMemo<FetchNotificationsParams>(() => {
    const p: FetchNotificationsParams = { page, size: PAGE_SIZE };
    if (apiType) p.type = apiType;
    return p;
  }, [apiType, page]);

  const { data, isLoading, isError, error, refetch } =
    useStudentNotifications(params);

  const markMutation = useMarkNotificationRead();

  /* ---- Derived data ---- */
  const notifications = data?.data ?? [];
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /* ---- Handlers ---- */
  const handleTypeChange = useCallback((typeId: string) => {
    setTypeFilter(typeId);
    setPage(1);
  }, []);

  const handleClick = useCallback(
    (notification: NotificationData) => {
      if (!notification.isRead) {
        markMutation.mutate(notification.id);
      }
    },
    [markMutation.mutate],
  );

  /* ---- Loading state ---- */
  if (isLoading) {
    return <NotificationsSkeleton />;
  }

  /* ---- Error state ---- */
  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-full bg-[var(--student-canvas-soft)]">
        <ErrorRetry
          message={
            error instanceof Error ? error.message : "加载通知失败"
          }
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  /* ---- Normal render ---- */
  return (
    <div className="p-6 bg-[var(--student-canvas-soft)] min-h-full">
      {/* Filter pills + summary */}
      <div className="flex items-center gap-2 mb-4">
        {TYPE_FILTERS.map((f) => (
          <FilterPill
            key={f.id}
            active={typeFilter === f.id}
            onClick={() => handleTypeChange(f.id)}
          >
            {f.label}
          </FilterPill>
        ))}
        <span className="ml-auto text-xs text-[var(--student-mute-foreground)]">
          共 {total} 条，{unreadCount} 条未读
        </span>
      </div>

      {/* Empty state */}
      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="暂无通知"
          description="当前没有符合条件的通知消息"
        />
      ) : (
        <>
          {/* Notification list */}
          <div className="flex flex-col gap-1.5">
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                title={n.title}
                summary={n.summary}
                type={n.type}
                publishDate={n.publishDate}
                isRead={n.isRead}
                onClick={() => handleClick(n)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={cn(
                  "inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-[var(--student-radius-md)] transition-colors",
                  page <= 1
                    ? "text-[var(--student-mute)] cursor-not-allowed"
                    : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft-2)]",
                )}
              >
                <ChevronLeft className="size-4" />
                上一页
              </button>
              <span className="text-sm text-[var(--student-body)]">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={cn(
                  "inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-[var(--student-radius-md)] transition-colors",
                  page >= totalPages
                    ? "text-[var(--student-mute)] cursor-not-allowed"
                    : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft-2)]",
                )}
              >
                下一页
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
