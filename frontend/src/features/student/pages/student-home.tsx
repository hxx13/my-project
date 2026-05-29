import { useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  FileText,
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Plus,
  Key,
  Pin,
  X,
  Brain,
  Clock,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudentDashboard } from "../hooks/use-student-dashboard";
import { useStudentAiProfile } from "../hooks/use-student-ai-profile";
import type { AiPredictionRecord } from "../api/student.api";
import {
  StudentCard,
  Badge,
  Skeleton,
  ErrorRetry,
  EmptyState,
  RoomCard,
  Tooltip,
} from "../components/ui";

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** A single stat card in the summary row */
function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 rounded-[var(--student-radius-md)] bg-white p-4 shadow-[var(--student-card-shadow)]">
      <div className="text-2xl font-bold text-[var(--student-ink)]">
        {value}
      </div>
      <div className="mt-1 text-xs text-[var(--student-mute-foreground)]">
        {label}
      </div>
    </div>
  );
}

/** An action link in the Quick Actions sidebar card */
function QuickActionItem({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const button = (
    <button
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={cn(
        "flex items-center gap-2.5 w-full px-1 py-2 rounded-[var(--student-radius-sm)] text-left transition-colors",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:bg-[var(--student-mute)]",
      )}
    >
      <Icon
        aria-hidden="true"
        className="size-4 text-[var(--student-primary)] shrink-0"
        strokeWidth={1.5}
      />
      <span className="text-[13px] text-[var(--student-foreground)]">
        {label}
      </span>
    </button>
  );

  if (disabled) {
    return <Tooltip content="即将上线">{button}</Tooltip>;
  }
  return button;
}

/** Pattern for displaying an access-record type badge */
function recordTypeVariant(type: string): "success" | "warning" {
  if (type === "进入") return "success";
  return "warning";
}

/** Pattern for displaying a notification type colour dot */
function noticeTypeClass(type: string): string {
  if (type === "ARO") return "bg-[var(--student-error)]";
  return "bg-[var(--student-primary)]";
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function DashboardSkeleton() {
  return (
    <div className="flex gap-5 p-6 bg-[var(--student-canvas-soft)] min-h-full">
      {/* Left sidebar skeleton */}
      <aside className="w-[260px] shrink-0 flex flex-col gap-3">
        <StudentCard padding="lg">
          <div className="flex flex-col items-center gap-3">
            <Skeleton variant="circular" className="size-16" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-32" />
            <div className="flex gap-1.5 mt-1">
              <Skeleton className="h-5 w-14 rounded-[var(--student-radius-pill)]" />
              <Skeleton className="h-5 w-14 rounded-[var(--student-radius-pill)]" />
            </div>
          </div>
        </StudentCard>
        <StudentCard>
          <Skeleton className="h-4 w-16 mb-3" />
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </StudentCard>
      </aside>

      {/* Right content skeleton */}
      <main className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Stats skeleton */}
        <div className="flex gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-[var(--student-radius-md)] bg-white p-4 shadow-[var(--student-card-shadow)]"
            >
              <Skeleton className="h-8 w-12 mb-2" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>

        {/* Pinned rooms skeleton */}
        <StudentCard>
          <Skeleton className="h-4 w-28 mb-3" />
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                className="h-[108px] w-[200px]"
              />
            ))}
          </div>
        </StudentCard>

        {/* Records + Notifications skeleton */}
        <div className="flex gap-2.5">
          <div className="flex-1">
            <StudentCard>
              <Skeleton className="h-4 w-24 mb-3" />
              <div className="space-y-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-full" />
                ))}
              </div>
            </StudentCard>
          </div>
          <div className="flex-1">
            <StudentCard>
              <Skeleton className="h-4 w-16 mb-3" />
              <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-full" />
                ))}
              </div>
            </StudentCard>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function StudentHomePage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useStudentDashboard();
  const { data: aiData } = useStudentAiProfile();
  const [showAiModal, setShowAiModal] = useState(false);

  /* ---- loading ---- */
  if (isLoading) return <DashboardSkeleton />;

  /* ---- error ---- */
  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-full bg-[var(--student-canvas-soft)]">
        <ErrorRetry
          message={
            error instanceof Error ? error.message : "加载仪表盘数据失败"
          }
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  /* ---- empty / guard ---- */
  if (!data) return null;

  const { profile, stats, pinnedRooms, recentRecords, recentNotices } = data;

  /* ---- normal ---- */
  return (
    <div className="flex gap-5 p-6 bg-[var(--student-canvas-soft)] min-h-full">
      {/* ============================================================ */}
      {/* LEFT COLUMN — 260px fixed width                              */}
      {/* ============================================================ */}
      <aside className="w-[260px] shrink-0 flex flex-col gap-3">
        {/* 1. Personal Identity Card */}
        <StudentCard padding="lg">
          <div className="flex flex-col items-center text-center">
            {/* Avatar circle */}
            <div className="flex items-center justify-center size-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xl font-bold mb-3">
              {profile.name?.charAt(0) || "?"}
            </div>

            <h2 className="text-[16px] font-bold text-[var(--student-foreground)]">
              {profile.name || "--"}
            </h2>

            <p className="text-[12px] text-[var(--student-mute-foreground)] mt-0.5">
              {profile.roleLabel}
              {profile.projectGroupName
                ? ` · ${profile.projectGroupName}`
                : ""}
            </p>

            <div className="flex items-center gap-1.5 mt-3">
              <Badge variant="success">
                {profile.authStatus || "已授权"}
              </Badge>
              <Badge variant="profile">
                {profile.roleLabel || "学生"}
              </Badge>
            </div>
          </div>
        </StudentCard>

        {/* 2. Quick Actions */}
        <StudentCard>
          <h3 className="text-[13px] font-semibold text-[var(--student-foreground)] mb-2">
            快捷操作
          </h3>
          <div className="-mx-1">
            <QuickActionItem
              icon={Key}
              label="我的门禁权限"
              disabled
            />
            <QuickActionItem
              icon={FileText}
              label="出入记录"
              onClick={() => navigate("/student/records")}
            />
            <QuickActionItem
              icon={AlertTriangle}
              label="违规记录"
              disabled
            />
            <QuickActionItem
              icon={BarChart3}
              label="AI 个人画像"
              onClick={() => setShowAiModal(true)}
            />
          </div>
        </StudentCard>
      </aside>

      {/* ============================================================ */}
      {/* RIGHT COLUMN — flex-1                                        */}
      {/* ============================================================ */}
      <main className="flex-1 flex flex-col gap-3 min-w-0">
        {/* 3. Stats Summary Row */}
        <div className="flex gap-2.5">
          <StatCard label="今日进出次数" value={stats.todayAccessCount} />
          <StatCard label="违规记录" value={stats.violationCount} />
          <StatCard label="未读通知" value={stats.unreadNoticeCount} />
          <StatCard label="可进房间" value={stats.accessibleRoomCount} />
        </div>

        {/* 4. Pinned Rooms Section */}
        <StudentCard>
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-[var(--student-foreground)]">
              ⭐ 我的常用房间
            </h3>
            <button
              onClick={() => navigate("/student/rooms")}
              className="text-[12px] text-[var(--student-primary)] hover:underline transition-colors flex items-center gap-0.5"
            >
              管理置顶
              <ChevronRight className="size-3" />
            </button>
          </div>

          {/* Room cards + trailing "+" card */}
          {pinnedRooms.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {pinnedRooms.map((room) => (
                <RoomCard
                  key={room.roomId}
                  className="w-[200px]"
                  roomName={room.roomName}
                  floor={room.floor}
                  zone={room.zone}
                  occupantCount={room.occupantCount}
                  capacity={room.capacity}
                  status={room.status}
                  isPinned={room.isPinned}
                  onClick={() =>
                    navigate(`/student/rooms?highlight=${room.roomId}`)
                  }
                />
              ))}
              {/* "+" add card — always visible */}
              <button
                aria-label="添加房间"
                onClick={() => navigate("/student/rooms")}
                className="w-[200px] h-[108px] flex items-center justify-center rounded-[var(--student-radius-md)] border-2 border-dashed border-[var(--student-hairline)] bg-[var(--student-mute)]/30 hover:bg-[var(--student-mute)]/50 transition-colors"
              >
                <Plus
                  className="size-5 text-[var(--student-mute-foreground)]"
                  strokeWidth={1.5}
                />
              </button>
            </div>
          ) : (
            <EmptyState
              icon={Pin}
              title="暂无常用房间"
              description="前往房间管理页添加常用房间"
              actionLabel="前往房间管理"
              onAction={() => navigate("/student/rooms")}
            />
          )}
        </StudentCard>

        {/* 5. Recent Records + Notifications (dual column) */}
        <div className="flex gap-2.5">
          {/* Recent Access Records */}
          <div className="flex-1">
            <StudentCard>
              <h3 className="text-[13px] font-semibold text-[var(--student-foreground)] mb-3">
                📋 最近出入记录
              </h3>

              {recentRecords.length > 0 ? (
                <div className="space-y-2.5">
                  {recentRecords.slice(0, 5).map((record, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 text-[13px]"
                    >
                      <span className="text-[var(--student-mute-foreground)] text-[12px] whitespace-nowrap">
                        {record.time}
                      </span>
                      <Badge variant={recordTypeVariant(record.type)}>
                        {record.type}
                      </Badge>
                      <span className="text-[var(--student-body)] truncate">
                        {record.roomName}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-[13px] text-[var(--student-mute)] py-6">
                  暂无出入记录
                </p>
              )}

              <button
                onClick={() => navigate("/student/records")}
                className="mt-3 text-[12px] text-[var(--student-primary)] hover:underline transition-colors flex items-center gap-0.5"
              >
                查看全部
                <ChevronRight className="size-3" />
              </button>
            </StudentCard>
          </div>

          {/* Notifications */}
          <div className="flex-1">
            <StudentCard>
              <h3 className="text-[13px] font-semibold text-[var(--student-foreground)] mb-3">
                📢 通知公告
              </h3>

              {recentNotices.length > 0 ? (
                <div className="space-y-2.5">
                  {recentNotices.slice(0, 3).map((notice, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 text-[13px]"
                    >
                      <span
                        className={cn(
                          "size-2 rounded-full shrink-0",
                          noticeTypeClass(notice.type),
                        )}
                      />
                      <span className="text-[var(--student-body)] truncate flex-1">
                        {notice.title}
                      </span>
                      <span className="text-[var(--student-mute-foreground)] text-[12px] whitespace-nowrap">
                        {notice.publishDate}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-[13px] text-[var(--student-mute)] py-6">
                  暂无通知
                </p>
              )}

              <button
                onClick={() => navigate("/student/notifications")}
                className="mt-3 text-[12px] text-[var(--student-primary)] hover:underline transition-colors flex items-center gap-0.5"
              >
                查看全部
                <ChevronRight className="size-3" />
              </button>
            </StudentCard>
          </div>
        </div>
      </main>

      {/* ---- AI 个人画像 Modal ---- */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAiModal(false)}>
          <div
            className="w-full max-w-lg max-h-[75vh] overflow-hidden rounded-xl border border-[var(--student-hairline)] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--student-hairline)] px-5 py-3">
              <div className="flex items-center gap-2">
                <Brain className="size-5 text-indigo-500" />
                <h3 className="text-sm font-semibold text-[var(--student-ink)]">AI 个人画像</h3>
              </div>
              <button onClick={() => setShowAiModal(false)} className="rounded-md p-1 hover:bg-[var(--student-canvas-soft)]">
                <X className="size-4 text-[var(--student-mute)]" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {aiData && aiData.length > 0 ? (
                <div className="divide-y divide-[var(--student-hairline)]">
                  {aiData.map((item, i) => (
                    <div key={i} className="px-5 py-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-[var(--student-ink)]">{item.room_name}</span>
                        <span className="text-[11px] text-[var(--student-mute)]">访问 {item.visit_count ?? "?"} 次</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                        {item.median_duration_mins != null && (
                          <div className="flex items-center gap-1 text-[var(--student-mute)]">
                            <Clock className="size-3" />
                            平均停留 {item.median_duration_mins} 分钟
                          </div>
                        )}
                        {item.peak_entry_time && (
                          <div className="flex items-center gap-1 text-[var(--student-mute)]">
                            <TrendingUp className="size-3" />
                            高峰 {item.peak_entry_time}
                          </div>
                        )}
                        {item.predicted_exit_label && (
                          <div className="col-span-2 text-[var(--student-mute)]">
                            预计离开: <span className="font-medium text-[var(--student-ink)]">{item.predicted_exit_label}</span>
                          </div>
                        )}
                        {item.overtime_prob != null && item.overtime_prob > 0.5 && (
                          <div className="col-span-2">
                            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                              超时风险 {Math.round(item.overtime_prob * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-12 text-center text-[13px] text-[var(--student-mute)]">
                  <Brain className="size-10 mx-auto mb-3 text-[var(--student-mute)]/40" />
                  暂无 AI 行为预测数据
                  <p className="mt-1 text-[11px]">数据积累足够后系统将自动生成行为画像</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
