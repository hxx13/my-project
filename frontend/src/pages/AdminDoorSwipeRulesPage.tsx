import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import {
  AdminFormCard,
  AdminPageShell,
  AdminTableShell,
  AdminFillScrollRegion,
} from "@/components/admin/AdminPageShell";
import { AdminPageTabs, AdminTabPanel } from "@/components/admin/AdminPageTabs";
import { DahuaChannelListPicker } from "@/components/admin/DahuaChannelListPicker";
import { adminHintClass, adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { cn } from "@/lib/utils";
import { appConfirm } from "@/lib/appDialog";
import { fetchDoorControlChannels } from "@/api/twinApi";
import { normalizeChannelCode, resolveChannelLabelsByCodes } from "@/utils/dahuaChannelUtils";
import {
  createDoorSwipeRule,
  deleteDoorSwipeRule,
  listDoorSwipeChannels,
  listDoorSwipeOperationLogs,
  listDoorSwipeRecords,
  listDoorSwipeRules,
  replaceDoorSwipeChannels,
  toggleDoorSwipeChannel,
  toggleDoorSwipeRule,
  updateDoorSwipeRule,
  type DoorSwipeRuleChannelRow,
  type DoorSwipeRuleOperationLogRow,
  type DoorSwipeRuleRecordRow,
  type DoorSwipeRuleRow,
  type DoorSwipeRuleUpsert,
} from "@/api/domains/doorSwipeRule.api";
import { Building2, Pencil, RotateCw, Save, Trash2 } from "lucide-react";

type HubTab = "records" | "rules" | "channels" | "logs";

const OPEN_TYPE_LABELS: Record<number, string> = {
  48: "远程开门",
  49: "按钮开门",
  51: "合法刷卡",
  52: "非法刷卡",
};

const SCOPE_TYPE_LABELS: Record<string, string> = {
  ALL: "全部",
  PERSON: "指定人员",
  DEPARTMENT: "指定部门",
  CARD: "指定卡片",
};

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminDoorSwipeRulesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") || "records";
  const tab: HubTab =
    rawTab === "records" || rawTab === "rules" || rawTab === "channels" || rawTab === "logs"
      ? rawTab
      : "records";
  const setTab = (next: HubTab) => {
    const p = new URLSearchParams(searchParams);
    p.set("tab", next);
    setSearchParams(p, { replace: true });
  };

  return (
    <AdminPageShell>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
        <AdminPageTabs
          className="shrink-0"
          tabs={[
            { id: "records", label: "门禁记录" },
            { id: "rules", label: "规则配置" },
            { id: "channels", label: "通道受控" },
            { id: "logs", label: "操作记录" },
          ]}
          value={tab}
          onChange={(id) => setTab(id as HubTab)}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl border border-t-0 border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
          <AdminTabPanel tabId="records" activeTab={tab} id="door-swipe-tab-records" className="flex min-h-0 flex-1 flex-col">
            <AdminFillScrollRegion className="p-3">
              <RecordsTab />
            </AdminFillScrollRegion>
          </AdminTabPanel>
          <AdminTabPanel tabId="rules" activeTab={tab} id="door-swipe-tab-rules" className="flex min-h-0 flex-1 flex-col">
            <AdminFillScrollRegion className="p-3">
              <RulesTab />
            </AdminFillScrollRegion>
          </AdminTabPanel>
          <AdminTabPanel tabId="channels" activeTab={tab} id="door-swipe-tab-channels" className="flex min-h-0 flex-1 flex-col">
            <AdminFillScrollRegion className="p-3">
              <ChannelsTab />
            </AdminFillScrollRegion>
          </AdminTabPanel>
          <AdminTabPanel tabId="logs" activeTab={tab} id="door-swipe-tab-logs" className="flex min-h-0 flex-1 flex-col">
            <AdminFillScrollRegion className="p-3">
              <OperationLogsTab />
            </AdminFillScrollRegion>
          </AdminTabPanel>
        </div>
      </div>
    </AdminPageShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab1 门禁记录                                                       */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 20;

function RecordsTab() {
  const [filters, setFilters] = useState({
    channelCode: "",
    personName: "",
    openType: "",
    startTime: "",
    endTime: "",
  });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<DoorSwipeRuleRecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: number, f: typeof filters) => {
    setLoading(true);
    try {
      const res = await listDoorSwipeRecords({
        channelCode: f.channelCode.trim() || undefined,
        personName: f.personName.trim() || undefined,
        openType: f.openType === "" ? undefined : Number(f.openType),
        startTime: f.startTime || undefined,
        endTime: f.endTime || undefined,
        page: p,
        size: PAGE_SIZE,
      });
      setRows(res.list);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page, filters);
  }, [page, filters, load]);

  const setFilter = (patch: Partial<typeof filters>) => setFilters((prev) => ({ ...prev, ...patch }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <AdminFormCard title="门禁记录" description="仅展示受控通道内、成功刷卡（openType=51）触发的记录明细。">
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <div>
            <label className={adminLabelClass}>通道编码</label>
            <input className={cn(adminInputClass, "mt-1")} value={filters.channelCode} placeholder="通道编码"
              onChange={(e) => setFilter({ channelCode: e.target.value })} />
          </div>
          <div>
            <label className={adminLabelClass}>人员姓名</label>
            <input className={cn(adminInputClass, "mt-1")} value={filters.personName} placeholder="姓名"
              onChange={(e) => setFilter({ personName: e.target.value })} />
          </div>
          <div>
            <label className={adminLabelClass}>开门类型</label>
            <select className={cn(adminInputClass, "mt-1")} value={filters.openType}
              onChange={(e) => setFilter({ openType: e.target.value })}>
              <option value="">全部</option>
              {Object.entries(OPEN_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={adminLabelClass}>开始时间</label>
            <input className={cn(adminInputClass, "mt-1")} type="datetime-local" value={filters.startTime}
              onChange={(e) => setFilter({ startTime: e.target.value })} />
          </div>
          <div>
            <label className={adminLabelClass}>结束时间</label>
            <input className={cn(adminInputClass, "mt-1")} type="datetime-local" value={filters.endTime}
              onChange={(e) => setFilter({ endTime: e.target.value })} />
          </div>
          <div className="flex items-end gap-2">
            <AdminButton type="button" tone="secondary" onClick={() => { setPage(1); void load(1, filters); }}>
              查询
            </AdminButton>
            <AdminButton type="button" tone="ghost" onClick={() => {
              setFilters({ channelCode: "", personName: "", openType: "", startTime: "", endTime: "" });
              setPage(1);
            }}>
              重置
            </AdminButton>
          </div>
        </div>
      </AdminFormCard>

      <AdminTableShell loading={loading} empty={!loading && rows.length === 0} emptyMessage="暂无记录" scrollable>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-secondary)]">
              <th className="px-3 py-2">刷卡时间</th>
              <th className="px-3 py-2">通道</th>
              <th className="px-3 py-2">卡号</th>
              <th className="px-3 py-2">人员</th>
              <th className="px-3 py-2">开门类型</th>
              <th className="px-3 py-2">进/出</th>
              <th className="px-3 py-2">结果</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--app-color-border-default)] last:border-0">
                <td className="px-3 py-2 text-xs">{r.swingTime || r.createTime || "-"}</td>
                <td className="px-3 py-2 text-xs">{r.channelName || r.channelCode || "-"}</td>
                <td className="px-3 py-2 text-xs">{r.cardNumber || "-"}</td>
                <td className="px-3 py-2 text-xs">{r.personName || r.personCode || "-"}</td>
                <td className="px-3 py-2 text-xs">{OPEN_TYPE_LABELS[r.openType] ?? r.openType}</td>
                <td className="px-3 py-2 text-xs">{r.enterOrExit === 1 ? "进门" : r.enterOrExit === 2 ? "出门" : "-"}</td>
                <td className="px-3 py-2 text-xs">{r.openResult || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>

      <div className="flex items-center justify-between text-xs text-[var(--app-color-text-secondary)]">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-2">
          <AdminButton type="button" tone="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </AdminButton>
          <span>{page} / {totalPages}</span>
          <AdminButton type="button" tone="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </AdminButton>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab2 规则配置                                                       */
/* ------------------------------------------------------------------ */

function RulesTab() {
  const [rows, setRows] = useState<DoorSwipeRuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<DoorSwipeRuleRow | null | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listDoorSwipeRules());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const onDelete = async (id: number) => {
    if (!(await appConfirm("确定删除该规则？"))) return;
    try {
      await deleteDoorSwipeRule(id);
      toast.success("已删除");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const onToggle = async (r: DoorSwipeRuleRow) => {
    try {
      const updated = await toggleDoorSwipeRule(r.id);
      setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "切换失败");
    }
  };

  return (
    <div className="space-y-3">
      <AdminFormCard
        title="成功刷卡规则"
        actions={
          <div className="flex gap-2">
            <AdminButton
              type="button"
              tone={editing !== undefined ? "secondary" : "primary"}
              onClick={editing !== undefined ? () => setEditing(undefined) : () => setEditing(null)}
            >
              {editing !== undefined ? "关闭" : "+ 新增规则"}
            </AdminButton>
            <AdminButton type="button" tone="secondary" loading={loading} onClick={() => void load()}>
              <RotateCw className="h-4 w-4" />
            </AdminButton>
          </div>
        }
      >
        <AdminTableShell loading={loading} empty={!loading && rows.length === 0} emptyMessage="暂无规则" scrollable>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-secondary)]">
                <th className="px-3 py-2">名称</th>
                <th className="px-3 py-2">通道数</th>
                <th className="px-3 py-2">人员范围</th>
                <th className="px-3 py-2">阈值</th>
                <th className="px-3 py-2">常开时长</th>
                <th className="px-3 py-2">冷却</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--app-color-border-default)] last:border-0">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-xs">{parseStringArray(r.channelCodes).length} 个通道</td>
                  <td className="px-3 py-2 text-xs">
                    {SCOPE_TYPE_LABELS[r.scopeType ?? "ALL"] ?? (r.scopeType ?? "ALL")}
                    <span className="text-[var(--app-color-text-tertiary)]">（{parseStringArray(r.scopeValues).length}）</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.thresholdCount}次 / {r.thresholdWindowSec}秒</td>
                  <td className="px-3 py-2 text-xs">{r.stayOpenDurationSec}秒</td>
                  <td className="px-3 py-2 text-xs">{r.cooldownSec}秒</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onToggle(r)}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 10px",
                        borderRadius: 999,
                        border: "none",
                        cursor: "pointer",
                        background: r.enabled ? "#dcfce7" : "#f1f5f9",
                        color: r.enabled ? "#166534" : "#94a3b8",
                      }}
                    >
                      {r.enabled ? "启用" : "停用"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <AdminButton type="button" tone="secondary" size="sm" onClick={() => setEditing(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </AdminButton>
                      <AdminButton type="button" tone="destructive" size="sm" onClick={() => onDelete(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </AdminButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>
      </AdminFormCard>

      {editing !== undefined && (
        <DoorSwipeRuleForm
          key={editing?.id ?? "new"}
          editing={editing}
          onSaved={() => {
            setEditing(undefined);
            setRefreshKey((k) => k + 1);
          }}
          onCancel={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DoorSwipeRuleForm — 新增/编辑规则表单                                */
/* ------------------------------------------------------------------ */

type ScopeType = "ALL" | "PERSON" | "DEPARTMENT" | "CARD";

function DoorSwipeRuleForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: DoorSwipeRuleRow | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isNew = !editing;
  const [name, setName] = useState(editing?.name ?? "");
  const [selectedChannelCodes, setSelectedChannelCodes] = useState<string[]>(() =>
    parseStringArray(editing?.channelCodes),
  );
  const [scopeType, setScopeType] = useState<ScopeType>((editing?.scopeType as ScopeType) || "ALL");
  const [personScope, setPersonScope] = useState<string>(() =>
    editing?.scopeType === "PERSON" ? parseStringArray(editing.scopeValues).join("\n") : "",
  );
  const [deptScope, setDeptScope] = useState<string>(() =>
    editing?.scopeType === "DEPARTMENT" ? parseStringArray(editing.scopeValues).join("\n") : "",
  );
  const [cardScope, setCardScope] = useState<string>(() =>
    editing?.scopeType === "CARD" ? parseStringArray(editing.scopeValues).join("\n") : "",
  );
  const [thresholdCount, setThresholdCount] = useState(editing?.thresholdCount ?? 5);
  const [thresholdWindowSec, setThresholdWindowSec] = useState(editing?.thresholdWindowSec ?? 60);
  const [stayOpenDurationSec, setStayOpenDurationSec] = useState(editing?.stayOpenDurationSec ?? 120);
  const [cooldownSec, setCooldownSec] = useState(editing?.cooldownSec ?? 300);
  const [saving, setSaving] = useState(false);

  const splitMulti = (text: string): string[] =>
    text
      .split(/[\n,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const buildScopeValues = (): string => {
    if (scopeType === "PERSON") return JSON.stringify(splitMulti(personScope));
    if (scopeType === "DEPARTMENT") return JSON.stringify(splitMulti(deptScope));
    if (scopeType === "CARD") return JSON.stringify(splitMulti(cardScope));
    return "[]";
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("请输入规则名称");
      return;
    }
    if (selectedChannelCodes.length === 0) {
      toast.error("请选择至少一个通道");
      return;
    }
    setSaving(true);
    try {
      const payload: DoorSwipeRuleUpsert = {
        name: name.trim(),
        enabled: editing?.enabled ?? true,
        channelCodes: JSON.stringify(selectedChannelCodes),
        scopeType,
        scopeValues: buildScopeValues(),
        thresholdCount,
        thresholdWindowSec,
        stayOpenDurationSec,
        cooldownSec,
      };
      if (isNew) {
        await createDoorSwipeRule(payload);
        toast.success("规则已创建");
      } else {
        await updateDoorSwipeRule(editing!.id, payload);
        toast.success("规则已更新");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = cn(adminInputClass, "mt-1");

  return (
    <AdminFormCard title={isNew ? "新增成功刷卡规则" : `编辑：${editing!.name}`}>
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className={adminLabelClass}>规则名称</label>
          <input className={cn(inputCls)} value={name} onChange={(e) => setName(e.target.value)} placeholder="如：北门连刷常开" />
        </div>

        {/* Channel picker */}
        <div>
          <label className={adminLabelClass}>监控通道（多选）</label>
          <div className="mt-1">
            <DahuaChannelListPicker
              selected={selectedChannelCodes}
              onChange={setSelectedChannelCodes}
              fetchChannels={fetchDoorControlChannels}
              idPrefix="door-swipe-rule"
            />
          </div>
        </div>

        {/* Scope */}
        <div>
          <label className={adminLabelClass}>人员范围</label>
          <select className={cn(inputCls)} value={scopeType} onChange={(e) => setScopeType(e.target.value as ScopeType)}>
            <option value="ALL">全部人员</option>
            <option value="PERSON">指定人员</option>
            <option value="DEPARTMENT">指定部门</option>
            <option value="CARD">指定卡片</option>
          </select>
          <div className="mt-2">
            {scopeType === "PERSON" && (
              <div>
                <textarea
                  className={cn(inputCls, "min-h-[80px] resize-y")}
                  value={personScope}
                  onChange={(e) => setPersonScope(e.target.value)}
                  placeholder="每行一个大华人员编码（personCode），或用逗号分隔"
                />
                <p className={adminHintClass}>按大华人员编码精确匹配，命中其一即算，不依赖本地人员绑定。</p>
              </div>
            )}
            {scopeType === "DEPARTMENT" && (
              <div>
                <textarea
                  className={cn(inputCls, "min-h-[80px] resize-y")}
                  value={deptScope}
                  onChange={(e) => setDeptScope(e.target.value)}
                  placeholder="每行一个大华部门 ID（如 26=学生），或用逗号分隔"
                />
                <p className={adminHintClass}>按大华部门 ID 精确匹配，命中其一即算，不依赖本地部门映射。</p>
              </div>
            )}
            {scopeType === "CARD" && (
              <div>
                <textarea
                  className={cn(inputCls, "min-h-[80px] resize-y")}
                  value={cardScope}
                  onChange={(e) => setCardScope(e.target.value)}
                  placeholder="每行一个卡号，或用逗号分隔"
                />
                <p className={adminHintClass}>按卡号精确匹配，多张卡片命中其一即算。</p>
              </div>
            )}
            {scopeType === "ALL" && <p className={adminHintClass}>不限制人员范围，命中受控通道即计数。</p>}
          </div>
        </div>

        {/* Threshold */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={adminLabelClass}>成功次数阈值</label>
            <input className={cn(inputCls)} type="number" min={1} value={thresholdCount}
              onChange={(e) => setThresholdCount(Number(e.target.value) || 1)} />
          </div>
          <div>
            <label className={adminLabelClass}>时间窗口(秒)</label>
            <input className={cn(inputCls)} type="number" min={1} value={thresholdWindowSec}
              onChange={(e) => setThresholdWindowSec(Number(e.target.value) || 1)} />
          </div>
        </div>

        {/* Duration & Cooldown */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={adminLabelClass}>常开持续时长(秒)</label>
            <input className={cn(inputCls)} type="number" min={1} value={stayOpenDurationSec}
              onChange={(e) => setStayOpenDurationSec(Number(e.target.value) || 1)} />
          </div>
          <div>
            <label className={adminLabelClass}>冷却时间(秒)</label>
            <input className={cn(inputCls)} type="number" min={0} value={cooldownSec}
              onChange={(e) => setCooldownSec(Number(e.target.value) || 0)} />
            <p className={adminHintClass}>按人+门维度冷却</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <AdminButton type="button" tone="primary" loading={saving} onClick={save}>
            <Save className="h-4 w-4" />保存
          </AdminButton>
          <AdminButton type="button" tone="secondary" onClick={onCancel}>
            取消
          </AdminButton>
        </div>
      </div>
    </AdminFormCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab3 通道受控                                                       */
/* ------------------------------------------------------------------ */

function ChannelsTab() {
  const [channels, setChannels] = useState<DoorSwipeRuleChannelRow[]>([]);
  const [selectedChannelCodes, setSelectedChannelCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listDoorSwipeChannels();
      setChannels(list);
      setSelectedChannelCodes(list.map((c) => normalizeChannelCode(c.channelCode)).filter(Boolean));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onReplace = async () => {
    setSaving(true);
    try {
      const labels = await resolveChannelLabelsByCodes(selectedChannelCodes, fetchDoorControlChannels);
      const body = selectedChannelCodes.map((code) => ({ channelCode: code, channelName: labels[code] || code }));
      const updated = await replaceDoorSwipeChannels(body);
      toast.success("受控通道已更新");
      setChannels(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (code: string) => {
    setToggling((prev) => new Set(prev).add(code));
    try {
      const updated = await toggleDoorSwipeChannel(code);
      setChannels((prev) => prev.map((c) => (c.channelCode === code ? updated : c)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "切换失败");
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    }
  };

  return (
    <div className="space-y-3">
      <AdminFormCard title="受控通道（总闸）" description="仅存在于本列表且已启用的通道，才会被写入成功刷卡记录库并参与规则触发。">
        <DahuaChannelListPicker
          selected={selectedChannelCodes}
          onChange={setSelectedChannelCodes}
          fetchChannels={fetchDoorControlChannels}
          idPrefix="door-swipe-channel-scope"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-[var(--app-color-text-secondary)]">
            已选 {selectedChannelCodes.length} 个通道
          </span>
          <AdminButton type="button" tone="primary" loading={saving} onClick={onReplace}>
            <Save className="h-4 w-4" /> 批量替换
          </AdminButton>
        </div>
      </AdminFormCard>

      <AdminFormCard title="通道启停">
        {loading ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)] py-4">加载中…</p>
        ) : channels.length === 0 ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)] py-4">暂无受控通道</p>
        ) : (
          <div className="space-y-1">
            {channels.map((c) => (
              <div key={c.channelCode} className="flex items-center gap-3 rounded-lg border border-[var(--app-color-border-default)] px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--app-color-text-primary)]">
                  <Building2 className="h-4 w-4 text-[var(--app-color-text-tertiary)]" />
                  {c.channelName || c.channelCode}
                </span>
                <code className="text-[11px] text-[var(--app-color-text-tertiary)]">{c.channelCode}</code>
                <div className="flex-1" />
                <span className={cn("text-xs font-medium", c.enabled ? "text-[var(--app-color-feedback-success)]" : "text-[var(--app-color-text-tertiary)]")}>
                  {c.enabled ? "已启用" : "已停用"}
                </span>
                <AdminSwitchScaled
                  size="sm"
                  checked={c.enabled}
                  disabled={toggling.has(c.channelCode)}
                  onChange={() => onToggle(c.channelCode)}
                />
              </div>
            ))}
          </div>
        )}
      </AdminFormCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab4 操作记录                                                       */
/* ------------------------------------------------------------------ */

function OperationLogsTab() {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<DoorSwipeRuleOperationLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await listDoorSwipeOperationLogs({ page: p, size: PAGE_SIZE });
      setRows(res.list);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [page, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <AdminFormCard title="操作记录" description="记录规则触发（常开/恢复）与规则、通道配置的增删改审计。">
        <AdminTableShell loading={loading} empty={!loading && rows.length === 0} emptyMessage="暂无操作记录" scrollable>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-secondary)]">
                <th className="px-3 py-2">时间</th>
                <th className="px-3 py-2">事件</th>
                <th className="px-3 py-2">触发</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">说明</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--app-color-border-default)] last:border-0">
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{r.eventTime || "-"}</td>
                  <td className="px-3 py-2 text-xs">{r.eventKey || r.automationType || "-"}</td>
                  <td className="px-3 py-2 text-xs">{r.triggerType || r.triggerReason || "-"}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      r.success === 1 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                      {r.success === 1 ? "成功" : "失败"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--app-color-text-secondary)]">{r.detail || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>
      </AdminFormCard>

      <div className="flex items-center justify-between text-xs text-[var(--app-color-text-secondary)]">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-2">
          <AdminButton type="button" tone="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </AdminButton>
          <span>{page} / {totalPages}</span>
          <AdminButton type="button" tone="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
