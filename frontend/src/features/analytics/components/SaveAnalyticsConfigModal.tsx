import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AccessChannelMultiSelect } from "@/features/analytics/AccessChannelMultiSelect";
import { CompareCyclesField } from "@/features/analytics/components/CompareCyclesField";
import {
  withChannelSelection,
  type AnalyticsCompareCycle,
  type AnalyticsDraftFilter,
} from "@/features/analytics/analyticsPipelineFilter";

export type SaveConfigOptions = {
  name: string;
  compareCycles: AnalyticsCompareCycle[];
  subscribe: boolean;
  backfillUntil: string; // always effective when subscribe is true
  isPublic?: boolean;
};

type Props = {
  open: boolean;
  initialCompareCycles: AnalyticsCompareCycle[];
  /** 隔离服可回溯历史；笼架占用仅落库当前周期快照 */
  enableHistoryBackfill?: boolean;
  subscribeHint?: string;
  /** 通道选择草稿（仅隔离服使用，enableHistoryBackfill 为 true 时生效） */
  draft?: AnalyticsDraftFilter;
  onDraftChange?: (next: AnalyticsDraftFilter) => void;
  onClose: () => void;
  onConfirm: (opts: SaveConfigOptions) => Promise<void>;
};

export function SaveAnalyticsConfigModal({
  open,
  initialCompareCycles,
  enableHistoryBackfill = true,
  subscribeHint,
  draft,
  onDraftChange,
  onClose,
  onConfirm,
}: Props) {
  const defaultBackfillDate = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();
  const [name, setName] = useState("");
  const [compareCycles, setCompareCycles] = useState<AnalyticsCompareCycle[]>(initialCompareCycles);
  const [subscribe, setSubscribe] = useState(false);
  const [backfillUntil, setBackfillUntil] = useState(defaultBackfillDate);
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCompareCycles(initialCompareCycles.length ? initialCompareCycles : ["day"]);
      setBackfillUntil(defaultBackfillDate);
      setIsPublic(false);
    }
  }, [open, initialCompareCycles]);

  if (!open) return null;

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || !compareCycles.length) return;
    if (subscribe && !backfillUntil) return;
    setSaving(true);
    try {
      await onConfirm({
        name: trimmed,
        compareCycles,
        subscribe,
        backfillUntil,
        isPublic,
      });
      setName("");
      setSubscribe(false);
      setIsPublic(false);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return ReactDOM.createPortal(
    <div
      data-modal-layer="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-modal-scroll
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-neutral-900">保存统计配置</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-accent hover:bg-accent/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-600">配置名称</label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="例如：浦东 E11 进入统计"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {enableHistoryBackfill && draft && onDraftChange ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">通道选择</label>
              <div className="rounded-lg border border-violet-200/80 bg-white px-2 py-2">
                <AccessChannelMultiSelect
                  variant="inline"
                  selected={draft.channelCodes}
                  onChange={(channelCodes) => onDraftChange(withChannelSelection(draft, channelCodes))}
                />
              </div>
              <p className="mt-1 text-[10px] text-violet-800/90">
                选「全部」将保存为全部已启用通道。后续可在编辑中修改。
              </p>
            </div>
          ) : null}
          <CompareCyclesField value={compareCycles} onChange={setCompareCycles} />
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2">
            <AdminSwitchScaled size="sm" checked={subscribe} onChange={setSubscribe} />
            <span className="text-sm text-neutral-800">
              {subscribeHint ?? "保存后立即订阅（每日自动清算）"}
            </span>
          </label>
          {enableHistoryBackfill ? (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50/80 p-3">
              <p className="text-xs font-semibold text-neutral-700 mb-2">
                历史数据回溯
              </p>
              <p className="text-[11px] text-neutral-500 mb-2">
                新配置将从起始日期回溯拉取历史门禁记录，生成全部历史快照。不会删除已有快照。
              </p>
              <label className="block text-xs text-neutral-600">
                回溯截止日期（留空使用配置中的起始日期 + 当前日期）
                <input
                  type="date"
                  value={backfillUntil}
                  onChange={(e) => setBackfillUntil(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                />
              </label>
            </div>
          ) : null}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
            <AdminSwitchScaled size="sm" checked={isPublic} onChange={setIsPublic} />
            <span className="text-sm text-amber-900">
              对所有人可见（STAFF+ 角色用户均可查看和使用此配置）
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={
              saving ||
              !name.trim() ||
              !compareCycles.length ||
              (enableHistoryBackfill && subscribe && !backfillUntil)
            }
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void handleSubmit()}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
