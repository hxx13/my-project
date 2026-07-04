import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AccessChannelMultiSelect } from "@/features/analytics/AccessChannelMultiSelect";
import { CageAnalyticsScopeFilterBar } from "@/features/analytics/CageAnalyticsScopeFilterBar";
import { CompareCyclesField } from "@/features/analytics/components/CompareCyclesField";
import {
  defaultAnalyticsDraftFilter,
  draftFromSavedFilter,
  scopeFilterOnly,
  withChannelSelection,
  type AnalyticsDraftFilter,
} from "@/features/analytics/analyticsPipelineFilter";
import {
  cageScopeFilterOnly,
  defaultCageAnalyticsDraftFilter,
  migrateCageAnalyticsFilter,
  type CageAnalyticsDraftFilter,
} from "@/features/analytics/cageAnalyticsFilter";
import type { AnalyticsUserView } from "@/api/domains/analytics.api";

type IsolationProps = {
  reportKey?: string;
  view: AnalyticsUserView | null;
  open: boolean;
  onClose: () => void;
  onSave: (
    id: number,
    name: string,
    filter: Record<string, unknown>,
    subscribed: boolean,
    backfillHistory: boolean,
    backfillUntil: string
  ) => Promise<void>;
};

type CageProps = {
  reportKey: "cage_occupancy";
  view: AnalyticsUserView | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: number, name: string, filter: Record<string, unknown>, subscribed: boolean) => Promise<void>;
};

type Props = IsolationProps | CageProps;

export function EditAnalyticsViewModal(props: Props) {
  const { view, open, onClose } = props;
  const isCage = props.reportKey === "cage_occupancy";

  const [name, setName] = useState("");
  const [isoFilters, setIsoFilters] = useState<AnalyticsDraftFilter>(() => defaultAnalyticsDraftFilter());
  const [cageFilters, setCageFilters] = useState<CageAnalyticsDraftFilter>(() => defaultCageAnalyticsDraftFilter());
  const [subscribed, setSubscribed] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    if (view && open) {
      setName(view.name);
      const raw = view.filter as Record<string, unknown>;
      if (isCage) {
        setCageFilters(migrateCageAnalyticsFilter(raw));
      } else {
        setIsoFilters(draftFromSavedFilter(raw));
      }
      setSubscribed(view.subscribed);
      setIsPublic((view.filter as Record<string, any>)?.isPublic === true);
    }
  }, [view, open, isCage, view?.filter]);

  if (!open || !view) return null;

  return ReactDOM.createPortal(
    <div
      data-modal-layer="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        key={view.id}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-neutral-900">编辑统计配置</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div data-modal-scroll className="space-y-4 overflow-y-auto p-4">
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="配置名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {isCage ? (
            <CageAnalyticsScopeFilterBar
              filters={cageFilters}
              onChange={setCageFilters}
              onClear={() => setCageFilters(defaultCageAnalyticsDraftFilter())}
            />
          ) : (
            <>
              <p className="text-[11px] text-neutral-500">
                主口径：清洗总库（仅通道，不按进出筛门禁）。
              </p>
              <AccessChannelMultiSelect
                selected={isoFilters.channelCodes}
                onChange={(channelCodes) => setIsoFilters(withChannelSelection(isoFilters, channelCodes))}
              />
            </>
          )}
          <CompareCyclesField
            value={isCage ? cageFilters.compareCycles : isoFilters.compareCycles}
            onChange={(compareCycles) =>
              isCage
                ? setCageFilters({ ...cageFilters, compareCycles })
                : setIsoFilters({ ...isoFilters, compareCycles })
            }
          />
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2">
            <AdminSwitchScaled size="sm" checked={subscribed} onChange={setSubscribed} />
            <span className="text-sm text-neutral-800">
              {isCage ? "订阅此配置（自动落库快照并环比）" : "订阅此配置（每日自动清算）"}
            </span>
          </label>
          {!isCage ? (
            <p className="text-[11px] leading-relaxed text-neutral-500 rounded-md bg-neutral-50 px-2 py-1.5">
              历史回溯仅在首次创建配置时可用。如需重新回溯，请使用统计页面的「强制重算全部快照」按钮。
            </p>
          ) : (
            <p className="text-[11px] leading-relaxed text-neutral-500">
              笼架占用按日/周/月自动抓取 ARO 快照并环比；不支持历史回溯，订阅后将立即生成当前周期快照。
            </p>
          )}
          {!isCage ? (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
              <AdminSwitchScaled size="sm" checked={isPublic} onChange={setIsPublic} />
              <span className="text-sm text-amber-900">
                对所有人可见（STAFF+ 角色用户均可查看和使用此配置）
              </span>
            </label>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              if (isCage) {
                void (props as CageProps).onSave(
                  view.id,
                  name.trim(),
                  cageScopeFilterOnly(cageFilters),
                  subscribed
                );
              } else {
                const filter = scopeFilterOnly(isoFilters);
                if (isPublic) (filter as any).isPublic = true;
                void (props as IsolationProps).onSave(
                  view.id,
                  name.trim(),
                  filter,
                  subscribed,
                  false,  // edit never triggers backfill
                  ""      // no backfill date
                );
              }
            }}
          >
            保存修改
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
