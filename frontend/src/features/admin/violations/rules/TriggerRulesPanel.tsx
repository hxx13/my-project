import { useState } from "react";
import type { JSX } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteViolationRule,
  listViolationRules,
  UNBLOCK_METHOD_LABEL,
} from "@/api/domains/studentViolation.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import { ListPageLayout } from "../shared/ListPageLayout";
import { detectCategory } from "./ruleCategories";
import { TriggerRuleEditor } from "./TriggerRuleEditor";

import { appConfirm } from "@/lib/appDialog";
/** 触发规则面板：通用规则（含解禁管控）的列表 + 新建入口；编辑进入 TriggerRuleEditor 子视图。 */
export function TriggerRulesPanel(): JSX.Element {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["violation-rules"],
    queryFn: () => listViolationRules(),
  });
  // 触发规则面板只管「通用规则」；笼架规则（CAGE_STATUS）由 CageRulePanel 负责，不混入列表。
  const triggerRules = rules.filter((r) => r.sourceTag !== "CAGE_STATUS");

  const deleteMu = useMutation({
    mutationFn: deleteViolationRule,
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["violation-rules"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e.message || "删除失败"),
  });

  if (creating) {
    return (
      <TriggerRuleEditor
        ruleId={null}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["violation-rules"] });
          setCreating(false);
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  if (editingId != null) {
    return (
      <TriggerRuleEditor
        ruleId={editingId}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["violation-rules"] });
          setEditingId(null);
        }}
        onCancel={() => setEditingId(null)}
      />
    );
  }

  const toolbar = (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-bold text-[var(--app-color-text-primary)]">
        触发规则
      </h3>
      <AdminButton onClick={() => setCreating(true)}>
        <Plus className="mr-1 h-4 w-4" />
        新建规则
      </AdminButton>
    </div>
  );

  return (
    <ListPageLayout toolbar={toolbar}>
      <AdminTableShell
        loading={isLoading}
        empty={!isLoading && triggerRules.length === 0}
        emptyMessage="暂无触发规则"
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
              <th className="px-3 py-2">规则名称</th>
              <th className="px-3 py-2" title="自动生成">编码</th>
              <th className="px-3 py-2">对应类型</th>
              <th className="px-3 py-2">解禁方式</th>
              <th className="px-3 py-2">上限次数</th>
              <th className="px-3 py-2">窗口</th>
              <th className="px-3 py-2">启用</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {triggerRules.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]"
              >
                <td className="px-3 py-2 font-semibold text-[var(--app-color-text-primary)]">{r.ruleName}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-[var(--app-color-text-tertiary)]" title="自动生成">
                  {r.ruleCode}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--app-color-text-secondary)]">
                  {detectCategory(r.sourceTag)}
                </td>
                <td className="px-3 py-2">
                  {UNBLOCK_METHOD_LABEL[r.unblockMethod] || r.unblockMethod}
                </td>
                <td className="px-3 py-2">
                  {r.unblockMaxCount != null ? r.unblockMaxCount : "不限"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.unblockWindowType === "滑动窗口"
                    ? `最近 ${r.unblockWindowValue ?? 30} 天`
                    : r.unblockWindowStart && r.unblockWindowEnd
                      ? `${r.unblockWindowStart} ~ ${r.unblockWindowEnd}`
                      : "未配置"}
                </td>
                <td className="px-3 py-2">{r.enabled ? "✅" : "⏸"}</td>
                <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                  <AdminButton size="sm" onClick={() => setEditingId(r.id ?? null)}>
                    <Pencil className="mr-0.5 h-3.5 w-3.5" />
                    编辑
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    tone="destructive"
                    onClick={async () => {
                      if (await appConfirm(`确定删除规则「${r.ruleName}」？`)) {
                        deleteMu.mutate(r.id!);
                      }
                    }}
                  >
                    <Trash2 className="mr-0.5 h-3.5 w-3.5" />
                    删除
                  </AdminButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </ListPageLayout>
  );
}
