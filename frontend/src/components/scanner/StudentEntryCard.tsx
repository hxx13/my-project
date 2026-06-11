import { useState } from "react";
import type { CapacityStat } from "./components/types";
import { STUDENT_CARD, INNER_ROW } from "./scanPopupTheme";

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

type Page = 1 | 2;

export function StudentEntryCard({
  capacityStats,
  roomOverviewFetching,
  roomOverviewSourceCount,
  studentUserId: _studentUserId,
  studentName,
  onEnterStudentCenter,
  onOpenQuickActions,
  onClosePopup,
}: StudentEntryCardProps) {
  const [page, setPage] = useState<Page>(1);

  const pageTitles: Record<Page, { icon: string; title: string; subtitle: string }> = {
    1: { icon: "🏠", title: "馆内实时负载", subtitle: "各房间当前占用情况" },
    2: { icon: "🔑", title: "快捷入口", subtitle: "选择你要执行的操作" },
  };

  const current = pageTitles[page];

  const actions = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 1.1 2 2 6 2s6-.9 6-2v-5" />
        </svg>
      ),
      title: "进入学生中心",
      desc: studentName ? `以 ${studentName} 的身份进入` : "查看个人学习记录与数据",
      onClick: onEnterStudentCenter,
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <rect x="3" y="3" width="18" height="18" rx="3" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="12" y2="17" />
        </svg>
      ),
      title: "快捷业务",
      desc: "签到 · 上报 · 申领",
      onClick: onOpenQuickActions,
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      ),
      title: "返回主屏幕",
      desc: "关闭弹窗回到扫码页",
      onClick: onClosePopup,
    },
  ];

  return (
    <div className={`relative flex min-h-0 w-full flex-1 flex-col ${STUDENT_CARD}`}>
      <div
        className="pointer-events-none absolute top-1/2 -left-10 h-1/2 w-16 -translate-y-1/2 opacity-20 blur-[60px]"
        style={{ backgroundColor: "var(--scan-glow)", opacity: 0.20 }}
      />

      <div className="relative z-10 flex shrink-0 flex-col items-center gap-1.5 px-3 pb-1 pt-3">
        <div className="flex justify-center gap-1">
          {([1, 2] as Page[]).map((p) => (
            <div
              key={p}
              className={`h-1 w-5 rounded-full transition-all duration-300 ${
                p === page
                  ? "bg-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                  : "bg-[var(--app-color-border-default)]"
              }`}
            />
          ))}
        </div>

        <span className="text-xl">{current.icon}</span>

        <div className="text-center">
          <h3 className="text-xs font-semibold text-[var(--app-color-text-primary)]">{current.title}</h3>
          <p className="mt-0.5 text-[9px] text-[var(--app-color-text-tertiary)]">{current.subtitle}</p>
        </div>
      </div>

      <div className="app-themed-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto px-3 pb-10">
        {page === 1 ? (
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
                    className={`mx-auto flex w-4/5 items-center gap-2 ${INNER_ROW} px-3 py-2`}
                  >
                    <span className="w-12 shrink-0 truncate text-left text-[10px] text-[var(--app-color-text-secondary)]">
                      {stat.name}
                    </span>

                    <div className="flex flex-1 justify-center">
                      <div className="h-2 w-3/5 overflow-hidden rounded-full bg-[var(--app-color-surface-hover)]">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isFull
                              ? "bg-red-400"
                              : "bg-amber-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <span
                      className={`w-9 shrink-0 text-right text-[10px] font-bold ${
                        isFull ? "text-red-500" : "text-amber-600"
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
          <div className="mx-auto flex w-4/5 flex-col gap-1.5">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                className={`group flex items-center gap-2 ${INNER_ROW} px-2.5 py-2 text-left shadow-sm transition-all hover:shadow-md hover:border-slate-300 dark:hover:border-white/15 active:scale-[0.98]`}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--app-radius-element)] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                  {action.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-medium text-[var(--app-color-text-primary)]">{action.title}</div>
                  <div className="text-[8px] text-[var(--app-color-text-tertiary)]">{action.desc}</div>
                </div>
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)] transition-colors group-hover:bg-[var(--app-color-surface-active)] group-hover:text-[var(--app-color-text-primary)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {page === 1 ? (
        <div className="absolute bottom-2 right-2 z-20">
          <button
            onClick={() => setPage(2)}
            className="flex items-center gap-1.5 rounded-[var(--app-radius-pill)] border border-[var(--app-color-border-default)] px-3 py-1.5 text-[11px] text-[var(--app-color-text-secondary)] transition-colors hover:border-[var(--app-color-border-strong)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
          >
            下一页
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="absolute bottom-2 left-2 z-20">
          <button
            onClick={() => setPage(1)}
            className="flex items-center gap-1.5 rounded-[var(--app-radius-pill)] border border-[var(--app-color-border-default)] px-3 py-1.5 text-[11px] text-[var(--app-color-text-secondary)] transition-colors hover:border-[var(--app-color-border-strong)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            上一页
          </button>
        </div>
      )}
    </div>
  );
}
