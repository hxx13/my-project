import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
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
  Mail,
  Phone,
  MapPin,
  Star,
  ShieldCheck,
  ShieldAlert,
  User,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useStudentDashboard } from "../hooks/use-student-dashboard";
import { useStudentAiProfile } from "../hooks/use-student-ai-profile";
import { StudentActivityDashboard } from "../components/student-activity-dashboard";
import { fetchRooms } from "../api/student.api";
import type { AiPredictionRecord } from "../api/student.api";
import {
  StudentCard,
  Badge,
  Skeleton,
  ErrorRetry,
  EmptyState,
  RoomCard,
  Avatar,
} from "../components/ui";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** Animated stat card — number scrolls from 0 to value on mount */
function StatCard({ label, value }: { label: string; value: number }) {
  const numRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = numRef.current;
    if (!el) return;
    const target = value;
    const duration = 1000;
    const start = performance.now();
    let raf: number;
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuad
      const eased = 1 - (1 - progress) * (1 - progress);
      el.textContent = String(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div className="stat-card flex-1 rounded-[var(--student-radius-md)] bg-white p-4 shadow-[var(--student-card-shadow)]">
      <div className="text-2xl font-bold text-[var(--student-ink)]">
        <span ref={numRef}>0</span>
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
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 w-full px-2 py-2.5 rounded-[var(--student-radius-sm)] text-left",
        "transition-all duration-150",
        "cursor-pointer",
        "hover:bg-[var(--student-primary-soft)] hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--student-primary)]/40",
        "active:scale-[0.98]",
      )}
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--student-primary-soft)]">
        <Icon
          aria-hidden="true"
          className="size-3.5 text-[var(--student-primary)]"
          strokeWidth={1.5}
        />
      </span>
      <span className="text-[13px] font-medium text-[var(--student-ink)]">
        {label}
      </span>
    </button>
  );
}

/** Pattern for displaying an access-record type badge */
function recordTypeVariant(type: string): "success" | "warning" {
  if (type === "进入") return "success";
  return "warning";
}

/** Gender label */
function genderLabel(g?: number): string {
  if (g === 1) return "男";
  if (g === 2) return "女";
  return "未知";
}

/** Simple level from EXP — sqrt(exp/50) floor */
function levelFromExp(exp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, exp) / 50)));
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

  // 常用房间：ARO API 匹配 + 手动收藏（与 /student/rooms 页同源）
  const { data: myRoomsData } = useQuery({
    queryKey: ["student", "rooms", { pinned: "1" }],
    queryFn: () => fetchRooms({ pinned: "1", page: 1, size: 20 }),
    staleTime: 60_000,
  });
  const aroRooms = myRoomsData?.data ?? [];
  // 拆分为收藏和常用
  const { pinnedRoomsHome, frequentRoomsHome } = useMemo(() => {
    const pinned: typeof aroRooms = [];
    const freq: typeof aroRooms = [];
    for (const r of aroRooms) {
      if ((r as any).isPinned) pinned.push(r);
      else freq.push(r);
    }
    return { pinnedRoomsHome: pinned, frequentRoomsHome: freq };
  }, [aroRooms]);
  const maxShow = 6;
  const pageRef = useRef<HTMLDivElement>(null);

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

  const { profile, stats, recentRecords, recentNotices } = data;

  /* ---- normal ---- */
  return (
    <div ref={pageRef} className="flex gap-5 p-6 bg-[var(--student-canvas-soft)] min-h-full">
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInLeft {
          from { opacity: 0; transform: translateX(-16px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .stat-card { animation: fadeInUp 0.4s ease-out both; }
        .stat-card:nth-child(2) { animation-delay: 0.08s; }
        .stat-card:nth-child(3) { animation-delay: 0.16s; }
        .stat-card:nth-child(4) { animation-delay: 0.24s; }
        .pinned-room-item { animation: fadeInUp 0.35s ease-out both; }
        .left-panel { animation: fadeInLeft 0.35s ease-out both; }
        .left-panel:nth-child(2) { animation-delay: 0.1s; }
        .right-card { animation: fadeInUp 0.35s ease-out both; }
        .right-card:nth-child(2) { animation-delay: 0.08s; }
        .right-card:nth-child(3) { animation-delay: 0.16s; }
        @media (prefers-reduced-motion: reduce) {
          .stat-card, .pinned-room-item, .left-panel, .right-card { animation: none !important; opacity: 1 !important; }
        }
      `}</style>
      {/* ============================================================ */}
      {/* LEFT COLUMN — 260px fixed width                              */}
      {/* ============================================================ */}
      <aside className="w-[260px] shrink-0 flex flex-col gap-3">
        {/* 1. Personal Identity Card — expanded */}
        <StudentCard padding="lg" className="left-panel">
          <div className="flex flex-col items-center text-center">
            {/* Avatar — real head image with initials fallback */}
            <Avatar
              src={profile.head ? resolvePersonnelAvatarUrl(profile.head) : undefined}
              name={profile.name || ""}
              size="lg"
              className="mb-3 ring-2 ring-[var(--student-primary-soft)]"
            />

            <h2 className="text-[16px] font-bold text-[var(--student-foreground)]">
              {profile.name || "--"}
            </h2>

            {profile.departmentName && (
              <p className="text-[11px] text-[var(--student-mute-foreground)] mt-0.5 truncate max-w-full">
                {profile.departmentName}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
              {profile.authStatus === "已授权" ? (
                <Badge variant="success">{profile.authStatus}</Badge>
              ) : (
                <Badge variant="warning">{profile.authStatus}</Badge>
              )}
              <Badge variant="profile">
                {profile.roleLabel || "学生"}
              </Badge>
            </div>

            {/* Detail info rows */}
            <div className="w-full mt-3 pt-3 border-t border-[var(--student-border)] space-y-2">
              {/* Gender + Level + EXP */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 text-[var(--student-mute-foreground)]">
                  <User className="size-3" strokeWidth={1.5} />
                  {genderLabel(profile.gender)}
                </span>
                <span className="flex items-center gap-1 text-[var(--student-mute-foreground)]">
                  <span className="font-semibold text-[var(--student-ink)]">
                    Lv.{levelFromExp(profile.totalExp ?? 0)}
                  </span>
                  <Star className="size-3 text-amber-500" strokeWidth={1.5} />
                  <span className="font-semibold text-[var(--student-ink)]">{profile.totalExp ?? 0}</span>
                  <span className="text-[10px]">EXP</span>
                </span>
              </div>

              {/* Mobile */}
              {profile.mobilePhone && (
                <div className="flex items-center gap-1.5 text-[12px] text-[var(--student-mute-foreground)]">
                  <Phone className="size-3 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{profile.mobilePhone}</span>
                </div>
              )}

              {/* Email */}
              {profile.email && (
                <div className="flex items-center gap-1.5 text-[12px] text-[var(--student-mute-foreground)]">
                  <Mail className="size-3 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{profile.email}</span>
                </div>
              )}

              {/* Project Group */}
              {profile.projectGroupName && (
                <div className="flex items-center gap-1.5 text-[12px] text-[var(--student-mute-foreground)]">
                  <MapPin className="size-3 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{profile.projectGroupName}</span>
                </div>
              )}

              {/* Allowed rooms */}
              {profile.allowedRoomsDisplayZh ? (
                <div className="flex items-start gap-1.5 text-[12px] text-[var(--student-mute-foreground)]">
                  <ShieldCheck className="size-3 shrink-0 mt-0.5 text-green-500" strokeWidth={1.5} />
                  <span className="leading-relaxed line-clamp-2">{profile.allowedRoomsDisplayZh}</span>
                </div>
              ) : (
                <div className="flex items-start gap-1.5 text-[12px] text-[var(--student-mute-foreground)]">
                  <ShieldAlert className="size-3 shrink-0 mt-0.5 text-amber-500" strokeWidth={1.5} />
                  <span>暂无房间权限</span>
                </div>
              )}
            </div>
          </div>
        </StudentCard>

        {/* 2. Quick Actions */}
        <StudentCard className="left-panel">
          <h3 className="text-[13px] font-semibold text-[var(--student-foreground)] mb-2">
            快捷操作
          </h3>
          <div className="-mx-1">
            <QuickActionItem
              icon={Key}
              label="我的门禁权限"
              onClick={() => navigate("/student/rooms")}
            />
            <QuickActionItem
              icon={FileText}
              label="出入记录"
              onClick={() => navigate("/student/records")}
            />
            <QuickActionItem
              icon={AlertTriangle}
              label="违规记录"
              onClick={() => navigate("/student/records")}
            />
            <QuickActionItem
              icon={BarChart3}
              label="AI 个人画像"
              onClick={() => setShowAiModal(true)}
            />
            <QuickActionItem
              icon={Package}
              label="申领物品"
              onClick={() => navigate("/student/material")}
            />
          </div>
        </StudentCard>
      </aside>

      {/* ============================================================ */}
      {/* RIGHT COLUMN — flex-1                                        */}
      {/* ============================================================ */}
      <main className="flex-1 flex flex-col gap-3 min-w-0">
        {/* 3. Stats Summary Row */}
        <div className="flex gap-2.5 right-card">
          <StatCard label="今日进出次数" value={stats.todayAccessCount} />
          <StatCard label="违规记录" value={stats.violationCount} />
          <StatCard label="未读通知" value={stats.unreadNoticeCount} />
          <StatCard label="可进房间" value={stats.accessibleRoomCount} />
        </div>

        {/* 3.5 课题组活跃度模块 */}
        <StudentActivityDashboard
          groupName={profile.projectGroupName || ""}
          className="right-card"
        />

        {/* 4. Rooms Section: 收藏 + 常用 */}
        <StudentCard className="right-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-[var(--student-foreground)]">
              🚪 我的房间
            </h3>
            <button
              onClick={() => navigate("/student/rooms")}
              className="text-[12px] text-[var(--student-primary)] hover:underline transition-colors flex items-center gap-0.5"
            >
              查看全部
              <ChevronRight className="size-3" />
            </button>
          </div>

          {pinnedRoomsHome.length === 0 && frequentRoomsHome.length === 0 ? (
            <p className="text-[12px] text-[var(--student-mute)] py-4 text-center">暂无房间数据</p>
          ) : (
            <div className="space-y-3">
              {/* Pinned rooms */}
              {pinnedRoomsHome.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-amber-700 mb-1.5">⭐ 收藏的房间</p>
                  <div className="flex flex-wrap gap-2">
                    {pinnedRoomsHome.slice(0, maxShow).map((room: any) => (
                      <RoomCard
                        key={room.roomId}
                        className="w-[180px] pinned-room-item"
                        roomName={room.roomName}
                        floor={room.floor}
                        zone={room.zone}
                        occupantCount={room.occupantCount}
                        capacity={room.capacity}
                        status={room.status}
                        isPinned={room.isPinned}
                        onClick={() => navigate(`/student/rooms?highlight=${room.roomId}`)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ARO-matched rooms */}
              {frequentRoomsHome.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-[var(--student-primary)] mb-1.5">🚪 常用房间（门禁权限）</p>
                  <div className="flex flex-wrap gap-2">
                    {frequentRoomsHome.slice(0, maxShow).map((room: any) => (
                      <RoomCard
                        key={room.roomId}
                        className="w-[180px] pinned-room-item"
                        roomName={room.roomName}
                        floor={room.floor}
                        zone={room.zone}
                        occupantCount={room.occupantCount}
                        capacity={room.capacity}
                        status={room.status}
                        isPinned={room.isPinned}
                        onClick={() => navigate(`/student/rooms?highlight=${room.roomId}`)}
                      />
                    ))}
                    {/* "+" add card inline */}
                    <button
                      aria-label="添加房间"
                      onClick={() => navigate("/student/rooms")}
                      className="w-[180px] h-[100px] flex items-center justify-center rounded-[var(--student-radius-md)] border-2 border-dashed border-[var(--student-hairline)] bg-[var(--student-mute)]/10 hover:bg-[var(--student-mute)]/20 transition-colors"
                    >
                      <Plus className="size-5 text-[var(--student-mute-foreground)]" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* "+" card when no rooms at all */}
          {pinnedRoomsHome.length === 0 && frequentRoomsHome.length === 0 && (
            <button
              aria-label="添加房间"
              onClick={() => navigate("/student/rooms")}
              className="w-[180px] h-[100px] flex items-center justify-center rounded-[var(--student-radius-md)] border-2 border-dashed border-[var(--student-hairline)] bg-[var(--student-mute)]/10 hover:bg-[var(--student-mute)]/20 transition-colors"
            >
              <Plus className="size-5 text-[var(--student-mute-foreground)]" strokeWidth={1.5} />
            </button>
          )}
        </StudentCard>

        {/* 5. Recent Records + Notifications (dual column) */}
        <div className="flex gap-2.5">
          {/* Recent Access Records */}
          <div className="flex-1">
            <StudentCard className="right-card">
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
            <StudentCard className="right-card">
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
      {showAiModal && createPortal(
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
        </div>,
        document.body,
      )}
    </div>
  );
}
