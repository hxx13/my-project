import type { CapacityStat } from "@/components/scanner/components/types";

export const CapacityStatusList = ({
    items,
    roomOverviewFetching = false,
    roomOverviewSourceCount = 0,
}: {
    items: CapacityStat[];
    roomOverviewFetching?: boolean;
    roomOverviewSourceCount?: number;
}) => (
    <div className="w-full flex flex-col items-center mt-4 flex-1 min-h-0">
        <div className="text-[10px] font-black text-[var(--scan-accent-ink,var(--app-color-scan-accent-ink))] uppercase tracking-[0.2em] mb-3">
            实时空间负载
        </div>
        <div className="app-themed-scrollbar w-full max-w-[280px] flex flex-col gap-2.5 overflow-y-auto pb-4">
            {roomOverviewFetching && items.length === 0 && roomOverviewSourceCount === 0 ? (
                <div
                    className="h-12 w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] animate-pulse"
                    aria-busy="true"
                    title="正在同步空间负载"
                />
            ) : items.length === 0 ? (
                <div className="text-center text-[10px] text-[var(--app-color-text-tertiary)] font-bold mt-2 px-2 leading-snug">
                    无匹配负载：请保证权限房间的 officialRoomId 与房卡调度中配置的流水 room_id 一致（不再按房间名模糊匹配）。
                </div>
            ) : (
                items.map((stat, i) => {
                    const isFull = stat.remaining <= 0;
                    const totalSlots = Math.max(1, stat.total || 1);
                    return (
                        <div key={`${stat.name}-${i}`} className="scan-capacity-row">
                            <span className="text-[11px] font-bold text-[var(--app-color-text-primary)] truncate w-[75px]">
                                {stat.name}
                            </span>
                            <div className="flex gap-[2px] mx-2 flex-1 justify-end min-w-0">
                                {[...Array(totalSlots)].map((_, idx) => (
                                    <div
                                        key={idx}
                                        className={`flex-1 max-w-[6px] min-w-[1.5px] h-2.5 rounded-[1px] ${
                                            idx < stat.count
                                                ? isFull
                                                    ? "bg-[var(--app-color-feedback-danger)] shadow-[0_0_5px_color-mix(in_srgb,var(--app-color-feedback-danger)_60%,transparent)]"
                                                    : "bg-[var(--scan-accent-secondary,var(--app-color-scan-ai-accent))] shadow-[0_0_5px_color-mix(in_srgb,var(--scan-accent-secondary,var(--app-color-scan-ai-accent))_60%,transparent)]"
                                                : "bg-[var(--app-color-surface-hover)]"
                                        }`}
                                    />
                                ))}
                            </div>
                            <span
                                className={`text-[10px] font-black w-[45px] text-right ${
                                    isFull
                                        ? "text-[var(--app-color-feedback-danger)]"
                                        : "text-[var(--scan-accent-ink,var(--app-color-scan-accent-ink))]"
                                }`}
                            >
                                {isFull ? "满载" : `剩 ${stat.remaining}`}
                            </span>
                        </div>
                    );
                })
            )}
        </div>
    </div>
);
