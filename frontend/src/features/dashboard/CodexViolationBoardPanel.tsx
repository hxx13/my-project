import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { fetchDashboardViolationBoard } from "@/api/domains/dashboardViolationBoard.api";
import { useDashboardSciFiVisual } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import { ViolationBoardRow } from "./ViolationBoardRow";
import { useVerticalAutoScroll } from "./useVerticalAutoScroll";

type Props = {
  active: boolean;
  generation: number;
  onCycleComplete: () => void;
  onEmpty: () => void;
};

/**
 * 惩戒 Tab：单一滚动容器，整表统一纵向自动滚动；
 * 每行「姓名 → 简短说明 → 末尾照片（无图不占位）」。
 */
export function CodexViolationBoardPanel({
  active,
  generation,
  onCycleComplete,
  onEmpty,
}: Props) {
  const sf = useDashboardSciFiVisual();
  const ref = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard-violation-board"],
    queryFn: fetchDashboardViolationBoard,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const enabled = Boolean(data?.enabled);
  const items = enabled ? (data?.items ?? []) : [];
  const hasItems = items.length > 0;

  useEffect(() => {
    if (!active || isLoading) return;
    if (!enabled || !hasItems) {
      onEmpty();
    }
  }, [active, isLoading, enabled, hasItems, onEmpty]);

  useVerticalAutoScroll(ref, {
    enabled: active && hasItems,
    pauseStartMs: 30000,
    pauseEndMs: 30000,
    msPerPx: 60,
    roundTrips: 3,
    fallbackTimeoutMs: 30000,
    onCycleComplete,
    resetKey: `${generation}-${items.length}-${items.map((i) => i.id).join(",")}`,
    mode: "cycle",
  });

  const headTone = sf ? "text-fuchsia-100" : "text-rose-900";
  const metaTone = sf ? "text-fuchsia-200/70" : "text-rose-700/80";
  const emptyTone = sf ? "text-slate-400" : "text-slate-500";

  if (isLoading) {
    return (
      <div className={`flex h-full items-center justify-center text-sm ${emptyTone}`}>
        惩戒公示加载中…
      </div>
    );
  }

  if (isError) {
    return (
      <div className={`flex h-full items-center justify-center px-2 text-center text-sm ${emptyTone}`}>
        惩戒公示加载失败
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className={`flex h-full items-center justify-center px-2 text-center text-sm ${emptyTone}`}>
        惩戒公示已关闭
      </div>
    );
  }

  if (!hasItems) {
    return (
      <div className={`flex h-full items-center justify-center px-2 text-center text-sm ${emptyTone}`}>
        当前无在册违规人员
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className={`mb-2 flex shrink-0 items-center gap-2 ${headTone}`}>
        <ShieldAlert className={`h-4 w-4 shrink-0 md:h-5 md:w-5 ${sf ? "text-fuchsia-400" : "text-rose-600"}`} />
        <span className="text-sm font-bold tracking-wide md:text-base">违规惩戒公示</span>
        <span className={`text-xs font-normal ${metaTone}`}>· 共 {items.length} 人</span>
      </div>
      <div
        ref={ref}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <ViolationBoardRow key={item.id} item={item} />
        ))}
        <div className="h-2" />
      </div>
    </div>
  );
}
