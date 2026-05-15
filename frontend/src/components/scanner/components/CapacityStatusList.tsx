import type { CapacityStat } from "@/components/scanner/components/types";

export const CapacityStatusList = ({
    items,
    roomOverviewFetching = false,
    roomOverviewSourceCount = 0,
}: {
    items: CapacityStat[];
    /** 为 true 且尚无概览数据、尚无匹配行时，显示骨架而非「无匹配」文案（避免打开弹窗瞬间闪现） */
    roomOverviewFetching?: boolean;
    /** wechat-overview 原始行数；与 isFetching 组合区分「加载中」与「已加载但无 id 匹配」 */
    roomOverviewSourceCount?: number;
}) => (
    <div className="w-full flex flex-col items-center mt-4 flex-1 min-h-0">
        <div className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em] mb-3">实时空间负载</div>
        <div className="w-full max-w-[280px] flex flex-col gap-2.5 overflow-y-auto pb-4 [&::-webkit-scrollbar]:hidden">
            {roomOverviewFetching && items.length === 0 && roomOverviewSourceCount === 0 ? (
                <div className="h-12 w-full rounded-lg bg-white/[0.02] border border-white/5 animate-pulse" aria-busy="true" title="正在同步空间负载" />
            ) : items.length === 0 ? (
                <div className="text-center text-[10px] text-white/35 font-bold mt-2 px-2 leading-snug">
                    无匹配负载：请保证权限房间的 officialRoomId 与房卡调度中配置的流水 room_id 一致（不再按房间名模糊匹配）。
                </div>
            ) : (
                items.map((stat, i) => {
                    const isFull = stat.remaining <= 0;
                    const totalSlots = Math.max(1, stat.total || 1);
                    return (
                        <div key={`${stat.name}-${i}`} className="w-full flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-full px-3 py-1.5">
                            <span className="text-[11px] font-bold text-white/90 truncate w-[75px]">{stat.name}</span>
                            <div className="flex gap-[2px] mx-2 flex-1 justify-end min-w-0">
                                {[...Array(totalSlots)].map((_, idx) => (
                                    <div
                                        key={idx}
                                        className={`flex-1 max-w-[6px] min-w-[1.5px] h-2.5 rounded-[1px] ${
                                            idx < stat.count
                                                ? isFull
                                                    ? "bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.6)]"
                                                    : "bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.6)]"
                                                : "bg-white/10"
                                        }`}
                                    />
                                ))}
                            </div>
                            <span className={`text-[10px] font-black w-[45px] text-right ${isFull ? "text-rose-400" : "text-cyan-300"}`}>
                                {isFull ? "满载" : `剩 ${stat.remaining}`}
                            </span>
                        </div>
                    );
                })
            )}
        </div>
    </div>
);
