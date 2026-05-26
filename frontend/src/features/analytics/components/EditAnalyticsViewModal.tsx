import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AnalyticsPipelineFilterBar } from "@/features/analytics/AnalyticsPipelineFilterBar";
import { CageAnalyticsScopeFilterBar } from "@/features/analytics/CageAnalyticsScopeFilterBar";
import { CompareCyclesField } from "@/features/analytics/components/CompareCyclesField";
import {
  defaultBackfillUntilDate,
  HistoryBackfillField,
} from "@/features/analytics/components/HistoryBackfillField";
import {
  defaultAnalyticsDraftFilter,
  migrateAnalyticsFilter,
  scopeFilterOnly,
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
  const [backfillHistory, setBackfillHistory] = useState(false);
  const [backfillUntil, setBackfillUntil] = useState(defaultBackfillUntilDate);

  useEffect(() => {
    if (view && open) {
      setName(view.name);
      const raw = view.filter as Record<string, unknown>;
      if (isCage) {
        setCageFilters(migrateCageAnalyticsFilter(raw));
      } else {
        setIsoFilters(migrateAnalyticsFilter(raw));
      }
      setSubscribed(view.subscribed);
      setBackfillHistory(false);
      setBackfillUntil(defaultBackfillUntilDate());
    }
  }, [view, open, isCage]);

  useEffect(() => {
    if (!subscribed) setBackfillHistory(false);
  }, [subscribed]);

  if (!open || !view) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-neutral-900">编辑统计配置</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto p-4">
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
            <AnalyticsPipelineFilterBar
              filters={isoFilters}
              onChange={setIsoFilters}
              onClear={() => setIsoFilters(defaultAnalyticsDraftFilter())}
            />
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
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-300 text-violet-600"
              checked={subscribed}
              onChange={(e) => setSubscribed(e.target.checked)}
            />
            <span className="text-sm text-neutral-800">
              {isCage ? "订阅此配置（自动落库快照并环比）" : "订阅此配置（每日自动清算）"}
            </span>
          </label>
          {!isCage ? (
            <HistoryBackfillField
              enabled={backfillHistory}
              onEnabledChange={setBackfillHistory}
              untilDate={backfillUntil}
              onUntilDateChange={setBackfillUntil}
              disabled={!subscribed}
            />
          ) : (
            <p className="text-[11px] leading-relaxed text-neutral-500">
              笼架占用按日/周/月自动抓取 ARO 快照并环比；不支持历史回溯，订阅后将立即生成当前周期快照。
            </p>
          )}
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
                void (props as IsolationProps).onSave(
                  view.id,
                  name.trim(),
                  scopeFilterOnly(isoFilters),
                  subscribed,
                  backfillHistory,
                  backfillUntil
                );
              }
            }}
          >
            保存修改
          </button>
        </div>
      </div>
    </div>
  );
}
