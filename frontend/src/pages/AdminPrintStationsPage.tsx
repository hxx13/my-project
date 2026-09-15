import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Printer, Trash2 } from "lucide-react";
import { AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSensitiveAction } from "@/features/admin/AdminSensitiveAction";
import { AccountPicker, type AccountOption } from "@/features/print-station/AccountPicker";
import {
  FILE_GROUPS,
  stationSupports,
  type FileGroup,
} from "@/features/print-station/printableTypes";
import {
  deletePrintStation,
  fetchPrintStations,
  reloadPrintStation,
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
  /** 打印机 IP，纯记录用（现场排查时知道这台工位连的是哪台机器） */
  printerIp: string;
  /** 勾选的类型分组。**全选 = 不限制**（存 null），与后端口径一致 */
  supportedTypes: FileGroup[];
  enabled: boolean;
}

const ALL_GROUPS: FileGroup[] = FILE_GROUPS.map((g) => g.key);

const EMPTY_FORM: FormState = {
  name: "",
  account: null,
  pageSize: "",
  printerIp: "",
  supportedTypes: [...ALL_GROUPS],
  enabled: true,
};

/** 存的是逗号分隔串；空串/NULL 都表示不限制 */
function parseTypes(v: string | null | undefined): FileGroup[] {
  if (!v || !v.trim()) return [...ALL_GROUPS];
  const set = new Set(v.split(",").map((s) => s.trim().toLowerCase()));
  return ALL_GROUPS.filter((g) => set.has(g));
}

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
      printerIp: s.printerIp ?? "",
      supportedTypes: parseTypes(s.supportedTypes),
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
    if (editing.supportedTypes.length === 0) {
      toast.error("至少要支持一种文件类型；想取消限制就把五种都勾上");
      return;
    }
    setSaving(true);
    try {
      await savePrintStation({
        id: editing.id,
        name: editing.name.trim(),
        userId: editing.account.id,
        pageSize: editing.pageSize.trim() || null,
        printerIp: editing.printerIp.trim() || null,
        // 全选 = 不限制，存 null（与后端一致）。否则存实际勾选的分组
        supportedTypes:
          editing.supportedTypes.length === ALL_GROUPS.length
            ? null
            : editing.supportedTypes.join(","),
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

  /** 远程让工位页刷新。工位机无人值守，部署或改配置后不用跑过去按 F5。 */
  const onReload = async (s: AdminPrintStation) => {
    try {
      await reloadPrintStation(s.id);
      toast.success(`已通知「${s.name}」的页面刷新`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发送失败");
    }
  };

  const onDelete = async (s: AdminPrintStation) => {    const tips = s.enabled
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
                  <th className="px-3 py-2">支持类型</th>
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
                      {s.printerIp ? (
                        <div className="mt-0.5 text-[11px] text-[var(--app-color-text-tertiary)]">
                          {s.printerIp}
                        </div>
                      ) : null}
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        {FILE_GROUPS.map((g) => {
                          const on = stationSupports(s.supportedTypes, g.key);
                          return (
                            <span
                              key={g.key}
                              title={`${g.label}：${on ? "支持" : "不支持"}`}
                              className={
                                "inline-flex items-center gap-1 text-[11px] " +
                                (on
                                  ? "text-[var(--app-color-feedback-success)]"
                                  : "text-[var(--app-color-text-tertiary)] opacity-60")
                              }
                            >
                              <span
                                className={
                                  "size-2 shrink-0 rounded-full " +
                                  (on
                                    ? "bg-[var(--app-color-feedback-success)]"
                                    : "bg-[var(--app-color-text-tertiary)] opacity-50")
                                }
                              />
                              {g.label}
                            </span>
                          );
                        })}
                        {!s.supportedTypes?.trim() ? (
                          <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
                            （未限制）
                          </span>
                        ) : null}
                      </div>
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
                        <button
                          type="button"
                          className="text-xs font-medium text-[var(--app-color-text-primary)] hover:underline"
                          title="让那台机器的页面重新加载（部署或改配置后用）"
                          onClick={() => void onReload(s)}
                        >
                          刷新页面
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

              <div>
                <label className={labelCls}>打印机 IP（可选）</label>
                <input
                  className={inputCls}
                  value={editing.printerIp}
                  placeholder="如 172.22.138.6；只作记录，不影响打印"
                  onChange={(e) => setEditing({ ...editing, printerIp: e.target.value })}
                />
                <p className="mt-1 text-[11px] text-[var(--app-color-text-tertiary)]">
                  纯记录用 —— 现场排查「这台打不出来」时，先看它连的是哪台机器。
                  打印仍然走这台工位电脑的默认打印机，后端不会按这个 IP 直接发送数据。
                </p>
              </div>

              <div>
                <label className={labelCls}>支持的文件类型</label>
                <div className="flex flex-wrap gap-1.5">
                  {FILE_GROUPS.map((g) => {
                    const on = editing.supportedTypes.includes(g.key);
                    return (
                      <button
                        key={g.key}
                        type="button"
                        title={on ? "这台机器能打" : "这台机器不接"}
                        onClick={() =>
                          setEditing({
                            ...editing,
                            supportedTypes: on
                              ? editing.supportedTypes.filter((k) => k !== g.key)
                              : ALL_GROUPS.filter((k) => k === g.key || editing.supportedTypes.includes(k)),
                          })
                        }
                        className={
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition " +
                          (on
                            ? "border-[color-mix(in_srgb,var(--app-color-feedback-success)_40%,transparent)] bg-[color-mix(in_srgb,var(--app-color-feedback-success)_12%,transparent)] font-medium text-[var(--app-color-feedback-success)]"
                            : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-tertiary)]")
                        }
                      >
                        <span
                          className={
                            "size-2 shrink-0 rounded-full " +
                            (on
                              ? "bg-[var(--app-color-feedback-success)]"
                              : "bg-[var(--app-color-text-tertiary)] opacity-50")
                          }
                        />
                        {g.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-[var(--app-color-text-tertiary)]">
                  绿灯 = 这台机器能打。**五种全勾 = 不限制**；派发时会给用户红绿灯提示，
                  免得打到一半卡住打印机。
                </p>
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
