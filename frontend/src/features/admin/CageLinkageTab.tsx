import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, ChevronRight, Pencil, Trash2 } from "lucide-react";
import {
  listViolationRules,
  deleteViolationRule,
  type ViolationRule,
} from "@/api/domains/studentViolation.api";
import {
  listCageStatusViolations,
  manualTriggerRule,
  type CageStatusViolationRow,
} from "@/api/domains/cageStatusViolation.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import { CageLinkageRuleForm } from "./CageLinkageRuleForm";
import { CageLinkageRecordPanel } from "./CageLinkageRecordPanel";

const JUDGE_MODE_LABEL: Record<string, string> = {
  AUTO_SYNC_LINKED: "同步联动",
  PURE_DAYS: "纯天数",
  PURE_MANUAL: "纯手动",
};

const TRIGGER_ACTION_LABEL: Record<string, string> = {
  VIOLATION_ONLY: "仅违规",
  NOTICE_ONLY: "仅公告",
  BOTH: "两者",
};

export function CageLinkageTab() {
  const qc = useQueryClient();
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<ViolationRule | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ["violation-rules"],
    queryFn: () => listViolationRules(),
  });
  const cageRules = rules.filter((r) => r.sourceTag === "CAGE_STATUS");

  const { data: records = [], isLoading: recsLoading } = useQuery({
    queryKey: ["cage-status-violations"],
    queryFn: () => listCageStatusViolations(),
    refetchInterval: 30_000,
  });

  const handleDeleteRule = (r: ViolationRule) => {
    if (!r.id) return;
    if (!confirm(`确定删除规则「${r.ruleName}」？`)) return;
    deleteViolationRule(r.id)
      .then(() => {
        toast.success("规则已删除");
        qc.invalidateQueries({ queryKey: ["violation-rules"] });
      })
      .catch((e: any) => toast.error(e?.response?.data?.message || e.message || "删除失败"));
  };

  const handleManualTrigger = (ruleId: number) => {
    if (!confirm("确定手动触发此规则的判定？")) return;
    manualTriggerRule(ruleId)
      .then(() => {
        toast.success("手动触发已提交，稍后查看结果");
        qc.invalidateQueries({ queryKey: ["cage-status-violations"] });
      })
      .catch((e: any) => toast.error(e?.response?.data?.message || e.message || "触发失败"));
  };

  return (
    <div className="space-y-6">
      {/* ═══ 规则列表 ═══ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--app-color-text-primary)]">笼架联动规则</h3>
          <AdminButton
            onClick={() => {
              setEditingRule(null);
              setShowRuleForm(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            新建规则
          </AdminButton>
        </div>

        <AdminTableShell
          loading={rulesLoading}
          empty={!rulesLoading && cageRules.length === 0}
          emptyMessage="暂无笼架联动规则，点击「新建规则」创建"
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
                <th className="py-2 px-3">规则名称</th>
                <th className="py-2 px-3">监控状态</th>
                <th className="py-2 px-3">判定模式</th>
                <th className="py-2 px-3">延迟天数</th>
                <th className="py-2 px-3">触发动作</th>
                <th className="py-2 px-3">状态</th>
                <th className="py-2 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {cageRules.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]"
                >
                  <td className="py-2 px-3 font-semibold text-[var(--app-color-text-primary)]">
                    {r.ruleName}
                  </td>
                  <td className="py-2 px-3 text-xs text-[var(--app-color-text-secondary)]">
                    {(r.cageStatusCodes ?? []).join(", ") || "-"}
                  </td>
                  <td className="py-2 px-3 text-xs text-[var(--app-color-text-secondary)]">
                    {JUDGE_MODE_LABEL[r.cageJudgeMode ?? ""] ?? (r.cageJudgeMode ?? "-")}
                  </td>
                  <td className="py-2 px-3 text-xs text-[var(--app-color-text-secondary)]">
                    {r.cageDelayDays ?? "-"} 天
                  </td>
                  <td className="py-2 px-3 text-xs text-[var(--app-color-text-secondary)]">
                    {TRIGGER_ACTION_LABEL[r.cageTriggerAction ?? ""] ?? (r.cageTriggerAction ?? "-")}
                  </td>
                  <td className="py-2 px-3">
                    <span className={r.enabled === 1 ? "text-emerald-600" : "text-[var(--app-color-text-tertiary)]"}>
                      {r.enabled === 1 ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right space-x-1">
                    <AdminButton
                      size="sm"
                      onClick={() => {
                        setEditingRule(r);
                        setShowRuleForm(true);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-0.5" />
                      编辑
                    </AdminButton>
                    {r.cageJudgeMode === "PURE_MANUAL" && (
                      <AdminButton
                        size="sm"
                        tone="secondary"
                        onClick={() => r.id && handleManualTrigger(r.id)}
                      >
                        手动触发
                      </AdminButton>
                    )}
                    <AdminButton
                      size="sm"
                      tone="destructive"
                      onClick={() => handleDeleteRule(r)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-0.5" />
                      删除
                    </AdminButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>
      </div>

      {/* ═══ 父记录列表 ═══ */}
      <div>
        <h3 className="text-sm font-bold text-[var(--app-color-text-primary)] mb-3">
          笼架违规记录
        </h3>

        <AdminTableShell
          loading={recsLoading}
          empty={!recsLoading && records.length === 0}
          emptyMessage="暂无笼架违规记录"
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
                <th className="py-2 px-3">触发时间</th>
                <th className="py-2 px-3">笼位</th>
                <th className="py-2 px-3">状态类型</th>
                <th className="py-2 px-3">课题组</th>
                <th className="py-2 px-3">园区/房间</th>
                <th className="py-2 px-3">状态</th>
                <th className="py-2 px-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => {
                const isExpanded = expandedId === rec.id;
                return (
                  <tr
                    key={rec.id}
                    className={`border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)] cursor-pointer ${isExpanded ? "bg-[var(--app-color-surface-hover)]" : ""}`}
                    onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                  >
                    <td className="py-2 px-3 text-xs text-[var(--app-color-text-secondary)]">
                      {rec.triggeredAt?.slice(0, 16) ?? "-"}
                    </td>
                    <td className="py-2 px-3 font-medium text-[var(--app-color-text-primary)]">
                      {rec.positionLabel}
                    </td>
                    <td className="py-2 px-3 text-xs">{rec.statusCode}</td>
                    <td className="py-2 px-3 text-xs text-[var(--app-color-text-secondary)]">
                      {rec.projectGroupName ?? "-"}
                    </td>
                    <td className="py-2 px-3 text-xs text-[var(--app-color-text-secondary)]">
                      {[rec.campusName, rec.roomName].filter(Boolean).join(" / ") || "-"}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={
                          rec.status === "ACTIVE"
                            ? "text-rose-600 font-medium"
                            : "text-emerald-600"
                        }
                      >
                        {rec.status === "ACTIVE" ? "生效中" : rec.status === "CLEARED" ? "已解除" : "已过期"}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <ChevronRight
                        className={`w-4 h-4 text-[var(--app-color-text-tertiary)] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminTableShell>

        {/* Expanded detail panels rendered outside the table to avoid DOM nesting issues */}
        {records
          .filter((rec) => expandedId === rec.id)
          .map((rec) => (
            <CageLinkageRecordPanel
              key={`detail-${rec.id}`}
              parentId={rec.id}
              onClose={() => setExpandedId(null)}
            />
          ))}
      </div>

      {/* 规则编辑弹窗 */}
      {showRuleForm && (
        <CageLinkageRuleForm
          editing={editingRule}
          onClose={() => {
            setShowRuleForm(false);
            setEditingRule(null);
          }}
        />
      )}
    </div>
  );
}
