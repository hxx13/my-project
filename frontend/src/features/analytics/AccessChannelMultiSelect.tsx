import { useEffect, useState } from "react";
import { listGlobalEnabledCleanChannels, type GlobalEnabledChannel } from "@/api/domains/accessFusion.api";
import { toggleInList } from "@/features/analytics/analyticsPipelineFilter";
import { cn } from "@/lib/utils";

type Props = {
  selected: string[];
  onChange: (codes: string[]) => void;
  /** inline：嵌入筛选栏；block：配置区独立区块 */
  variant?: "inline" | "block";
  className?: string;
};

export function AccessChannelMultiSelect({ selected, onChange, variant = "block", className }: Props) {
  const [channels, setChannels] = useState<GlobalEnabledChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setChannels(await listGlobalEnabledCleanChannels());
      } catch {
        setChannels([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allSelected = channels.length > 0 && selected.length === 0;

  if (variant === "inline") {
    return (
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-600 shrink-0">通道</span>
          <button
            type="button"
            onClick={() => onChange([])}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-semibold transition",
              allSelected
                ? "border-violet-400 bg-violet-100 text-violet-900"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-violet-200"
            )}
          >
            全部
          </button>
          {loading ? <span className="text-[10px] text-neutral-400">加载…</span> : null}
          {!loading && channels.length === 0 ? (
            <span className="text-[10px] text-amber-800">请先在门禁数据工作台 · 统计清洗配置通道漏斗</span>
          ) : null}
          <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto min-w-0 flex-1">
            {channels.map((ch) => {
              const code = ch.channelCode || "";
              if (!code) return null;
              const active = selected.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => onChange(toggleInList(selected, code))}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[10px] transition max-w-[180px] truncate",
                    active
                      ? "border-violet-400 bg-violet-100 text-violet-900"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-violet-200"
                  )}
                  title={code}
                >
                  {ch.channelName || code}
                </button>
              );
            })}
          </div>
        </div>
        {selected.length > 0 ? (
          <p className="text-[10px] text-violet-800">已选 {selected.length} 个通道</p>
        ) : (
          <p className="text-[10px] text-neutral-500">未选时统计全部已启用清洗通道</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-violet-100 bg-violet-50/30 px-3 py-2 space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-violet-900 shrink-0">清洗通道</span>
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            "rounded-md border px-2 py-1 text-[11px] font-semibold transition",
            allSelected
              ? "border-violet-400 bg-violet-100 text-violet-900"
              : "border-neutral-200 bg-white text-neutral-600"
          )}
        >
          全部（部门汇总）
        </button>
        {loading ? <span className="text-[11px] text-neutral-400">加载通道…</span> : null}
      </div>
      {!loading && channels.length === 0 ? (
        <p className="text-[11px] text-amber-800">请先在「门禁数据工作台 · 统计清洗」配置通道漏斗并入库</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
          {channels.map((ch) => {
            const code = ch.channelCode || "";
            if (!code) return null;
            const active = selected.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => onChange(toggleInList(selected, code))}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] transition text-left max-w-[200px] truncate",
                  active
                    ? "border-violet-400 bg-violet-100 text-violet-900"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-violet-200"
                )}
                title={code}
              >
                {ch.channelName || code}
              </button>
            );
          })}
        </div>
      )}
      {selected.length > 0 ? (
        <p className="text-[10px] text-violet-800">已选 {selected.length} 个通道；主条数仅统计所选通道的清洗纳入记录</p>
      ) : (
        <p className="text-[10px] text-violet-700">未选通道时统计全部已启用清洗通道（与部门总消耗口径一致）</p>
      )}
    </div>
  );
}
