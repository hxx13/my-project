import ReactDOM from "react-dom";
import { BookmarkPlus, Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type IsolationProps = {
  reportKey?: string;
  draft: AnalyticsDraftFilter;
  onDraftChange: (next: AnalyticsDraftFilter) => void;
  onSaveClick: () => void;
  onApplyActive?: () => void;
  activeViewName?: string;
  activeViewSubscribed?: boolean;
  applying?: boolean;
};

type CageProps = {
  reportKey: "cage_occupancy";
  draft: CageAnalyticsDraftFilter;
  onDraftChange: (next: CageAnalyticsDraftFilter) => void;
  onSaveClick: () => void;
};

type Props = (IsolationProps | CageProps) & {
  open: boolean;
  onClose: () => void;
};

export function AnalyticsConfigSettingsModal(props: Props) {
  const { open, onClose, onSaveClick } = props;
  const isCage = props.reportKey === "cage_occupancy";

  return ReactDOM.createPortal(
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-neutral-100 px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-violet-600" />
            统计范围与配置
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-500">
            {isCage
              ? "笼位统计筛选与对比周期；保存后写入订阅配置。"
              : "门禁清洗主口径（通道）；保存后将强制重算全部已有快照。"}
          </DialogDescription>
        </DialogHeader>

        <div data-modal-scroll className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {isCage ? (
            <>
              <CageAnalyticsScopeFilterBar
                filters={(props as CageProps).draft}
                onChange={(props as CageProps).onDraftChange}
                onClear={() => (props as CageProps).onDraftChange(defaultCageAnalyticsDraftFilter())}
              />
              <p className="text-[11px] leading-relaxed text-neutral-500">
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
              <p className="text-[11px] leading-relaxed text-neutral-500 rounded-md bg-neutral-50 px-2 py-1.5">
                <strong className="text-violet-800">主口径</strong>：门禁统计清洗总库（通道与「门禁统计清洗」页已启用通道一致；每条纳入记录计 1 次）。
              </p>
              <div className="rounded-lg border border-violet-200/80 bg-white px-2 py-2">
                <AccessChannelMultiSelect
                  variant="inline"
                  selected={(props as IsolationProps).draft.channelCodes}
                  onChange={(channelCodes) =>
                    (props as IsolationProps).onDraftChange(
                      withChannelSelection((props as IsolationProps).draft, channelCodes)
                    )
                  }
                />
                <p className="mt-2 text-[10px] text-violet-800/90 border-t border-violet-100 pt-2">
                  主口径仅按通道筛清洗总库，<strong>不按进出</strong>筛门禁记录。选「全部」将保存为
                  allEnabledChannels，后端解析为全部已启用通道（与各任务通道漏斗并集一致）。
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  数据起始日期（从此日期开始拉取门禁记录）
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={(props as IsolationProps).draft.startDate ?? ""}
                    onChange={(e) => {
                      const iso = props as IsolationProps;
                      iso.onDraftChange({ ...iso.draft, startDate: e.target.value });
                    }}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                  />
                  {(props as IsolationProps).draft.startDate ? (
                    <button
                      type="button"
                      onClick={() => {
                        const iso = props as IsolationProps;
                        iso.onDraftChange({ ...iso.draft, startDate: "" });
                      }}
                      className="shrink-0 text-[10px] text-neutral-400 hover:text-neutral-600"
                    >
                      清除
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-[10px] text-neutral-500">
                  留空则由系统自动判断起始日期；修改后需「更新当前配置并重算」生效
                </p>
              </div>
              <CompareCyclesField
                value={(props as IsolationProps).draft.compareCycles}
                onChange={(compareCycles) =>
                  (props as IsolationProps).onDraftChange({ ...(props as IsolationProps).draft, compareCycles })
                }
              />
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-900">对所有人可见</p>
                  <p className="text-xs text-amber-700">所有可进入后台的用户（STAFF+）均可查看和使用此配置</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={(props as IsolationProps).draft.isPublic === true}
                  onClick={() => {
                    const iso = props as IsolationProps;
                    iso.onDraftChange({ ...iso.draft, isPublic: !iso.draft.isPublic });
                  }}
                  className={`ml-3 shrink-0 inline-flex h-5 w-9 items-center rounded-full border-2 border-transparent transition-colors ${
                    (props as IsolationProps).draft.isPublic ? "bg-amber-500" : "bg-neutral-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      (props as IsolationProps).draft.isPublic ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-neutral-100 bg-neutral-50/80 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {!isCage && (props as IsolationProps).onApplyActive ? (
              <button
                type="button"
                disabled={(props as IsolationProps).applying}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => {
                  (props as IsolationProps).onApplyActive?.();
                }}
              >
                {(props as IsolationProps).applying ? "强制重算中…" : "保存并强制重算全部快照"}
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-medium text-violet-900"
              onClick={onSaveClick}
            >
              <BookmarkPlus className="h-4 w-4" />
              另存为新配置
            </button>
          </div>
          {!isCage ? (
            <p className="text-xs text-neutral-500">
              {(props as IsolationProps).activeViewName ? (
                <>
                  当前选中：<strong>{(props as IsolationProps).activeViewName}</strong>
                  {(props as IsolationProps).activeViewSubscribed ? "（已订阅）" : "（未订阅，请先订阅）"}
                  
                </>
              ) : (
                <>请先在左侧选择或保存统计配置。</>
              )}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>,
    document.body
  );
}
