import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Search } from "lucide-react";
import {
  listAccessChannelScope,
  replaceAccessChannelScope,
  suggestAccessChannelScope,
  type AccessChannelScopeRow,
  type ChannelScopeSuggestion,
} from "@/api/domains/accessFusion.api";
import { fetchDahuaDeviceChannels, type DahuaDeviceChannelRow } from "@/api/twinApi";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminRightDrawer } from "@/components/admin/AdminRightDrawer";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statsTaskId: number;
  taskName?: string;
  onSaved?: () => void;
};

type PickRow = { channelCode: string; channelName?: string };

export function AccessChannelScopeDrawer({ open, onOpenChange, statsTaskId, taskName, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<PickRow[]>([]);
  const [suggestions, setSuggestions] = useState<ChannelScopeSuggestion[]>([]);
  const [deviceKw, setDeviceKw] = useState("");
  const [deviceOptions, setDeviceOptions] = useState<DahuaDeviceChannelRow[]>([]);

  const selectedSet = useMemo(() => new Set(selected.map((s) => s.channelCode)), [selected]);

  const load = useCallback(async () => {
    if (!statsTaskId) return;
    setLoading(true);
    try {
      const [scope, sug] = await Promise.all([
        listAccessChannelScope(statsTaskId),
        suggestAccessChannelScope(statsTaskId),
      ]);
      setSelected(
        scope.map((r: AccessChannelScopeRow) => ({
          channelCode: r.channelCode,
          channelName: r.channelName,
        }))
      );
      setSuggestions(sug);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载漏斗失败");
    } finally {
      setLoading(false);
    }
  }, [statsTaskId]);

  useEffect(() => {
    if (open && statsTaskId) void load();
  }, [open, statsTaskId, load]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await fetchDahuaDeviceChannels({
          page: 1,
          pageSize: 80,
          keyword: deviceKw.trim(),
        });
        setDeviceOptions(res.list || []);
      } catch {
        setDeviceOptions([]);
      }
    })();
  }, [open, deviceKw]);

  const toggle = (row: PickRow) => {
    setSelected((prev) => {
      if (prev.some((p) => p.channelCode === row.channelCode)) {
        return prev.filter((p) => p.channelCode !== row.channelCode);
      }
      return [...prev, row];
    });
  };

  const save = async () => {
    if (!statsTaskId) return;
    setSaving(true);
    try {
      await replaceAccessChannelScope(statsTaskId, selected);
      toast.success(`已保存 ${selected.length} 个通道`);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const addAllSuggestions = () => {
    setSelected((prev) => {
      const map = new Map(prev.map((p) => [p.channelCode, p]));
      for (const s of suggestions) {
        if (s.channelCode) {
          map.set(s.channelCode, {
            channelCode: s.channelCode,
            channelName: s.channelName,
          });
        }
      }
      return Array.from(map.values());
    });
  };

  return (
    <AdminRightDrawer
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="通道漏斗"
      description={
        taskName
          ? `任务「${taskName}」：仅拉取记录中属于下列通道的数据参与试算与数据包；未纳入通道的记录不会显示。`
          : "仅纳入白名单通道的记录会参与清洗试算与数据包。"
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">已选 {selected.length} 个通道</span>
          <div className="flex gap-2">
            <AdminButton tone="secondary" onClick={() => onOpenChange(false)}>
              取消
            </AdminButton>
            <AdminButton disabled={saving || loading} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              保存漏斗
            </AdminButton>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">加载中…</div>
      ) : (
        <div className="space-y-4 text-xs">
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((ch) => (
                <button
                  key={ch.channelCode}
                  type="button"
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-900"
                  onClick={() => toggle(ch)}
                  title="点击移除"
                >
                  {ch.channelName || ch.channelCode}
                  <span className="ml-1 text-indigo-400">×</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              尚未配置通道。请从下方任务记录或设备库中勾选需要清洗的通道。
            </p>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">本任务已有记录（推荐）</h3>
              {suggestions.length > 0 ? (
                <button type="button" className="text-indigo-700 underline" onClick={addAllSuggestions}>
                  全选
                </button>
              ) : null}
            </div>
            <div className="max-h-40 overflow-auto rounded border divide-y">
              {suggestions.length === 0 ? (
                <p className="p-3 text-slate-400">暂无拉取记录，请先从设备库添加</p>
              ) : (
                suggestions.map((s) => (
                  <label
                    key={s.channelCode}
                    className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-slate-50"
                  >
                    <AdminSwitchScaled
                      size="3.5"
                      checked={selectedSet.has(s.channelCode)}
                      onChange={() =>
                        toggle({
                          channelCode: s.channelCode,
                          channelName: s.channelName,
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {s.channelName || s.channelCode}
                      <span className="ml-1 text-slate-400">({s.recordCount ?? 0} 条)</span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-slate-800">设备通道库</h3>
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                className="h-8 w-full rounded border pl-7 pr-2"
                placeholder="搜索通道名称/编码"
                value={deviceKw}
                onChange={(e) => setDeviceKw(e.target.value)}
              />
            </div>
            <div className="max-h-48 overflow-auto rounded border divide-y">
              {deviceOptions.map((ch) => {
                const code = (ch.channelCode || "").trim();
                if (!code) return null;
                return (
                  <label
                    key={ch.id ?? code}
                    className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-slate-50"
                  >
                    <AdminSwitchScaled
                      size="3.5"
                      checked={selectedSet.has(code)}
                      onChange={() =>
                        toggle({
                          channelCode: code,
                          channelName: ch.channelName,
                        })
                      }
                    />
                    <span className="truncate">
                      {ch.channelName || "未命名"} / {code}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </AdminRightDrawer>
  );
}

