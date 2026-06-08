import { useState } from "react";
import type { CapacityStat } from "./components/types";

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
    <div className="w-full flex-1 min-h-0 flex flex-col rounded-2xl bg-[#0b0c10] border border-white/5 shadow-2xl overflow-hidden relative">
      {/* Left glow effect */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-10 w-16 h-1/2 bg-purple-500 blur-[60px] opacity-10 pointer-events-none" />

      <div className="relative z-10 p-3 flex flex-col gap-2.5">
        {/* Page indicator dots */}
        <div className="flex justify-center gap-1">
          {([1, 2] as Page[]).map((p) => (
            <div
              key={p}
              className={`w-5 h-1 rounded-full transition-all duration-300 ${
                p === page
                  ? "bg-purple-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                  : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="flex justify-center">
          <span className="text-2xl">{current.icon}</span>
        </div>

        {/* Title + subtitle */}
        <div className="text-center">
          <h3 className="text-xs font-semibold text-white">{current.title}</h3>
          <p className="text-[9px] text-slate-500 mt-0.5">{current.subtitle}</p>
        </div>

        {/* Page content */}
        {page === 1 ? (
          /* ---- Page 1: Room Capacity ---- */
          <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto [&::-webkit-scrollbar]:hidden">
            {roomOverviewFetching && capacityStats.length === 0 && roomOverviewSourceCount === 0 ? (
              <div className="h-8 w-full rounded-lg bg-white/[0.02] border border-white/5 animate-pulse" />
            ) : capacityStats.length === 0 ? (
              <p className="text-center text-[10px] text-white/30 py-2">
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.02] border border-white/5"
                  >
                    <span className="text-[9px] text-white/70 w-14 truncate shrink-0">
                      {stat.name}
                    </span>
                    <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isFull ? "bg-rose-500" : "bg-cyan-400"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span
                      className={`text-[9px] font-bold w-12 text-right shrink-0 ${
                        isFull ? "text-rose-400" : "text-cyan-300"
                      }`}
                    >
                      {isFull ? "满载" : `${stat.count}/${totalSlots}`}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* ---- Page 2: Action Buttons ---- */
          <div className="flex flex-col gap-1">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl
                           bg-[#12141a] border border-white/5
                           hover:bg-[#1a1c23] hover:border-white/10
                           active:scale-[0.98] transition-all text-left group"
              >
                <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0">
                  {action.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-medium text-white">{action.title}</div>
                  <div className="text-[8px] text-slate-500">{action.desc}</div>
                </div>
                <div className="w-4 h-4 rounded-full bg-white/5 flex items-center justify-center text-slate-500 group-hover:bg-white/10 group-hover:text-white transition-colors shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Footer: prev/next */}
        <div className="flex justify-between items-center">
          {page === 1 ? (
            <div />
          ) : (
            <button
              onClick={() => setPage(1)}
              className="flex items-center gap-1 px-2 py-1 rounded-3xl
                         border border-white/5 text-[9px] text-slate-400
                         hover:bg-white/5 hover:text-white transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              上一页
            </button>
          )}
          {page === 1 ? (
            <button
              onClick={() => setPage(2)}
              className="flex items-center gap-1 px-2 py-1 rounded-3xl
                         border border-white/5 text-[9px] text-slate-400
                         hover:bg-white/5 hover:text-white transition-colors"
            >
              下一页
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ) : (
            <div />
          )}
        </div>
      </div>
    </div>
  );
}
