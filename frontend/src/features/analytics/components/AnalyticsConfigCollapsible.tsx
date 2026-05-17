import { useState } from "react";
import { BookmarkPlus, ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import { AnalyticsPipelineFilterBar } from "@/features/analytics/AnalyticsPipelineFilterBar";
import { CompareCyclesField } from "@/features/analytics/components/CompareCyclesField";
import {
  defaultAnalyticsDraftFilter,
  type AnalyticsDraftFilter,
} from "@/features/analytics/analyticsPipelineFilter";
type Props = {
  draft: AnalyticsDraftFilter;
  onDraftChange: (next: AnalyticsDraftFilter) => void;
  onSaveClick: () => void;
  defaultOpen?: boolean;
};

export function AnalyticsConfigCollapsible({
  draft,
  onDraftChange,
  onSaveClick,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-neutral-200/90 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-neutral-50"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-violet-600" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
        )}
        <Settings2 className="h-4 w-4 shrink-0 text-neutral-500" />
        <span className="flex-1 text-sm font-semibold text-neutral-800">筛选与保存配置</span>
        <span className="text-[11px] text-neutral-400">{open ? "点击收起" : "已收纳，点击展开"}</span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-neutral-100 px-3 pb-3 pt-3">
          <AnalyticsPipelineFilterBar
            filters={draft}
            onChange={onDraftChange}
            onClear={() => onDraftChange(defaultAnalyticsDraftFilter())}
          />
          <CompareCyclesField
            value={draft.compareCycles}
            onChange={(compareCycles) => onDraftChange({ ...draft, compareCycles })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-[#5645d4] px-4 py-2 text-sm font-medium text-white"
              onClick={onSaveClick}
            >
              <BookmarkPlus className="h-4 w-4" />
              保存配置
            </button>
            <p className="text-xs text-neutral-500">范围筛选用于新建/编辑配置；右侧展示各分类最新一期快照分析</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
