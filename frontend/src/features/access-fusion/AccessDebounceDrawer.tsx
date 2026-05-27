import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import {
  getAccessCleanTaskSettings,
  saveAccessCleanTaskSettings,
  type SwingDirectionFilterCode,
} from "@/api/domains/accessFusion.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminRightDrawer } from "@/components/admin/AdminRightDrawer";
import { adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statsTaskId: number;
  taskName?: string;
  isHistoricalTask?: boolean;
  onSaved?: (debounceSeconds: number, autoCleanPackage: number, swingDirectionFilter: SwingDirectionFilterCode) => void;
};

export function AccessDebounceDrawer({
  open,
  onOpenChange,
  statsTaskId,
  taskName,
  isHistoricalTask,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [debounceSeconds, setDebounceSeconds] = useState(45);
  const [autoCleanPackage, setAutoCleanPackage] = useState(1);
  const [swingDirectionFilter, setSwingDirectionFilter] = useState<SwingDirectionFilterCode>("ALL");

  const load = useCallback(async () => {
    if (!statsTaskId) return;
    setLoading(true);
    try {
      const res = await getAccessCleanTaskSettings(statsTaskId);
      setDebounceSeconds(res.debounceSeconds ?? 45);
      setAutoCleanPackage(res.autoCleanPackage ?? (isHistoricalTask ? 0 : 1));
      setSwingDirectionFilter((res.swingDirectionFilter as SwingDirectionFilterCode) ?? "ALL");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [statsTaskId, isHistoricalTask]);

  useEffect(() => {
    if (open && statsTaskId) void load();
  }, [open, statsTaskId, load]);

  const save = async () => {
    if (!statsTaskId) return;
    const sec = Math.max(5, Math.min(3600, debounceSeconds));
    const auto = autoCleanPackage === 1 ? 1 : 0;
    setSaving(true);
    try {
      const direction = (swingDirectionFilter || "ALL") as SwingDirectionFilterCode;
      const res = await saveAccessCleanTaskSettings(statsTaskId, sec, auto, direction);
      setDebounceSeconds(res.debounceSeconds ?? sec);
      setAutoCleanPackage(res.autoCleanPackage ?? auto);
      const savedDir = (res.swingDirectionFilter as SwingDirectionFilterCode) ?? direction;
      setSwingDirectionFilter(savedDir);
      toast.success(
        auto === 1
          ? `已保存：去抖 ${res.debounceSeconds} 秒，进出 ${savedDir}，已开启定时自动清洗打包`
          : `已保存：去抖 ${res.debounceSeconds} 秒，进出 ${savedDir}，仅手动合并`
      );
      onSaved?.(res.debounceSeconds ?? sec, res.autoCleanPackage ?? auto, savedDir);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminRightDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="清洗任务设置"
      description={
        taskName
          ? `任务「${taskName}」：去抖与是否参与定时自动清洗打包。落库后仍可在前台试算并人工纠正纳入/排除、方向等标签。`
          : "任务级去抖与定时自动打包开关。"
      }
      footer={
        <div className="flex justify-end gap-2 w-full">
          <AdminButton tone="secondary" onClick={() => onOpenChange(false)}>
            取消
          </AdminButton>
          <AdminButton disabled={saving || loading || !statsTaskId} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存
          </AdminButton>
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center py-16 text-sm text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <label className="block max-w-xs">
            <span className={adminLabelClass}>进出筛选（清洗规则）</span>
            <select
              className={`${adminInputClass} mt-1 w-full`}
              value={swingDirectionFilter}
              onChange={(e) => setSwingDirectionFilter(e.target.value as SwingDirectionFilterCode)}
            >
              <option value="ALL">全部</option>
              <option value="ENTER">仅进入</option>
              <option value="EXIT">仅离开</option>
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              单门双向通道请选「全部」；按大华拉取的 enter/exit 区分进/出。门规则可设为「大华进出」推断方向。
            </p>
          </label>

          <label className="block max-w-xs">
            <span className={adminLabelClass}>去抖间隔（秒）</span>
            <input
              type="number"
              min={5}
              max={3600}
              step={5}
              className={`${adminInputClass} mt-1 w-full`}
              value={debounceSeconds}
              onChange={(e) => setDebounceSeconds(Number(e.target.value))}
            />
          </label>

          <label className="flex items-start gap-2 rounded-lg border bg-slate-50 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 rounded"
              checked={autoCleanPackage === 1}
              onChange={(e) => setAutoCleanPackage(e.target.checked ? 1 : 0)}
            />
            <span className="text-xs text-slate-700 leading-relaxed">
              <strong>定时自动清洗并打包落库</strong>
              <br />
              开启后，定时任务「门禁统计·自动入库总库」(
              <code className="text-[10px]">ACCESS_CLEAN_PACKAGE_DAILY</code>){" "}
              仅合并<strong>游标之后</strong>的新刷卡；已落库行保留人工标签，可随时再编辑。
              {isHistoricalTask ? (
                <span className="block mt-1 text-amber-800">
                  历史回溯数据量大，建议关闭，首次算完后手动「增量合并保存」一次即可。
                </span>
              ) : null}
            </span>
          </label>

          <p className="text-xs text-slate-500 leading-relaxed">
            建议日常/昨日任务开启自动打包；历史回溯关闭，避免每次定时任务重复重算全量历史。
          </p>
        </div>
      )}
    </AdminRightDrawer>
  );
}
