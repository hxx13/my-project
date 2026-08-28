import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { fetchDashboardViolationBoard } from "@/api/domains/dashboardViolationBoard.api";
import { dashTone, useDashboardVisual } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import { DASH_NIGHT_CLASS } from "@/features/dashboard-scifi-theme/dashboardNightTokens";
import { ViolationBoardRow } from "./ViolationBoardRow";
import { useVerticalAutoScroll } from "./useVerticalAutoScroll";

type Props = {
  active: boolean;
  generation: number;
  onCycleComplete: () => void;
  onEmpty: () => void;
};

/**
 * 提醒公示 Tab：单一滚动容器，整表统一纵向自动滚动（纯展示，无点击）。
 * 课题组违规为「组卡 + 全员名字 chips」，个人违规为「姓名 + 说明 + 多图内联」。
 */
export function CodexViolationBoardPanel({
  active,
  generation,
  onCycleComplete,
  onEmpty,
}: Props) {
  const visual = useDashboardVisual();
  const ref = useRef<HTMLDivElement | null>(null);
  const previewDepthRef = useRef(0);
  const [previewLocked, setPreviewLocked] = useState(false);

  const handleRowPreviewChange = useCallback((open: boolean) => {
    if (open) {
      previewDepthRef.current += 1;
      setPreviewLocked(true);
      return;
    }
    previewDepthRef.current = Math.max(0, previewDepthRef.current - 1);
    if (previewDepthRef.current === 0) {
      setPreviewLocked(false);
    }
  }, []);

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

  const scrollHandlers = useVerticalAutoScroll(ref, {
    enabled: active && hasItems && !previewLocked,
    pauseStartMs: 30000,
    pauseEndMs: 30000,
    msPerPx: 38,
    roundTrips: 3,
    fallbackTimeoutMs: 30000,
    onCycleComplete,
    resetKey: `${generation}-${items.length}-${items.map((i) => i.id).join(",")}`,
    mode: "cycle",
  });

  const headTone = dashTone(visual, "text-fuchsia-100", DASH_NIGHT_CLASS.title, "text-rose-900");
  const metaTone = dashTone(visual, "text-fuchsia-200/70", DASH_NIGHT_CLASS.textMuted, "text-rose-700/80");
  const emptyTone = dashTone(visual, "text-slate-400", DASH_NIGHT_CLASS.textMuted, "text-slate-500");

  if (isLoading) {
    return (
      <div className={`flex h-full items-center justify-center text-sm ${emptyTone}`}>
        提醒公示加载中…
      </div>
    );
  }

  if (isError) {
    return (
      <div className={`flex h-full items-center justify-center px-2 text-center text-sm ${emptyTone}`}>
        提醒公示加载失败
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className={`flex h-full items-center justify-center px-2 text-center text-sm ${emptyTone}`}>
        提醒公示已关闭
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
        <ShieldAlert
          className={`h-4 w-4 shrink-0 md:h-5 md:w-5 ${dashTone(visual, "text-fuchsia-400", DASH_NIGHT_CLASS.legendWarm, "text-rose-600")}`}
        />
        <span className={`text-xs font-normal ${metaTone}`}>共 {items.length} 人</span>
      </div>
      <div
        ref={ref}
        className="min-h-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        {...scrollHandlers}
      >
        {items.map((item) => (
          <ViolationBoardRow key={item.id} item={item} onPreviewOpenChange={handleRowPreviewChange} />
        ))}
        <div className="h-2" />
      </div>
    </div>
  );
}
