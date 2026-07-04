import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { BarChart3, LineChart, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createTelemetryChartGroup,
  deleteTelemetryChartGroup,
  fetchTelemetryChartGroups,
  updateTelemetryChartGroup,
  type TelemetryChartGroup,
} from "@/api/domains/telemetryInsights.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminCenteredPanelShell } from "@/components/admin/AdminCenteredPanelShell";
import { AdminDataTableWrap, AdminPageShell } from "@/components/admin/AdminPageShell";
import {
  buildVariableMetadataFromCatalog,
  displayLabelForVariable,
} from "@/features/telemetry-insights/buildWatchlistVariableCatalog";
import { TelemetryVariablePicker } from "@/features/telemetry-insights/TelemetryVariablePicker";
import { useWatchlistVariableCatalog } from "@/features/telemetry-insights/useWatchlistVariableCatalog";

const GROUPS_KEY = ["admin", "telemetry-insights", "chart-groups"] as const;

type GroupDraft = {
  id?: number;
  name: string;
  description: string;
  layoutMode: "small_multiples" | "normalized_deviation";
  variableNames: string[];
};

function emptyDraft(): GroupDraft {
  return { name: "", description: "", layoutMode: "small_multiples", variableNames: [] };
}

export default function AdminTelemetryInsightsConfigPage() {
  const qc = useQueryClient();
  const { catalog, isLoading: catalogLoading, isError: catalogError } = useWatchlistVariableCatalog();
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<GroupDraft>(() => emptyDraft());

  const groupsQ = useQuery({
    queryKey: GROUPS_KEY,
    queryFn: fetchTelemetryChartGroups,
  });

  const manualGroups = useMemo(
    () => (groupsQ.data ?? []).filter((g) => g.source !== "auto_suite").sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [groupsQ.data]
  );

  const openCreate = useCallback(() => {
    setDraft(emptyDraft());
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((group: TelemetryChartGroup) => {
    setDraft({
      id: group.id,
      name: group.name,
      description: group.description ?? "",
      layoutMode: (group.layoutMode as GroupDraft["layoutMode"]) || "small_multiples",
      variableNames: [...(group.variableNames ?? [])],
    });
    setEditorOpen(true);
  }, []);

  const saveM = useMutation({
    mutationFn: async (body: GroupDraft) => {
      const variableMetadata = buildVariableMetadataFromCatalog(body.variableNames, catalog);
      const payload: TelemetryChartGroup = {
        name: body.name.trim(),
        description: body.description.trim() || null,
        variableNames: body.variableNames,
        variableMetadata,
        layoutMode: body.layoutMode,
        source: "manual",
        sortOrder: body.id != null ? undefined : (manualGroups.length + 1) * 10,
      };
      if (body.id != null) {
        return updateTelemetryChartGroup(body.id, { ...payload, id: body.id });
      }
      return createTelemetryChartGroup(payload);
    },
    onSuccess: (saved, vars) => {
      // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
      qc.setQueryData<TelemetryChartGroup[]>(GROUPS_KEY, (old) => {
        if (!old) return [saved];
        if (vars.id != null) {
          return old.map((g) => (g.id === saved.id ? saved : g));
        }
        return [...old, saved];
      });
      setEditorOpen(false);
      toast.success(vars.id != null ? "对比组已更新" : "对比组已创建");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => deleteTelemetryChartGroup(id),
    onSuccess: (_void, id) => {
      qc.setQueryData<TelemetryChartGroup[]>(GROUPS_KEY, (old) => (old ? old.filter((g) => g.id !== id) : []));
      toast.success("已删除对比组");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = draft.name.trim().length > 0 && draft.variableNames.length > 0;

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <LineChart className="h-5 w-5 text-[var(--app-color-accent-primary)]" />
          遥测对比组配置
        </span>
      }
      description="从 WinCC 变量导入目录选择变量，按楼层、分区前缀与指标类型组织对比组。图表页仅展示此处配置的组。"
      actions={
        <>
          <Link
            to="/admin/telemetry-insights"
            className="inline-flex items-center rounded-[length:var(--admin-radius-md,0.375rem)] border-2 border-[var(--app-color-border-strong)] bg-[var(--app-color-surface-container)] px-3 py-1.5 text-sm font-medium text-[var(--app-color-text-primary)] shadow-sm hover:bg-[var(--app-color-surface-hover)]"
          >
            <BarChart3 className="mr-1 h-4 w-4" />
            返回分析页
          </Link>
          <AdminButton onClick={openCreate} disabled={catalogLoading || catalogError}>
            <Plus className="mr-1 h-4 w-4" />
            新建对比组
          </AdminButton>
        </>
      }
    >
      {catalogError ? (
        <AdminDataTableWrap className="p-4 text-sm text-[var(--app-color-status-danger)]">
          无法加载变量目录，请确认「WinCC 变量导入」可访问。
        </AdminDataTableWrap>
      ) : null}

      <AdminDataTableWrap className="overflow-hidden">
        {groupsQ.isPending ? (
          <div className="p-6 text-sm text-[var(--app-color-text-muted)]">加载对比组…</div>
        ) : manualGroups.length === 0 ? (
          <div className="space-y-2 p-6 text-sm text-[var(--app-color-text-muted)]">
            <p>尚未配置对比组。</p>
            <p>点击「新建对比组」，从 watchlist 目录多选变量后保存；分析页将按组绘制曲线。</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-raised)] text-left text-xs text-[var(--app-color-text-muted)]">
                <th className="px-4 py-2 font-medium">组名</th>
                <th className="px-4 py-2 font-medium">变量数</th>
                <th className="px-4 py-2 font-medium">布局</th>
                <th className="px-4 py-2 font-medium">变量预览</th>
                <th className="px-4 py-2 font-medium w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {manualGroups.map((g) => (
                <tr key={g.id} className="border-b border-[var(--app-color-border-subtle)] hover:bg-[var(--app-color-surface-raised)]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--app-color-text-primary)]">{g.name}</div>
                    {g.description ? (
                      <div className="text-xs text-[var(--app-color-text-muted)]">{g.description}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{g.variableNames?.length ?? 0}</td>
                  <td className="px-4 py-3 text-xs">{g.layoutMode}</td>
                  <td className="max-w-md px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(g.variableNames ?? []).slice(0, 4).map((vn) => (
                        <span
                          key={vn}
                          className="rounded-[var(--app-radius-control)] bg-[var(--app-color-surface-page)] px-1.5 py-0.5 text-[10px] text-[var(--app-color-text-secondary)]"
                          title={vn}
                        >
                          {displayLabelForVariable(vn, g.variableMetadata, catalog)}
                        </span>
                      ))}
                      {(g.variableNames?.length ?? 0) > 4 ? (
                        <span className="text-[10px] text-[var(--app-color-text-muted)]">
                          +{(g.variableNames?.length ?? 0) - 4}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(g)}
                        className="rounded-[var(--app-radius-control)] p-1.5 text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-page)]"
                        aria-label="编辑"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {g.id != null ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`删除对比组「${g.name}」？`)) deleteM.mutate(g.id!);
                          }}
                          className="rounded-[var(--app-radius-control)] p-1.5 text-[var(--app-color-status-danger)] hover:bg-[var(--app-color-surface-page)]"
                          aria-label="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminDataTableWrap>

      <AdminCenteredPanelShell
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        ariaLabel={draft.id != null ? "编辑对比组" : "新建对比组"}
        title={draft.id != null ? "编辑对比组" : "新建对比组"}
        className="max-w-[min(720px,96vw)]"
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-[var(--app-color-text-secondary)]">组名</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-color-border-default)] px-2 py-1.5 text-sm"
              placeholder="如 B1F 风机套间对比"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-[var(--app-color-text-secondary)]">说明（可选）</span>
            <input
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-color-border-default)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-[var(--app-color-text-secondary)]">布局模式</span>
            <select
              value={draft.layoutMode}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  layoutMode: e.target.value as GroupDraft["layoutMode"],
                }))
              }
              className="rounded-[var(--app-radius-control)] border border-[var(--app-color-border-default)] px-2 py-1.5 text-sm"
            >
              <option value="small_multiples">Small Multiples（按温/湿/压分行）</option>
              <option value="normalized_deviation">归一化偏差</option>
            </select>
          </label>

          {catalogLoading ? (
            <div className="text-xs text-[var(--app-color-text-muted)]">加载变量目录…</div>
          ) : (
            <TelemetryVariablePicker
              catalog={catalog}
              selected={draft.variableNames}
              onChange={(variableNames) => setDraft((d) => ({ ...d, variableNames }))}
              disabled={saveM.isPending}
            />
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
          <AdminButton tone="secondary" onClick={() => setEditorOpen(false)}>
            取消
          </AdminButton>
          <AdminButton loading={saveM.isPending} disabled={!canSave} onClick={() => saveM.mutate(draft)}>
            保存
          </AdminButton>
        </div>
      </AdminCenteredPanelShell>
    </AdminPageShell>
  );
}
