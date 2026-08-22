import { useState, useCallback, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bell, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { prepareAnnouncementHtml } from "@/utils/announcementHtml";
import { useStudentNotifications, useMarkNotificationRead } from "../hooks/use-student-notifications";
import {
  markObligationDelivered,
  type FetchNotificationsParams,
  type NotificationData,
} from "../api/student.api";
import {
  NotificationItem,
  Skeleton,
  EmptyState,
  ErrorRetry,
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui";

function isInternalAppPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

function isViolationObligationNotice(n: NotificationData): boolean {
  return String(n.bizType || "").toUpperCase() === "STUDENT_VIOLATION"
    || Boolean(n.obligationId)
    || Boolean(n.sourceUrl?.includes("/student/obligations"));
}

function resolveObligationCta(n: NotificationData): { path: string; label: string } | null {
  if (!isViolationObligationNotice(n)) return null;
  if (n.sourceUrl && isInternalAppPath(n.sourceUrl)) {
    return { path: n.sourceUrl, label: "去完成确认" };
  }
  if (n.obligationId && n.obligationId > 0) {
    return { path: `/student/obligations?focus=${n.obligationId}`, label: "去完成确认" };
  }
  return { path: "/student/obligations", label: "去完成确认" };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 25;

const NOTIFICATION_TYPE_CONFIG: Record<string, { label: string; textClass: string; bgClass: string }> = {
  ARO: { label: "ARO 官方", textClass: "text-[var(--student-error)]", bgClass: "bg-[var(--student-error-soft)]" },
  PLATFORM: { label: "平台通知", textClass: "text-[var(--student-accent-telemetry)]", bgClass: "bg-[var(--student-accent-telemetry-soft)]" },
  WORK_ORDER: { label: "工单", textClass: "text-[var(--student-primary)]", bgClass: "bg-[var(--student-primary-soft)]" },
};

const TYPE_FILTERS: Array<{ id: string; label: string }> = [
  { id: "ALL", label: "全部" },
  { id: "ARO", label: "ARO 官方" },
  { id: "PLATFORM", label: "平台公告" },
  { id: "WORK_ORDER", label: "工单通知" },
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
          : "bg-[var(--student-surface)] text-[var(--student-mute-foreground)] hover:bg-[var(--student-primary-soft)]/20",
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
    <div className="p-6 min-h-full">
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
            className="flex items-start gap-3 rounded-[10px] bg-[var(--student-surface)] px-4 py-3"
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
  const [selectedNotification, setSelectedNotification] = useState<NotificationData | null>(null);

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
      setSelectedNotification(notification);
      if (!notification.isRead) {
        markMutation.mutate(notification.id);
      }
    },
    [markMutation.mutate],
  );

  useEffect(() => {
    const oid = selectedNotification?.obligationId;
    if (oid && oid > 0) {
      void markObligationDelivered(oid).catch(() => undefined);
    }
  }, [selectedNotification?.obligationId]);

  /* ---- Loading state ---- */
  if (isLoading) {
    return <NotificationsSkeleton />;
  }

  /* ---- Error state ---- */
  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-full">
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
    <AdminPageShell>
    <div className="min-h-full">
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

      {/* Notification detail dialog */}
      <Dialog
        open={selectedNotification !== null}
        onOpenChange={(open) => { if (!open) setSelectedNotification(null); }}
      >
        {selectedNotification && (
          <>
            <DialogHeader>
              <DialogTitle>{selectedNotification.title}</DialogTitle>
              <DialogDescription>
                <span className={cn(
                  "inline-flex items-center rounded-[var(--student-radius-full)] px-2 py-px text-[11px] font-medium",
                  NOTIFICATION_TYPE_CONFIG[selectedNotification.type as keyof typeof NOTIFICATION_TYPE_CONFIG]?.textClass ?? "text-[var(--student-mute)]",
                  NOTIFICATION_TYPE_CONFIG[selectedNotification.type as keyof typeof NOTIFICATION_TYPE_CONFIG]?.bgClass ?? "bg-[var(--student-canvas-soft)]",
                )}>
                  {NOTIFICATION_TYPE_CONFIG[selectedNotification.type as keyof typeof NOTIFICATION_TYPE_CONFIG]?.label ?? selectedNotification.type}
                </span>
                <span className="ml-2 text-xs text-[var(--student-mute)]">{selectedNotification.publishDate}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-[80px] flex-1 overflow-y-auto text-sm leading-relaxed text-[var(--student-body)]">
              {(selectedNotification.content || selectedNotification.summary) ? (
                <div
                  className="rich-text-content"
                  dangerouslySetInnerHTML={{
                    __html: prepareAnnouncementHtml(
                      selectedNotification.content || selectedNotification.summary || "",
                    ),
                  }}
                />
              ) : (
                <p className="text-center py-8 text-[var(--student-mute)]">暂无详细内容</p>
              )}
            </div>
            {(() => {
              const cta = resolveObligationCta(selectedNotification);
              if (cta) {
                return (
                  <DialogFooter>
                    <Link
                      to={cta.path}
                      className="inline-flex items-center gap-1.5 rounded-[var(--student-radius-md)] bg-[var(--student-primary)] px-3 py-2 text-[13px] font-medium text-white"
                      onClick={() => setSelectedNotification(null)}
                    >
                      {cta.label}
                    </Link>
                  </DialogFooter>
                );
              }
              if (selectedNotification.sourceUrl) {
                const url = selectedNotification.sourceUrl;
                if (isInternalAppPath(url)) {
                  return (
                    <DialogFooter>
                      <Link
                        to={url}
                        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--student-primary)] hover:underline"
                        onClick={() => setSelectedNotification(null)}
                      >
                        <ExternalLink className="size-3.5" />
                        查看原文
                      </Link>
                    </DialogFooter>
                  );
                }
                return (
                  <DialogFooter>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--student-primary)] hover:underline"
                    >
                      <ExternalLink className="size-3.5" />
                      查看原文
                    </a>
                  </DialogFooter>
                );
              }
              return null;
            })()}
          </>
        )}
      </Dialog>
    </div>
    </AdminPageShell>
  );
}
