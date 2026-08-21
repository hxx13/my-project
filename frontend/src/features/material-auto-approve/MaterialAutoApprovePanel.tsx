import { authQueryKey } from "@/features/auth/authQueryScope";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  deleteMaterialBatchRule,
  deleteMaterialTrustRule,
  fetchMaterialAutoApproveCandidates,
  fetchMaterialBatchRules,
  fetchMaterialTrustRules,
  runMaterialAutoApproveNow,
  saveMaterialBatchRule,
  saveMaterialTrustRule,
  type MaterialAutoApproveCandidate,
  type MaterialBatchRule,
  type MaterialTrustRule,
} from "@/api/domains/materialAutoApprove.api";
import { fetchAdminMaterialItems, type MaterialItem } from "@/api/domains/material.api";
import { AdminCenteredPanelShell } from "@/components/admin/AdminCenteredPanelShell";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import {
  AutoApproveCandidateSelect,
  type AutoApproveCandidate,
} from "@/features/auto-approve/AutoApproveCandidateSelect";
import { AutoApproveDailyTimeField } from "@/features/auto-approve/AutoApproveDailyTimeField";
import { formatDailyScheduleLabel } from "@/features/auto-approve/scheduleTime";

import { appConfirm } from "@/lib/appDialog";
type TabKey = "trust" | "batch";

type Props = {
  open: boolean;
  onClose: () => void;
};

const emptyTrustForm = (): Partial<MaterialTrustRule> & { selectedKey?: string } => ({
  subjectUserId: "",
  itemId: 0,
  enabled: true,
  triggerMode: "ON_SUBMIT",
  scheduleCron: "0 0 9 * * *",
  note: "",
  selectedKey: "",
});

const emptyBatchForm = (): Partial<MaterialBatchRule> => ({
  name: "批量自动审批",
  itemIds: [],
  enabled: true,
  scheduleCron: "0 0 9 * * *",
  maxPerRun: 20,
  onlyIfReviewerMatch: true,
});

function candidateKey(c: { subjectUserId: string; itemId: number }) {
  return `${c.subjectUserId}:${c.itemId}`;
}

function toUiCandidate(c: MaterialAutoApproveCandidate, itemLabelMap: Map<number, string>): AutoApproveCandidate {
  return {
    key: candidateKey(c),
    subjectUserId: c.subjectUserId,
    subjectDisplayName: c.subjectDisplayName,
    dimensionLabel: c.itemName || itemLabelMap.get(c.itemId) || `物资 #${c.itemId}`,
    pendingCount: c.pendingCount,
    approvedCount: c.approvedCount,
    alreadyTrusted: c.alreadyTrusted,
  };
}

function TrustRuleCard({
  rule,
  itemLabel,
  onEdit,
  onDelete,
}: {
  rule: MaterialTrustRule;
  itemLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isScheduled = rule.triggerMode === "SCHEDULED";
  return (
    <div className="rounded-twin-lg border border-[var(--twin-hairline)] p-3 text-sm">
      <div className="flex justify-between gap-2">
        <span className="font-medium text-[var(--twin-ink)]">{rule.subjectDisplayName || rule.subjectUserId}</span>
        <span className="text-xs text-[var(--twin-mute)]">{rule.enabled !== false ? "启用" : "停用"}</span>
      </div>
      <p className="text-xs text-[var(--twin-mute)] mt-1">{itemLabel}</p>
      {isScheduled ? (
        <p className="text-xs text-[var(--twin-mute)] mt-1">定时：{formatDailyScheduleLabel(rule.scheduleCron)}</p>
      ) : null}
      {rule.note ? <p className="text-xs text-[var(--twin-mute)] mt-1">{rule.note}</p> : null}
      <div className="mt-2 flex gap-2">
        <button type="button" className="text-xs text-blue-600" onClick={onEdit}>
          编辑
        </button>
        <button type="button" className="text-xs text-red-500" onClick={onDelete}>
          删除
        </button>
      </div>
    </div>
  );
}

export function MaterialAutoApprovePanel({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("trust");
  const [trustForm, setTrustForm] = useState(emptyTrustForm());
  const [batchForm, setBatchForm] = useState<Partial<MaterialBatchRule>>(emptyBatchForm());
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["material", "admin", "items", "auto-approve"],
    queryFn: () => fetchAdminMaterialItems(),
    enabled: open,
  });

  const { data: trustRules = [], isLoading: trustLoading } = useQuery({
    queryKey: authQueryKey("material-auto", "trust"),
    queryFn: fetchMaterialTrustRules,
    enabled: open,
  });

  const { data: batchRules = [], isLoading: batchLoading } = useQuery({
    queryKey: authQueryKey("material-auto", "batch"),
    queryFn: fetchMaterialBatchRules,
    enabled: open,
  });

  const { data: rawCandidates = [], isLoading: candLoading } = useQuery({
    queryKey: authQueryKey("material-auto", "candidates"),
    queryFn: fetchMaterialAutoApproveCandidates,
    enabled: open && tab === "trust",
  });

  const itemLabelMap = useMemo(() => {
    const m = new Map<number, string>();
    (items ?? []).forEach((o: MaterialItem) => {
      if (o.id) m.set(o.id, o.name);
    });
    return m;
  }, [items]);

  const candidates = useMemo(
    () => rawCandidates.map((c) => toUiCandidate(c, itemLabelMap)),
    [rawCandidates, itemLabelMap]
  );

  const onSubmitRules = useMemo(
    () => trustRules.filter((r) => r.triggerMode !== "SCHEDULED"),
    [trustRules]
  );
  const scheduledRules = useMemo(
    () => trustRules.filter((r) => r.triggerMode === "SCHEDULED"),
    [trustRules]
  );

  const reload = useCallback(() => {
    void qc.invalidateQueries({ queryKey: authQueryKey("material-auto") });
  }, [qc]);

  useEffect(() => {
    if (!open) {
      setTab("trust");
      setTrustForm(emptyTrustForm());
      setBatchForm(emptyBatchForm());
    }
  }, [open]);

  const saveTrust = async () => {
    if (!trustForm.subjectUserId?.trim()) {
      toast.error("请从已有记录选择申请人");
      return;
    }
    if (!trustForm.itemId || trustForm.itemId <= 0) {
      toast.error("请选择物资");
      return;
    }
    setSaving(true);
    try {
      await saveMaterialTrustRule(trustForm);
      // 保存后仅刷新规则列表，禁止整页 load；post-save-no-full-refresh.mdc
      reload();
      setTrustForm(emptyTrustForm());
      toast.success("按人规则已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const saveBatch = async () => {
    if (!batchForm.itemIds?.length) {
      toast.error("至少选择一个物资");
      return;
    }
    setSaving(true);
    try {
      await saveMaterialBatchRule(batchForm);
      reload();
      setBatchForm(emptyBatchForm());
      toast.success("批量规则已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const r = await runMaterialAutoApproveNow();
      toast.success(`已执行：通过 ${r.approved ?? 0}，跳过 ${r.skipped ?? 0}${(r.failed ?? 0) > 0 ? `，失败 ${r.failed}` : ""}`);
      reload();
      void qc.invalidateQueries({ queryKey: ["material", "requests", "pending"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "执行失败");
    } finally {
      setRunning(false);
    }
  };

  const pickCandidate = (c: AutoApproveCandidate) => {
    const raw = rawCandidates.find((x) => candidateKey(x) === c.key);
    if (!raw) return;
    setTrustForm((f) => ({
      ...f,
      selectedKey: c.key,
      subjectUserId: raw.subjectUserId,
      subjectDisplayName: raw.subjectDisplayName,
      itemId: raw.itemId,
      note:
        f.id != null
          ? f.note
          : raw.approvedCount
            ? `历史已通过 ${raw.approvedCount} 次（须手动保存后生效）`
            : raw.pendingCount
              ? `当前待审 ${raw.pendingCount} 条`
              : "",
    }));
  };

  const editRule = (r: MaterialTrustRule) => {
    setTrustForm({
      ...r,
      selectedKey: candidateKey(r),
      scheduleCron: r.scheduleCron || "0 0 9 * * *",
    });
  };

  return (
    <AdminCenteredPanelShell
      open={open}
      onClose={onClose}
      ariaLabel="物资申领自动审批"
      title="物资自动审批"
      headerExtra={
        <button
          type="button"
          disabled={running}
          onClick={() => void runNow()}
          className="rounded-twin-sm border border-[var(--twin-hairline)] px-2.5 py-1 text-xs text-[var(--twin-body)]"
        >
          {running ? "执行中…" : "立即执行"}
        </button>
      }
    >
      <p className="shrink-0 px-4 py-2 text-xs text-[var(--twin-mute)]">
        从待审或历史记录选择姓名即可锁定申请人；也可在下方手动选择物资（事件节点）。按人规则须手动保存。
      </p>

      <div className="flex shrink-0 gap-1 border-b border-[var(--twin-hairline)] px-4 pb-2">
        {([
          ["trust", "按人规则"],
          ["batch", "批量规则"],
        ] as [TabKey, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-twin-sm px-3 py-1 text-xs font-medium ${
              tab === k
                ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]"
                : "text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {tab === "trust" ? (
          <>
            <div className="rounded-twin-lg border border-[var(--twin-hairline)] p-3 space-y-3">
              <p className="text-xs font-medium text-[var(--twin-ink)]">新增 / 编辑按人规则</p>

              <AutoApproveCandidateSelect
                candidates={candidates}
                selectedKey={trustForm.selectedKey}
                loading={candLoading}
                onSelect={pickCandidate}
              />

              {trustForm.subjectUserId ? (
                <div className="rounded-twin-sm bg-[var(--twin-canvas-soft)] px-2 py-1.5 text-xs text-[var(--twin-body)]">
                  申请人：{trustForm.subjectDisplayName || candidates.find((c) => c.key === trustForm.selectedKey)?.subjectDisplayName || trustForm.subjectUserId}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--twin-ink)]">物资（事件节点）</label>
                <select
                  className="w-full rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-sm"
                  value={trustForm.itemId && trustForm.itemId > 0 ? trustForm.itemId : ""}
                  onChange={(e) => {
                    const itemId = Number(e.target.value);
                    setTrustForm((f) => ({
                      ...f,
                      itemId: Number.isFinite(itemId) ? itemId : 0,
                      selectedKey:
                        f.subjectUserId && itemId > 0
                          ? candidateKey({ subjectUserId: f.subjectUserId, itemId })
                          : f.selectedKey,
                    }));
                  }}
                >
                  <option value="">请选择物资</option>
                  {(items ?? []).map((o) =>
                    o.id ? (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ) : null
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--twin-ink)]">触发方式</label>
                <select
                  className="w-full rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-sm"
                  value={trustForm.triggerMode ?? "ON_SUBMIT"}
                  onChange={(e) =>
                    setTrustForm((f) => ({
                      ...f,
                      triggerMode: e.target.value as MaterialTrustRule["triggerMode"],
                    }))
                  }
                >
                  <option value="ON_SUBMIT">提交时立即尝试</option>
                  <option value="SCHEDULED">定时审批</option>
                </select>
              </div>

              {trustForm.triggerMode === "SCHEDULED" ? (
                <AutoApproveDailyTimeField
                  value={trustForm.scheduleCron}
                  onChange={(cron) => setTrustForm((f) => ({ ...f, scheduleCron: cron }))}
                />
              ) : null}

              <input
                className="w-full rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-sm"
                placeholder="备注（可选）"
                value={trustForm.note ?? ""}
                onChange={(e) => setTrustForm((f) => ({ ...f, note: e.target.value }))}
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveTrust()}
                  className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1.5 text-sm font-medium text-[var(--twin-on-primary)]"
                >
                  保存规则
                </button>
                {trustForm.id || trustForm.selectedKey ? (
                  <button
                    type="button"
                    className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1.5 text-sm"
                    onClick={() => setTrustForm(emptyTrustForm())}
                  >
                    清空
                  </button>
                ) : null}
              </div>
            </div>

            {trustLoading ? <p className="text-sm text-[var(--twin-mute)]">加载规则…</p> : null}

            {onSubmitRules.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--twin-ink)]">提交时审批（{onSubmitRules.length}）</p>
                {onSubmitRules.map((r) => (
                  <TrustRuleCard
                    key={r.id}
                    rule={r}
                    itemLabel={itemLabelMap.get(r.itemId) || r.itemName || `物资 #${r.itemId}`}
                    onEdit={() => editRule(r)}
                    onDelete={async () => {
                      if (!r.id || !await appConfirm("删除此规则？")) return;
                      await deleteMaterialTrustRule(r.id);
                      reload();
                      toast.success("已删除");
                    }}
                  />
                ))}
              </div>
            ) : null}

            {scheduledRules.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--twin-ink)]">定时审批（{scheduledRules.length}）</p>
                {scheduledRules.map((r) => (
                  <TrustRuleCard
                    key={r.id}
                    rule={r}
                    itemLabel={itemLabelMap.get(r.itemId) || r.itemName || `物资 #${r.itemId}`}
                    onEdit={() => editRule(r)}
                    onDelete={async () => {
                      if (!r.id || !await appConfirm("删除此规则？")) return;
                      await deleteMaterialTrustRule(r.id);
                      reload();
                      toast.success("已删除");
                    }}
                  />
                ))}
              </div>
            ) : null}

            {!trustLoading && trustRules.length === 0 ? (
              <p className="text-sm text-[var(--twin-mute)]">暂无按人规则</p>
            ) : null}
          </>
        ) : null}

        {tab === "batch" ? (
          <>
            <div className="rounded-twin-lg border border-[var(--twin-hairline)] p-3 space-y-2">
              <p className="text-xs font-medium text-[var(--twin-ink)]">新增 / 编辑批量规则</p>
              <input
                className="w-full rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-sm"
                placeholder="规则名称"
                value={batchForm.name ?? ""}
                onChange={(e) => setBatchForm((f) => ({ ...f, name: e.target.value }))}
              />
              <div className="max-h-32 overflow-y-auto rounded-twin-sm border border-[var(--twin-hairline)] p-2 space-y-1">
                {(items ?? []).map((o: MaterialItem) => {
                  const checked = batchForm.itemIds?.includes(o.id!) ?? false;
                  return (
                    <label key={o.id} className="flex items-center gap-2 text-xs">
                      <AdminSwitchScaled
                        size="3.5"
                        checked={checked}
                        onChange={(nextChecked) => {
                          setBatchForm((f) => {
                            const set = new Set(f.itemIds ?? []);
                            if (nextChecked && o.id) set.add(o.id);
                            else if (o.id) set.delete(o.id);
                            return { ...f, itemIds: [...set] };
                          });
                        }}
                      />
                      {o.name}
                    </label>
                  );
                })}
              </div>
              <AutoApproveDailyTimeField
                value={batchForm.scheduleCron}
                onChange={(cron) => setBatchForm((f) => ({ ...f, scheduleCron: cron }))}
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveBatch()}
                className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1.5 text-sm font-medium text-[var(--twin-on-primary)]"
              >
                保存批量规则
              </button>
            </div>

            {batchLoading ? <p className="text-sm text-[var(--twin-mute)]">加载中…</p> : null}
            {batchRules.map((r) => (
              <div key={r.id} className="rounded-twin-lg border border-[var(--twin-hairline)] p-3 text-sm">
                <div className="font-medium text-[var(--twin-ink)]">{r.name}</div>
                <p className="text-xs text-[var(--twin-mute)] mt-1">
                  物资：{r.itemIds.map((id) => itemLabelMap.get(id) || `#${id}`).join("、") || "—"}
                </p>
                <p className="text-xs text-[var(--twin-mute)]">定时：{formatDailyScheduleLabel(r.scheduleCron)}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="text-xs text-blue-600" onClick={() => setBatchForm({ ...r })}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-500"
                    onClick={async () => {
                      if (!r.id || !await appConfirm("删除此批量规则？")) return;
                      await deleteMaterialBatchRule(r.id);
                      reload();
                      toast.success("已删除");
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </AdminCenteredPanelShell>
  );
}
