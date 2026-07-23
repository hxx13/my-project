import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createAccessCleanRuleProfile,
  deleteAccessCleanRuleProfile,
  listAccessCleanRuleProfiles,
  updateAccessCleanRuleProfile,
  type AccessCleanRuleProfile,
} from "@/api/domains/accessFusion.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminRightDrawer } from "@/components/admin/AdminRightDrawer";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminHintClass, adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { labelSwingDirectionFilter } from "@/features/access-fusion/swingDirection";

const DEBOUNCE_MIN = 5;
const DEBOUNCE_MAX = 3600;
const DEBOUNCE_DEFAULT = 45;

const DIRECTION_OPTIONS = [
  { value: "ALL", label: "进出：全部" },
  { value: "ENTER", label: "仅进入" },
  { value: "EXIT", label: "仅离开" },
];

function emptyForm(): AccessCleanRuleProfile {
  return {
    name: "",
    description: "",
    debounceSeconds: DEBOUNCE_DEFAULT,
    swingDirectionFilter: "ALL",
    autoCleanPackage: 1,
    requireMapping: 0,
    openSuccessOnly: 1,
    defaultDoorMode: "DAHUA_ENTER_EXIT",
  };
}

function profileToForm(p: AccessCleanRuleProfile): AccessCleanRuleProfile {
  const dir = (p.swingDirectionFilter || "ALL").toUpperCase();
  return {
    ...p,
    swingDirectionFilter: dir === "ENTER" || dir === "EXIT" ? dir : "ALL",
    autoCleanPackage: p.autoCleanPackage ?? 1,
    requireMapping: p.requireMapping ?? 0,
    openSuccessOnly: p.openSuccessOnly ?? 1,
  };
}

function ruleSummary(p: AccessCleanRuleProfile): string {
  const parts = [
    `去抖 ${p.debounceSeconds ?? DEBOUNCE_DEFAULT}s`,
    labelSwingDirectionFilter(p.swingDirectionFilter),
    p.requireMapping ? "仅已映射" : "不限制映射",
    p.openSuccessOnly !== 0 ? "仅开门成功" : "含失败开门",
    p.autoCleanPackage !== 0 ? "自动入库" : "不自动入库",
  ];
  return parts.join(" · ");
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** 清洗规则方案：由门禁统计清洗页工具栏按钮打开，不再单独占侧栏入口 */
export function AccessCleanRuleProfilesModal({ open, onOpenChange }: Props) {
  const [list, setList] = useState<AccessCleanRuleProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AccessCleanRuleProfile>(emptyForm());

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      setList(await listAccessCleanRuleProfiles());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载方案失败");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

  const openCreate = () => {
    setForm(emptyForm());
    setDrawerOpen(true);
  };

  const openEdit = (p: AccessCleanRuleProfile) => {
    setForm(profileToForm(p));
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("请填写方案名称");
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        const updated = await updateAccessCleanRuleProfile(form.id, form);
        // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
        setList((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        toast.success("已更新方案");
      } else {
        const created = await createAccessCleanRuleProfile(form);
        setList((prev) => [...prev, created]);
        toast.success("已创建方案");
      }
      setDrawerOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: AccessCleanRuleProfile) => {
    if (!p.id) return;
    if (!window.confirm(`确定删除方案「${p.name}」？已绑定该方案的审计任务需改选其他方案。`)) return;
    try {
      await deleteAccessCleanRuleProfile(p.id);
      setList((prev) => prev.filter((r) => r.id !== p.id));
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[min(90vh,52rem)] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>清洗规则方案</DialogTitle>
            <DialogDescription>
              全局共享的清洗规则，各审计拉取任务在任务编辑里选择方案即可。修改方案后若总库按旧规则入库，请先清空清洗总库再重新入库。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <AdminButton onClick={openCreate}>
              <Plus className="h-4 w-4" />
              新建方案
            </AdminButton>
          </div>
          <AdminTableShell>
            {loading ? (
              <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载中…
              </p>
            ) : list.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">暂无方案，点击「新建方案」或使用系统种子方案。</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">名称</th>
                    <th className="px-3 py-2">规则摘要</th>
                    <th className="px-3 py-2">说明</th>
                    <th className="px-3 py-2 w-28">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {p.name}
                        {p.name?.includes("迁移") || p.name?.startsWith("任务·") ? (
                          <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">遗留</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{ruleSummary(p)}</td>
                      <td className="px-3 py-2 text-slate-500 max-w-md">{p.description || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 hover:bg-slate-50"
                            onClick={() => openEdit(p)}
                            title="编辑"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-rose-700 hover:bg-rose-50"
                            onClick={() => void handleDelete(p)}
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </AdminTableShell>
          <p className={adminHintClass}>
            推荐任务绑定「标准纳入（推荐）」：不按学生/工作人员排除流水，仅按开门成功与去抖合并。
          </p>
        </DialogContent>
      </Dialog>

      <AdminRightDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={form.id ? "编辑清洗方案" : "新建清洗方案"}
        description="保存后，已绑定本方案的审计任务将立即按新规则执行后续自动入库。"
        footer={
          <AdminButton className="w-full" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "保存中…" : "保存方案"}
          </AdminButton>
        }
      >
        <AdminFormCard title="方案参数" className="space-y-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className={adminLabelClass}>方案名称</span>
            <input
              className={adminInputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={adminLabelClass}>说明</span>
            <textarea
              className={adminInputClass}
              rows={2}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={adminLabelClass}>去抖间隔（秒，{DEBOUNCE_MIN}–{DEBOUNCE_MAX}）</span>
            <input
              type="number"
              min={DEBOUNCE_MIN}
              max={DEBOUNCE_MAX}
              className={adminInputClass}
              value={form.debounceSeconds ?? DEBOUNCE_DEFAULT}
              onChange={(e) => setForm({ ...form, debounceSeconds: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={adminLabelClass}>进出方向</span>
            <select
              className={adminInputClass}
              value={form.swingDirectionFilter ?? "ALL"}
              onChange={(e) => setForm({ ...form, swingDirectionFilter: e.target.value })}
            >
              {DIRECTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <AdminSwitchScaled
              size="sm"
              checked={form.requireMapping === 1}
              onChange={(checked) => setForm({ ...form, requireMapping: checked ? 1 : 0 })}
            />
            <span>仅纳入已在系统中映射 ARO 的刷卡人（未映射记录排除）</span>
          </label>
          <label className="flex items-center gap-2">
            <AdminSwitchScaled
              size="sm"
              checked={form.openSuccessOnly !== 0}
              onChange={(checked) => setForm({ ...form, openSuccessOnly: checked ? 1 : 0 })}
            />
            <span>仅纳入开门成功记录</span>
          </label>
          <p className="text-[11px] text-slate-500 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
            「拉取后是否自动清洗入库」在「审计拉取」各任务开关中配置；此处仅配置去抖、映射、进出等规则参数。
          </p>
        </AdminFormCard>
      </AdminRightDrawer>
    </>
  );
}
