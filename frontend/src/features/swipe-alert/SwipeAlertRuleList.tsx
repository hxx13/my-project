import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Beaker, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  listSwipeAlertRules,
  deleteSwipeAlertRule,
  toggleSwipeAlertRule,
  type SwipeAlertRuleRow,
} from "@/api/domains/swipeAlert.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminTableShell } from "@/components/admin/AdminPageShell";
import { useSwipeAlertStore } from "@/store/useSwipeAlertStore";

interface Props {
  onEdit: (rule: SwipeAlertRuleRow) => void;
  onAdd: () => void;
  onClose: () => void;
  formOpen: boolean;
  refreshKey: number;
}

export function SwipeAlertRuleList({ onEdit, onAdd, onClose, formOpen, refreshKey }: Props) {
  const [rows, setRows] = useState<SwipeAlertRuleRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await listSwipeAlertRules()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [refreshKey]);

  const onDelete = async (id: number) => {
    if (!window.confirm("确定删除？")) return;
    try { await deleteSwipeAlertRule(id); toast.success("已删除"); setRows(prev => prev.filter(r => r.id !== id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "删除失败"); }
  };

  const onToggle = async (r: SwipeAlertRuleRow) => {
    try {
      const updated = await toggleSwipeAlertRule(r.id);
      setRows(prev => prev.map(x => x.id === updated.id ? updated : x));
    } catch (e) { toast.error(e instanceof Error ? e.message : "切换失败"); }
  };

  const badge = (on: boolean) => (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
      background: on ? "#dcfce7" : "#f1f5f9", color: on ? "#166534" : "#94a3b8" }}>
      {on ? "开启" : "关闭"}
    </span>
  );

  return (
    <AdminFormCard title="告警规则"
      actions={
        <div className="flex gap-2">
          <AdminButton type="button" tone={formOpen ? "secondary" : "primary"} onClick={formOpen ? onClose : onAdd}>
            {formOpen ? "关闭" : "+ 新增规则"}
          </AdminButton>
          <AdminButton type="button" className="gap-1.5 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            onClick={() => {
              useSwipeAlertStore.getState().showAlert({
                alertId: `test-${Date.now()}`, ruleId: 0, ruleName: "模拟测试",
                title: "🚨 刷卡失败告警 · 物理学院",
                body: "过去 5 分钟内 3 次非法刷卡", count: 3, windowSec: 300, bannerDurationSec: 0,
                matchedRecords: [{
                  personName: "赵强", personCode: "2023056", departmentName: "物理学院",
                  channelName: "北门-3号通道", channelCode: "CH-N-03", openTypeLabel: "非法刷卡开门",
                  swingTime: "2026-06-06 14:32:03", enterOrExit: 1, enterOrExitLabel: "进入",
                  mobilePhone: "138****5678", aroUserId: "U001", aroStatus: "INSIDE",
                }],
              });
              toast.success("模拟告警已触发");
            }}><Beaker className="h-4 w-4" />模拟</AdminButton>
          <AdminButton type="button" tone="secondary" loading={loading} onClick={load}><RefreshCw className="h-4 w-4" /></AdminButton>
        </div>}
    >
      <AdminTableShell loading={loading} empty={!loading && rows.length === 0} emptyMessage="暂无规则" scrollable>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">阈值</th>
              <th className="px-3 py-2">站内</th>
              <th className="px-3 py-2">站外</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-xs">{r.thresholdCount}次 / {Math.floor(r.thresholdWindowSec / 60)}分钟</td>
                <td className="px-3 py-2">{badge(r.notifySite ?? true)}</td>
                <td className="px-3 py-2">{badge(r.notifyPush ?? false)}</td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => onToggle(r)}
                    style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 999, border: "none", cursor: "pointer",
                      background: r.enabled ? "#dcfce7" : "#f1f5f9", color: r.enabled ? "#166534" : "#94a3b8" }}>
                    {r.enabled ? "启用" : "停用"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    <AdminButton type="button" tone="secondary" size="sm" onClick={() => onEdit(r)}><Pencil className="h-3.5 w-3.5" /></AdminButton>
                    <AdminButton type="button" tone="destructive" size="sm" onClick={() => onDelete(r.id)}><Trash2 className="h-3.5 w-3.5" /></AdminButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </AdminFormCard>
  );
}
