import { useState } from "react";
import { BookmarkPlus, ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import { AnalyticsPipelineFilterBar } from "@/features/analytics/AnalyticsPipelineFilterBar";
import { CageAnalyticsScopeFilterBar } from "@/features/analytics/CageAnalyticsScopeFilterBar";
import { AccessChannelMultiSelect } from "@/features/analytics/AccessChannelMultiSelect";
import { CompareCyclesField } from "@/features/analytics/components/CompareCyclesField";
import {
  defaultAnalyticsDraftFilter,
  withChannelSelection,
  type AnalyticsDraftFilter,
} from "@/features/analytics/analyticsPipelineFilter";
import {
  defaultCageAnalyticsDraftFilter,
  type CageAnalyticsDraftFilter,
} from "@/features/analytics/cageAnalyticsFilter";
import {
  analyticsChipIdle,
  analyticsFilterShell,
  analyticsInput,
} from "@/features/analytics/analyticsUiTokens";
import { cn } from "@/lib/utils";

type IsolationProps = {
  reportKey?: string;
  draft: AnalyticsDraftFilter;
  onDraftChange: (next: AnalyticsDraftFilter) => void;
  onSaveClick: () => void;
  /** 将当前草稿写入左侧已选中的订阅配置并重算快照 */
  onApplyActive?: () => void;
  activeViewName?: string;
  activeViewSubscribed?: boolean;
  applying?: boolean;
  defaultOpen?: boolean;
};

type CageProps = {
  reportKey: "cage_occupancy";
  draft: CageAnalyticsDraftFilter;
  onDraftChange: (next: CageAnalyticsDraftFilter) => void;
  onSaveClick: () => void;
  defaultOpen?: boolean;
};

type Props = IsolationProps | CageProps;

export function AnalyticsConfigCollapsible(props: Props) {
  const { onSaveClick, defaultOpen = false } = props;
  const [open, setOpen] = useState(defaultOpen);
  const isCage = props.reportKey === "cage_occupancy";

  return (
    <div className={analyticsFilterShell}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-[var(--app-color-surface-hover)]"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--app-color-accent)]" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]" />
        )}
        <Settings2 className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]" />
        <span className="flex-1 text-sm font-semibold text-[var(--app-color-text-primary)]">统计范围与保存配置</span>
        <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
          {!isCage && !open
            ? `${(props as IsolationProps).draft.channelCodes.length || "全部"}通道 · 流水${
                (props as IsolationProps).draft.actionType === "1"
                  ? "仅进入"
                  : (props as IsolationProps).draft.actionType === "2"
                    ? "仅离开"
                    : "全部进出"
              }`
            : open
              ? "点击收起"
              : "已收纳，点击展开"}
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-[var(--app-color-border-default)] px-3 pb-3 pt-3">
          {isCage ? (
            <>
              <CageAnalyticsScopeFilterBar
                filters={(props as CageProps).draft}
                onChange={(props as CageProps).onDraftChange}
                onClear={() => (props as CageProps).onDraftChange(defaultCageAnalyticsDraftFilter())}
              />
              <p className="text-[11px] leading-relaxed text-[var(--app-color-text-tertiary)]">
                笼位统计口径：仅计入「已预约且有笼盒」（animalCageType=3）；筛选范围内笼架全量拉取（分批请求 ARO，可能较慢）。订阅后即时落库日/周/月快照并环比；不支持历史回溯。
              </p>
              <CompareCyclesField
                value={(props as CageProps).draft.compareCycles}
                onChange={(compareCycles) =>
                  (props as CageProps).onDraftChange({ ...(props as CageProps).draft, compareCycles })
                }
              />
            </>
          ) : (
            <>
              <p className="rounded-md bg-[var(--app-color-surface-elevated)] px-2 py-1.5 text-[11px] leading-relaxed text-[var(--app-color-text-tertiary)]">
                <strong className="text-[var(--app-color-accent)]">主口径</strong>：门禁统计清洗总库（通道与「门禁数据工作台 · 统计清洗」已启用通道一致；每条纳入记录计 1
                次）。
                <strong className="text-[var(--app-color-text-secondary)]"> 辅助口径</strong>：ARO 流水（校区/楼层/房间，仅参考）。
              </p>
              <div className="rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-2">
                <AccessChannelMultiSelect
                  variant="inline"
                  selected={(props as IsolationProps).draft.channelCodes}
                  onChange={(channelCodes) =>
                    (props as IsolationProps).onDraftChange(
                      withChannelSelection((props as IsolationProps).draft, channelCodes)
                    )
                  }
                />
                <p className="mt-2 border-t border-[var(--app-color-border-default)] pt-2 text-[10px] text-[var(--app-color-text-secondary)]">
                  主口径仅按通道筛清洗总库，<strong>不按进出</strong>筛门禁记录；保存后写入 filter.channelCodes。
                </p>
              </div>
              <details className="rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)]" open>
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--app-color-text-secondary)]">
                  ARO 流水（校区 / 楼层 / 房间 / 进出方向）— 仅辅助参考，不影响主条数
                </summary>
                <div className="space-y-2 border-t border-[var(--app-color-border-default)] px-2 pb-2 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--app-color-text-primary)]">进出方向（流水）</span>
                    <select
                      value={(props as IsolationProps).draft.actionType}
                      onChange={(e) =>
                        (props as IsolationProps).onDraftChange({
                          ...(props as IsolationProps).draft,
                          actionType: e.target.value as AnalyticsDraftFilter["actionType"],
                        })
                      }
                      className={cn("px-2 py-1 text-[11px] font-bold outline-none", analyticsInput)}
                    >
                      <option value="">全部进出</option>
                      <option value="1">仅进入</option>
                      <option value="2">仅离开</option>
                    </select>
                  </div>
                  <AnalyticsPipelineFilterBar
                    reportKey={(props as IsolationProps).reportKey}
                    filters={(props as IsolationProps).draft}
                    onChange={(props as IsolationProps).onDraftChange}
                    onClear={() => (props as IsolationProps).onDraftChange(defaultAnalyticsDraftFilter())}
                    hideActionType
                  />
                </div>
              </details>
              <CompareCyclesField
                value={(props as IsolationProps).draft.compareCycles}
                onChange={(compareCycles) =>
                  (props as IsolationProps).onDraftChange({ ...(props as IsolationProps).draft, compareCycles })
                }
              />
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!isCage && (props as IsolationProps).onApplyActive ? (
              <button
                type="button"
                disabled={(props as IsolationProps).applying}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--app-color-feedback-success)] px-4 py-2 text-sm font-medium text-[var(--app-color-text-inverse)] disabled:opacity-50"
                onClick={(props as IsolationProps).onApplyActive}
              >
                {(props as IsolationProps).applying ? "强制重算中…" : "保存并强制重算全部快照"}
              </button>
            ) : null}
            <button
              type="button"
              className={cn("inline-flex items-center gap-1 px-4 py-2 text-sm font-medium", analyticsChipIdle)}
              onClick={onSaveClick}
            >
              <BookmarkPlus className="h-4 w-4" />
              另存为新配置
            </button>
            <p className="w-full text-xs text-[var(--app-color-text-tertiary)]">
              {(props as IsolationProps).activeViewName ? (
                <>
                  当前选中：<strong>{(props as IsolationProps).activeViewName}</strong>
                  {(props as IsolationProps).activeViewSubscribed ? "（已订阅）" : "（未订阅，请先订阅）"}
                  。修改通道或流水筛选后请点「更新当前配置并重算」，仅改界面不点按钮不会写入快照。
                </>
              ) : (
                <>请先在左侧选择或保存统计配置；主条数来自清洗总库（通道），进出方向仅作用于 ARO 流水辅助。</>
              )}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
