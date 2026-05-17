import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CompareCyclesField } from "@/features/analytics/components/CompareCyclesField";
import {
  defaultBackfillUntilDate,
  HistoryBackfillField,
} from "@/features/analytics/components/HistoryBackfillField";
import type { AnalyticsCompareCycle } from "@/features/analytics/analyticsPipelineFilter";

export type SaveConfigOptions = {
  name: string;
  compareCycles: AnalyticsCompareCycle[];
  subscribe: boolean;
  backfillHistory: boolean;
  backfillUntil: string;
};

type Props = {
  open: boolean;
  initialCompareCycles: AnalyticsCompareCycle[];
  onClose: () => void;
  onConfirm: (opts: SaveConfigOptions) => Promise<void>;
};

export function SaveAnalyticsConfigModal({
  open,
  initialCompareCycles,
  onClose,
  onConfirm,
}: Props) {
  const [name, setName] = useState("");
  const [compareCycles, setCompareCycles] = useState<AnalyticsCompareCycle[]>(initialCompareCycles);
  const [subscribe, setSubscribe] = useState(false);
  const [backfillHistory, setBackfillHistory] = useState(false);
  const [backfillUntil, setBackfillUntil] = useState(defaultBackfillUntilDate);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCompareCycles(initialCompareCycles.length ? initialCompareCycles : ["day"]);
      setBackfillUntil(defaultBackfillUntilDate());
    }
  }, [open, initialCompareCycles]);

  useEffect(() => {
    if (!subscribe) {
      setBackfillHistory(false);
    }
  }, [subscribe]);

  if (!open) return null;

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || !compareCycles.length) return;
    if (backfillHistory && !backfillUntil) return;
    setSaving(true);
    try {
      await onConfirm({
        name: trimmed,
        compareCycles,
        subscribe,
        backfillHistory: subscribe && backfillHistory,
        backfillUntil,
      });
      setName("");
      setSubscribe(false);
      setBackfillHistory(false);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-neutral-900">保存统计配置</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
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
          <CompareCyclesField value={compareCycles} onChange={setCompareCycles} />
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-300 text-violet-600"
              checked={subscribe}
              onChange={(e) => setSubscribe(e.target.checked)}
            />
            <span className="text-sm text-neutral-800">保存后立即订阅（每日自动清算）</span>
          </label>
          <HistoryBackfillField
            enabled={backfillHistory}
            onEnabledChange={setBackfillHistory}
            untilDate={backfillUntil}
            onUntilDateChange={setBackfillUntil}
            disabled={!subscribe}
          />
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
              (backfillHistory && subscribe && !backfillUntil)
            }
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void handleSubmit()}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
