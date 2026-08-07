import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  AlertTriangle,
  BarChart3,
  Key,
  Pin,
  X,
  Brain,
  Clock,
  TrendingUp,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Star,
  ShieldCheck,
  ShieldAlert,
  User,
  Package,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import { useStudentDashboard } from "../hooks/use-student-dashboard";
import { useStudentAiProfile } from "../hooks/use-student-ai-profile";
import { useStudentStats } from "../hooks/use-student-stats";
import { StudentActivityDashboard } from "../components/student-activity-dashboard";
import type { AiPredictionRecord, StatsData } from "../api/student.api";
import {
  StudentCard,
  Badge,
  Skeleton,
  ErrorRetry,
  Avatar,
  BarChart,
  StatPanel,
} from "../components/ui";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** An action link in the Quick Actions sidebar card */
function QuickActionItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
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

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function DashboardSkeleton() {
  return (
    <div className="flex gap-5 p-6 min-h-full">
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
        <div className="flex items-center gap-8 bg-[var(--student-surface)] rounded-xl px-6 py-5 shadow-sm mb-4 flex-wrap">
          {Array.from({ length: 6 }).map((_, i) => (
            <Fragment key={i}>
              {i > 0 && <div className="w-px h-8 bg-[var(--student-hairline)] shrink-0" />}
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-5 w-16" />
              </div>
            </Fragment>
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
  const [period, setPeriod] = useState<string>("7d");
  const { data: statsData, isLoading: statsLoading } = useStudentStats(period);

  const pageRef = useRef<HTMLDivElement>(null);

  /* ---- loading ---- */
  if (isLoading) return <DashboardSkeleton />;

  /* ---- error ---- */
  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-full">
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

  const { profile } = data;

  /* ---- normal ---- */
  return (
    <AdminPageShell>
      <AdminFullWidthPage>
        <div ref={pageRef} className="flex gap-5 min-h-0 h-full overflow-hidden">
      {/* ============================================================ */}
      {/* LEFT COLUMN — 260px fixed width                              */}
      {/* ============================================================ */}
      <aside className="w-[260px] shrink-0 flex flex-col gap-3">
        {/* 1. Personal Identity Card — expanded */}
        <StudentCard padding="lg">
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
        <StudentCard>
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
      <main className="flex-1 flex flex-col gap-3 min-w-0 min-h-0 overflow-y-auto">
        {/* 3. Stats Summary — migrated from /student/stats */}
        {statsLoading ? (
          <div className="flex items-center gap-8 bg-[var(--student-surface)] rounded-xl px-6 py-5 shadow-sm mb-4 flex-wrap">
            {Array.from({ length: 6 }).map((_, i) => (
              <Fragment key={i}>
                {i > 0 && <div className="w-px h-8 bg-[var(--student-hairline)] shrink-0" />}
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-5 w-16" />
                </div>
              </Fragment>
            ))}
          </div>
        ) : statsData && statsData.period.days >= 7 ? (
          <>
            {/* Summary bar — Calendar icon clickable to cycle period */}
            <div className="flex items-center gap-8 bg-[var(--student-surface)] rounded-xl px-6 py-5 shadow-sm mb-4 flex-wrap">
              <button type="button"
                onClick={() => setPeriod(period === "7d" ? "30d" : period === "30d" ? "90d" : "7d")}
                title={period === "7d" ? "近 7 天 · 点击切换" : period === "30d" ? "近 30 天 · 点击切换" : "近 90 天 · 点击切换"}
                className="shrink-0 flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity">
                <Calendar className="size-4 text-[var(--student-mute-foreground)] shrink-0 group-hover:text-[var(--student-primary)] transition-colors" strokeWidth={1.5} />
                <div>
                  <span className="text-[11px] text-[var(--student-mute-foreground)]">统计周期 · <span className="font-medium text-[var(--student-primary)]">{{ "7d": "近 7 天", "30d": "近 30 天", "90d": "近 90 天" }[period]}</span></span>
                  <div className="mt-0.5 text-[13px] font-semibold text-[var(--student-ink)] tabular-nums">
                    {statsData.period.start}<span className="mx-1 text-[var(--student-mute-foreground)] font-normal">~</span>{statsData.period.end}
                  </div>
                </div>
              </button>
              {[{ label: "总进出次数", value: statsData.summary.totalAccess, unit: "次" },
                { label: "日均进出", value: statsData.summary.dailyAvg, unit: "次/天" },
                { label: "出勤天数", value: statsData.summary.attendanceDays, unit: "天" },
                { label: "涉及房间", value: statsData.summary.roomCount, unit: "间" },
                { label: "违规记录", value: statsData.summary.violationCount, unit: "次" },
              ].map((s, i) => (
                <Fragment key={s.label}>
                  <div className="w-px h-8 bg-[var(--student-hairline)] shrink-0" />
                  <div className="shrink-0">
                    <span className="text-[11px] text-[var(--student-mute-foreground)]">{s.label}</span>
                    <div className="mt-0.5">
                      <span className="text-lg font-bold text-[var(--student-ink)] tabular-nums">{s.value.toLocaleString()}</span>
                      <span className="ml-1 text-[11px] text-[var(--student-mute-foreground)]">{s.unit}</span>
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>

            {/* Two-column charts — flat grid so each row's left/right share the same height */}
            <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "1fr 320px" }}>
              <StatPanel title="进出趋势">
                <div className="flex items-center gap-3 mb-2 text-[11px]">
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[var(--student-primary)]" /> 进入</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[var(--student-primary-soft)]" /> 离开</span>
                </div>
                <BarChart data={statsData.dailyTrend.map((d: any) => ({ label: d.date.slice(5), value: d.entryCount, value2: d.exitCount }))} height={140} barColor="var(--student-primary)" barColor2="var(--student-primary-soft)" />
              </StatPanel>
              <StatPanel title="房间访问分布" isEmpty={statsData.roomDistribution.length === 0} emptyText="暂无房间访问数据">
                <div className="overflow-y-auto">
                  {statsData.roomDistribution.map((r: any) => (
                    <div key={r.roomName} className="flex items-center gap-2 mb-3 last:mb-0">
                      <span className="text-[13px] text-[var(--student-foreground)] flex-1 truncate">{r.roomName}</span>
                      <span className="text-[11px] text-[var(--student-mute-foreground)] whitespace-nowrap tabular-nums">{r.count}次</span>
                      <span className="text-[11px] font-medium text-[var(--student-ink)] w-10 text-right tabular-nums">{r.percentage}%</span>
                      <div className="w-16 h-1.5 bg-[var(--student-mute)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-[var(--student-primary)] transition-all" style={{ width: `${Math.min(r.percentage, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </StatPanel>
              <StatPanel title="时段分布">
                <div className="flex items-center gap-3 mb-2 text-[11px]">
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[var(--student-primary)]" /> 进入</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[var(--student-primary-soft)]" /> 离开</span>
                </div>
                <BarChart data={statsData.hourlyDistribution.map((d: any) => ({ label: d.bucket.slice(0, 5), value: d.entryCount, value2: d.exitCount }))} height={100} barColor="var(--student-primary)" barColor2="var(--student-primary-soft)" />
              </StatPanel>
              <StatPanel title="平均进入时长" isEmpty={statsData.avgStayDuration.length === 0} emptyText="暂无在室时长数据">
                <div className="overflow-y-auto">
                  {statsData.avgStayDuration.map((d: any) => (
                    <div key={d.roomName} className="flex justify-between items-center text-[13px] mb-2 last:mb-0">
                      <span className="text-[var(--student-foreground)] truncate flex-1 min-w-0">{d.roomName}</span>
                      <span className="font-semibold text-[var(--student-ink)] ml-2 shrink-0 tabular-nums">{d.durationMinutes} 分钟</span>
                    </div>
                  ))}
                </div>
              </StatPanel>
            </div>
          </>
        ) : null}

        {/* 3.5 课题组活跃度模块 */}
        <StudentActivityDashboard
          groupName={profile.projectGroupName || ""}
        />

      </main>

      {/* ---- AI 个人画像 Modal ---- */}
      {showAiModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAiModal(false)}>
          <div
            className="w-full max-w-lg max-h-[75vh] overflow-hidden rounded-xl border border-[var(--student-hairline)] bg-[var(--student-surface)] shadow-xl"
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
      </AdminFullWidthPage>
    </AdminPageShell>
  );
}
