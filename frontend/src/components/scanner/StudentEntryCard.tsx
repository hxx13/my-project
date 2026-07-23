import { useState } from "react";
import { ArrowLeft, GraduationCap, Home, KeyRound, LayoutGrid, Smartphone } from "lucide-react";
import type { CapacityStat } from "./components/types";
import { ScanActionButton } from "./ScanActionButton";
import { STUDENT_CARD } from "./scanPopupTheme";
import { MobileQrCard } from "./MobileQrCard";

interface StudentEntryCardProps {
  capacityStats: CapacityStat[];
  roomOverviewFetching: boolean;
  roomOverviewSourceCount: number;

  studentUserId: string;
  studentName?: string;

  onEnterStudentCenter: () => void;
  onOpenQuickActions: () => void;
  onClosePopup: () => void;
}

type Page = 1 | 2 | 3;

export function StudentEntryCard({
  capacityStats,
  roomOverviewFetching,
  roomOverviewSourceCount,
  studentUserId,
  studentName,
  onEnterStudentCenter,
  onOpenQuickActions,
  onClosePopup,
}: StudentEntryCardProps) {
  const [page, setPage] = useState<Page>(1);

  const pageTitles: Record<Page, { icon: typeof Home; title: string; subtitle: string }> = {
    1: { icon: Smartphone, title: "扫一扫进入手机版个人中心", subtitle: "扫码后在手机上打开个人中心" },
    2: { icon: Home, title: "馆内实时负载", subtitle: "各房间当前占用情况" },
    3: { icon: KeyRound, title: "快捷入口", subtitle: "选择你要执行的操作" },
  };

  const current = pageTitles[page];
  const PageIcon = current.icon;

  return (
    <div className={`relative flex min-h-0 w-full flex-1 flex-col ${STUDENT_CARD}`}>
      <div
        className="pointer-events-none absolute top-1/2 -left-10 h-1/2 w-16 -translate-y-1/2 opacity-20 blur-[60px]"
        style={{ backgroundColor: "var(--scan-glow, var(--app-color-scan-backdrop-neon))", opacity: 0.20 }}
      />

      <div className="relative z-10 flex shrink-0 flex-col items-center gap-1.5 px-3 pb-1 pt-3">
        <div className="flex justify-center gap-1">
          {([1, 2, 3] as Page[]).map((p) => (
            <div
              key={p}
              className={`h-1 w-5 rounded-full transition-all duration-300 ${
                p === page
                  ? "bg-[var(--scan-accent-ink,var(--app-color-scan-accent-ink))] shadow-[0_0_8px_var(--scan-glow)]"
                  : "bg-[var(--app-color-border-default)]"
              }`}
            />
          ))}
        </div>

        <div className="scan-entry-page-head">
          <span className="scan-entry-page-head__icon" aria-hidden>
            <PageIcon className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="text-center">
            <h3 className={`font-semibold text-[var(--app-color-text-primary)] ${page === 1 ? "text-sm leading-snug" : "text-xs"}`}>{current.title}</h3>
            <p className="mt-0.5 text-[9px] text-[var(--app-color-text-tertiary)]">{current.subtitle}</p>
          </div>
        </div>
      </div>

      <div
        className={`relative z-10 min-h-0 flex-1 px-3 pb-12 ${
          page === 1 ? "flex flex-col overflow-hidden" : "app-themed-scrollbar overflow-y-auto"
        }`}
      >
        {page === 1 ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {studentUserId ? (
              <MobileQrCard userId={studentUserId} adaptive />
            ) : (
              <p className="py-4 text-center text-[10px] text-[var(--app-color-text-tertiary)]">
                暂无人员信息，无法生成二维码
              </p>
            )}
          </div>
        ) : page === 2 ? (
          <div className="flex flex-col gap-1.5">
            {roomOverviewFetching && capacityStats.length === 0 && roomOverviewSourceCount === 0 ? (
              <div className="h-8 w-full animate-pulse rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)]" />
            ) : capacityStats.length === 0 ? (
              <p className="py-2 text-center text-[10px] text-[var(--app-color-text-tertiary)]">
                暂无负载数据
              </p>
            ) : (
              capacityStats.map((stat, i) => {
                const isFull = stat.remaining <= 0;
                const totalSlots = Math.max(1, stat.total || 1);
                const pct = Math.min(100, Math.round((stat.count / totalSlots) * 100));
                return (
                  <div
                    key={`${stat.name}-${i}`}
                    className="scan-inner-row flex w-full items-center gap-1.5 px-2.5 py-1.5"
                  >
                    <span
                      className="min-w-0 flex-[1.8] truncate text-left text-[10px] leading-tight text-[var(--app-color-text-secondary)]"
                      title={stat.name}
                    >
                      {stat.name}
                    </span>

                    <div className="h-2 min-w-[2.75rem] flex-1 overflow-hidden rounded-full bg-[var(--app-color-surface-hover)]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isFull
                            ? "bg-[var(--app-color-feedback-danger)]"
                            : "bg-[var(--app-color-feedback-warning)]"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <span
                      className={`shrink-0 text-right text-[10px] font-bold tabular-nums ${
                        isFull
                          ? "text-[var(--app-color-feedback-danger)]"
                          : "text-[var(--app-color-feedback-warning)]"
                      }`}
                    >
                      {isFull ? "满载" : stat.count}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="mx-auto flex w-[92%] flex-col gap-2">
            <ScanActionButton
              layout="row"
              variant="student"
              icon={GraduationCap}
              title="进入学生中心"
              description={studentName ? `以 ${studentName} 的身份进入` : "查看个人学习记录与数据"}
              onClick={onEnterStudentCenter}
            />
            <ScanActionButton
              layout="row"
              variant="quick"
              icon={LayoutGrid}
              title="快捷业务"
              description="签到 · 上报 · 申领"
              onClick={onOpenQuickActions}
            />
            <ScanActionButton
              layout="row"
              variant="neutral"
              icon={ArrowLeft}
              title="返回主屏幕"
              description="关闭弹窗回到扫码页"
              onClick={onClosePopup}
            />
          </div>
        )}
      </div>

      {page > 1 ? (
        <div className="absolute bottom-2 left-2 z-20">
          <button
            type="button"
            onClick={() => setPage((page - 1) as Page)}
            className="flex items-center gap-1.5 rounded-[var(--app-radius-pill)] border border-[var(--app-color-border-default)] px-3 py-1.5 text-[11px] text-[var(--app-color-text-secondary)] transition-colors hover:border-[var(--scan-accent-strong)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            上一页
          </button>
        </div>
      ) : null}
      {page < 3 ? (
        <div className="absolute bottom-2 right-2 z-20">
          <button
            type="button"
            onClick={() => setPage((page + 1) as Page)}
            className="flex items-center gap-1.5 rounded-[var(--app-radius-pill)] border border-[var(--app-color-border-default)] px-3 py-1.5 text-[11px] text-[var(--app-color-text-secondary)] transition-colors hover:border-[var(--scan-accent-strong)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
          >
            下一页
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
