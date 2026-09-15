import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Printer, Trash2 } from "lucide-react";
import { AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSensitiveAction } from "@/features/admin/AdminSensitiveAction";
import { AccountPicker, type AccountOption } from "@/features/print-station/AccountPicker";
import {
  deletePrintStation,
  fetchPrintStations,
  savePrintStation,
  type AdminPrintStation,
} from "@/api/domains/print.api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { appConfirm } from "@/lib/appDialog";

interface FormState {
  id?: string;
  name: string;
  account: AccountOption | null;
  pageSize: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = { name: "", account: null, pageSize: "", enabled: true };

const labelCls = "mb-1 block text-[12px] font-medium text-[var(--app-color-text-secondary)]";
const inputCls =
  "w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1.5 text-[13px] text-[var(--app-color-text-primary)] outline-none";

export default function AdminPrintStationsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading, error, refetch } = useQuery({
    queryKey: ["printStations"] as const,
    queryFn: fetchPrintStations,
  });

  const openCreate = () => setEditing({ ...EMPTY_FORM });

  const openEdit = (s: AdminPrintStation) =>
    setEditing({
      id: s.id,
      name: s.name,
      // 编辑时只拿得到 userId，显示名由服务端补；补不到就退回 userId
      account: { id: s.userId, label: s.userDisplayName || s.userId },
      pageSize: s.pageSize ?? "",
      enabled: s.enabled,
    });

  const onSubmit = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("工位名不能为空");
      return;
    }
    if (!editing.account) {
      toast.error("请选择打印者账号");
      return;
    }
    setSaving(true);
    try {
      await savePrintStation({
        id: editing.id,
        name: editing.name.trim(),
        userId: editing.account.id,
        pageSize: editing.pageSize.trim() || null,
        enabled: editing.enabled,
      });
      toast.success(editing.id ? "已保存" : "已新建");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["printStations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (s: AdminPrintStation) => {
    const tips = s.enabled
      ? `「${s.name}」正在启用中，删除后该工位将无法接收打印任务。确认删除？`
      : `确认删除工位「${s.name}」？`;
    if (!(await appConfirm(tips))) return;
    try {
      await deletePrintStation(s.id);
      toast.success("已删除");
      await qc.invalidateQueries({ queryKey: ["printStations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <AdminPageShell>
      {/*
        高度链：外层用显式 calc 定死高度，工具栏固定、表格区内部滚动，整页不下滚。
        不能用 AdminPageShell 的 fillHeight —— 它靠 h-full 吃父级高度，而后台布局
        给的是 auto，h-full 会退化成内容高度，行一多整页就被撑开。
        /console/admin/sop 与文件模板库都是显式 calc 这个写法。
      */}
      <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[320px] flex-col gap-3">
        <div className="flex shrink-0 items-center justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]"
          >
            <Plus className="size-4" />
            新建工位
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <AdminTableShell
            loading={isLoading}
            error={error ? (error instanceof Error ? error.message : "加载失败") : null}
            onRetry={() => void refetch()}
            empty={rows.length === 0}
            emptyMessage="还没有打印工位。点右上角「新建工位」添加第一台。"
          >
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--app-color-surface-container)] text-xs text-[var(--app-color-text-secondary)]">
                <tr>
                  <th className="px-3 py-2">工位名</th>
                  <th className="px-3 py-2">打印者账号</th>
                  <th className="px-3 py-2">纸张尺寸</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-t border-[var(--app-color-border-default)]">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[var(--app-color-text-primary)]">
                        <Printer className="size-3.5 text-[var(--app-color-text-tertiary)]" />
                        {s.name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--app-color-text-secondary)]">
                      {s.userDisplayName || s.userId}
                    </td>
                    <td className="px-3 py-2 text-[var(--app-color-text-secondary)]">
                      {s.pageSize || (
                        <span className="text-[var(--app-color-text-tertiary)]">驱动默认</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="review-status" data-tone={s.enabled ? "ok" : "none"}>
                        {s.enabled ? "启用中" : "已停用"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-3">
                        <button
                          type="button"
                          className="text-xs font-medium text-[var(--app-color-text-primary)] hover:underline"
                          onClick={() => openEdit(s)}
                        >
                          编辑
                        </button>
                        <AdminSensitiveAction
                          label="删除打印工位"
                          visibilityMinRole="ADMIN"
                          configureMinRole="SUPER_ADMIN"
                        >
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--app-color-feedback-error)]"
                            onClick={() => void onDelete(s)}
                          >
                            <Trash2 className="size-3.5" />
                            删除
                          </button>
                        </AdminSensitiveAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableShell>
        </div>
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "编辑工位" : "新建工位"}</DialogTitle>
            <DialogDescription>
              绑定后，该账号所在电脑打开 /print-station 即可接收打印任务。
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>工位名</label>
                <input
                  className={inputCls}
                  value={editing.name}
                  placeholder="如：斑马卡牌机"
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>

              <div>
                <label className={labelCls}>打印者账号</label>
                <AccountPicker
                  value={editing.account}
                  onChange={(v) => setEditing({ ...editing, account: v })}
                  placeholder="搜用户名或昵称…"
                />
                <p className="mt-1 text-[11px] text-[var(--app-color-text-tertiary)]">
                  一个账号只能绑一个工位。工位电脑用这个账号登录。
                </p>
              </div>

              <div>
                <label className={labelCls}>纸张尺寸</label>
                <input
                  className={inputCls}
                  value={editing.pageSize}
                  placeholder="留空 = 用驱动默认；卡片机填 85.6mm 54mm"
                  onChange={(e) => setEditing({ ...editing, pageSize: e.target.value })}
                />
              </div>

              <label className="flex items-center gap-2 text-[13px] text-[var(--app-color-text-primary)]">
                <input
                  type="checkbox"
                  checked={editing.enabled}
                  onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                />
                启用（停用后不派任务，也不出现在打印下拉里）
              </label>
            </div>
          ) : null}

          <DialogFooter>
            <button
              type="button"
              className="rounded-md border border-[var(--app-color-border-default)] px-3 py-1.5 text-sm text-[var(--app-color-text-primary)]"
              onClick={() => setEditing(null)}
            >
              取消
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-md bg-[var(--twin-primary)] px-3 py-1.5 text-sm font-medium text-[var(--twin-on-primary)] disabled:opacity-50"
              onClick={() => void onSubmit()}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  );
}
