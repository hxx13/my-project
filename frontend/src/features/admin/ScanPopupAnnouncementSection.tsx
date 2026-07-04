import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { GripVertical, Pencil, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  createScanPopupAnnouncement,
  deleteScanPopupAnnouncement,
  getScanPopupAnnouncementSettings,
  listScanPopupAnnouncements,
  saveScanPopupAnnouncementSettings,
  UNBOUND_APPLY_ROLE_OPTIONS,
  updateScanPopupAnnouncement,
  type ScanPopupAnnouncementRow,
  type ScanPopupAnnouncementSettings,
  type UnboundApplyRoleCode,
} from "@/api/domains/scanPopupAnnouncement.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { cn } from "@/lib/utils";
import {
  SCAN_OPERATOR_ROLE_HINT_ANNOUNCEMENT,
  SCAN_OPERATOR_ROLE_LABEL,
} from "@/features/admin/scanOperatorRoleHint";

const inputBase =
  "w-full rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] shadow-twin-level-1 outline-none transition placeholder:text-[var(--twin-mute)] focus-visible:border-[var(--twin-hairline-strong)] focus-visible:ring-2 focus-visible:ring-[color:var(--admin-focus-ring)]/40";

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = String(iso).trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 输入框产出 yyyy-MM-ddTHH:mm（无秒），后端 parseDateTime 要求 yyyy-MM-ddTHH:mm:ss，补秒避免被静默丢弃 */
function normalizeDatetimeLocal(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  // 已含秒则原样返回
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  // 缺秒则补 :00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return t + ":00";
  return t;
}

/** 公告公示时间状态：根据 publishAt / expireAt 判断当前是否在公示期内 */
type TimeStatus = "pending" | "active" | "expired" | "indefinite";

function getTimeStatus(row: ScanPopupAnnouncementRow): TimeStatus {
  const now = Date.now();
  const publish = row.publishAt ? new Date(row.publishAt).getTime() : null;
  const expire = row.expireAt ? new Date(row.expireAt).getTime() : null;

  if (!publish && !expire) return "indefinite";
  if (publish && now < publish) return "pending";
  if (expire && now >= expire) return "expired";
  return "active";
}

const TIME_STATUS_META: Record<TimeStatus, { label: string; color: string }> = {
  pending: { label: "待生效", color: "text-amber-600 bg-amber-50 border-amber-200" },
  active: { label: "生效中", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  expired: { label: "已过期", color: "text-neutral-500 bg-neutral-100 border-neutral-200" },
  indefinite: { label: "永久有效", color: "text-blue-600 bg-blue-50 border-blue-200" },
};

export function ScanPopupAnnouncementSection() {
  const [settings, setSettings] = useState<ScanPopupAnnouncementSettings>({
    enabled: true,
    showNoticeEveryScan: true,
    applyRoleCodes: ["MEMBER"],
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [rows, setRows] = useState<ScanPopupAnnouncementRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [publishAt, setPublishAt] = useState("");
  const [expireAt, setExpireAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearAutoSuppressOnSave, setClearAutoSuppressOnSave] = useState(false);

  const editRow = editId != null ? rows.find((r) => r.id === editId) : undefined;
  const editAutoSuppressCount = editRow?.autoSuppressCount ?? 0;

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      setSettings(await getScanPopupAnnouncementSettings());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "公告配置加载失败");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      setRows(await listScanPopupAnnouncements());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "公告列表加载失败");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadList();
  }, [loadSettings, loadList]);

  const resetForm = () => {
    setEditId(null);
    setTitle("");
    setContentHtml("");
    setEnabled(true);
    setSortOrder("0");
    setPublishAt("");
    setExpireAt("");
    setClearAutoSuppressOnSave(false);
  };

  const pickRow = (r: ScanPopupAnnouncementRow) => {
    setEditId(r.id);
    setTitle(r.title || "");
    setContentHtml(r.contentHtml || "");
    setEnabled(r.enabled !== false);
    setSortOrder(String(r.sortOrder ?? 0));
    setPublishAt(toDatetimeLocalValue(r.publishAt));
    setExpireAt(toDatetimeLocalValue(r.expireAt));
    setClearAutoSuppressOnSave(false);
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      const saved = await saveScanPopupAnnouncementSettings(settings);
      setSettings(saved);
      toast.success("公告全局配置已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSettingsSaving(false);
    }
  };

  const saveAnnouncement = async () => {
    if (!title.trim()) {
      toast.error("请填写公告标题");
      return;
    }
    const sort = Number(sortOrder);
    if (!Number.isFinite(sort)) {
      toast.error("排序需为数字");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        contentHtml,
        enabled,
        sortOrder: Math.floor(sort),
        publishAt: normalizeDatetimeLocal(publishAt),
        expireAt: normalizeDatetimeLocal(expireAt),
        status: "ACTIVE",
      };
      if (editId != null) {
        const updated = await updateScanPopupAnnouncement(editId, {
          ...body,
          clearAutoSuppress: clearAutoSuppressOnSave,
        });
        const cleared = updated.clearedAutoSuppressCount ?? 0;
        if (clearAutoSuppressOnSave) {
          toast.success(
            cleared > 0
              ? `公告已保存，已清空 ${cleared} 条「不再弹出」记录，被扫码人员将重新自动弹出`
              : "公告已保存（当前无「不再弹出」记录需清空）"
          );
          setClearAutoSuppressOnSave(false);
        } else {
          toast.success("公告已更新");
        }
        // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      } else {
        const created = await createScanPopupAnnouncement(body);
        toast.success("公告已发布");
        setRows((prev) => [created, ...prev]);
        resetForm();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!window.confirm("确定删除该公告？")) return;
    try {
      await deleteScanPopupAnnouncement(id);
      toast.success("已删除");
      if (editId === id) resetForm();
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  // ── 拖拽排序 ──
  const dragSrcIndexRef = useRef<number | null>(null);

  const onDragStart = useCallback((index: number) => {
    dragSrcIndexRef.current = index;
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, _index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    async (targetIndex: number) => {
      const srcIndex = dragSrcIndexRef.current;
      dragSrcIndexRef.current = null;
      if (srcIndex == null || srcIndex === targetIndex) return;

      const list = [...rows];
      const dragged = list[srcIndex];
      if (!dragged?.id) return;

      // 计算新 sortOrder：插入到目标位置的前后两项之间
      let newSortOrder: number;
      if (targetIndex === 0) {
        // 拖到最前：比当前第一项大 10
        newSortOrder = (list[0].sortOrder ?? 0) + 10;
      } else if (targetIndex >= list.length - 1) {
        // 拖到最后：比当前最后一项小 10，不低于 0
        newSortOrder = Math.max(0, (list[list.length - 1].sortOrder ?? 0) - 10);
      } else {
        // 拖到中间：取前后两项 sortOrder 的平均值
        const prevOrder = list[targetIndex > srcIndex ? targetIndex : targetIndex - 1].sortOrder ?? 0;
        const nextOrder = list[targetIndex > srcIndex ? targetIndex + 1 : targetIndex].sortOrder ?? 0;
        newSortOrder = Math.floor((prevOrder + nextOrder) / 2);
        // 如果平均值与前后重合，则微调
        if (newSortOrder === prevOrder || newSortOrder === nextOrder) {
          newSortOrder = prevOrder - 1;
        }
      }

      // 乐观更新本地顺序
      const reordered = [...list];
      reordered.splice(srcIndex, 1);
      reordered.splice(targetIndex, 0, dragged);
      setRows(reordered);

      // 持久化到后端
      try {
        await updateScanPopupAnnouncement(dragged.id, {
          title: dragged.title,
          contentHtml: dragged.contentHtml ?? "",
          enabled: dragged.enabled !== false,
          sortOrder: newSortOrder,
          publishAt: dragged.publishAt ?? null,
          expireAt: dragged.expireAt ?? null,
          status: dragged.status ?? "ACTIVE",
        });
        // 静默更新本地 sortOrder 为服务端确认值
        setRows((prev) =>
          prev.map((r) => (r.id === dragged.id ? { ...r, sortOrder: newSortOrder } : r))
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "排序保存失败，请刷新");
        void loadList();
      }
    },
    [rows, loadList]
  );

  const onDragEnd = useCallback(() => {
    dragSrcIndexRef.current = null;
  }, []);

  return (
    <div className="admin-violations-tab-panel">
      <AdminFormCard
        title="扫码弹窗公告"
        description="复用违规警示同款弹窗；支持富文本与插图，多条公告在扫码端翻页查看。生效范围与「未绑卡扫码提示」相同：按当前登录操作员 sys_user 角色（默认仅学生）。"
      >
        <div className="admin-violation-form-body">
          <div className="admin-form-toggle-row">
            <label className="flex items-center gap-2 text-sm text-[var(--twin-ink)]">
              <AdminSwitchScaled
                size="sm"
                checked={settings.enabled}
                disabled={settingsLoading}
                onChange={(checked) => setSettings((s) => ({ ...s, enabled: checked }))}
              />
              启用扫码公告
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--twin-ink)]">
              <AdminSwitchScaled
                size="sm"
                checked={settings.showNoticeEveryScan}
                disabled={settingsLoading}
                onChange={(checked) => setSettings((s) => ({ ...s, showNoticeEveryScan: checked }))}
              />
              每次扫码自动展开
            </label>
            <AdminButton
              type="button"
              tone="primary"
              className="gap-1.5"
              loading={settingsSaving}
              disabled={settingsLoading}
              onClick={() => void saveSettings()}
            >
              <Save className="h-4 w-4" aria-hidden />
              保存全局配置
            </AdminButton>
          </div>
          <div className="admin-form-field">
            <label className="admin-form-field-label">{SCAN_OPERATOR_ROLE_LABEL}</label>
            <p className="admin-form-field-hint">{SCAN_OPERATOR_ROLE_HINT_ANNOUNCEMENT}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {UNBOUND_APPLY_ROLE_OPTIONS.map((opt) => {
                const checked = settings.applyRoleCodes.includes(opt.code);
                return (
                  <label
                    key={opt.code}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                      checked ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)]",
                      (settingsLoading || !settings.enabled) && "opacity-60"
                    )}
                  >
                    <AdminSwitchScaled
                      size="sm"
                      checked={checked}
                      disabled={settingsLoading || !settings.enabled}
                      onChange={(nextChecked) => {
                        setSettings((s) => {
                          const set = new Set(s.applyRoleCodes);
                          if (nextChecked) set.add(opt.code);
                          else set.delete(opt.code);
                          const next = Array.from(set) as UnboundApplyRoleCode[];
                          return { ...s, applyRoleCodes: next.length ? next : ["MEMBER"] };
                        });
                      }}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </AdminFormCard>

      <AdminFormCard title={editId != null ? `编辑公告 #${editId}` : "新建公告"} description="正文支持富文本；图片可通过编辑器插入。">
        <div className="admin-violation-form-body">
          <div className="admin-form-field">
            <label className="admin-form-field-label">标题</label>
            <input className={inputBase} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="admin-form-field">
            <label className="admin-form-field-label">正文（富文本）</label>
            <div className="admin-rich-text-field">
              <RichTextEditor value={contentHtml} onChange={setContentHtml} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm">
              <AdminSwitchScaled size="sm" checked={enabled} onChange={setEnabled} />
              启用展示
            </label>
            <div>
              <label className="admin-form-field-label">排序（大靠前）</label>
              <input className={cn(inputBase, "mt-1")} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
            <div>
              <label className="admin-form-field-label">最早展示</label>
              <input
                type="datetime-local"
                className={cn(inputBase, "mt-1")}
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
              />
            </div>
            <div>
              <label className="admin-form-field-label">过期时间</label>
              <input
                type="datetime-local"
                className={cn(inputBase, "mt-1")}
                value={expireAt}
                onChange={(e) => setExpireAt(e.target.value)}
              />
            </div>
          </div>
          {editId != null && editAutoSuppressCount > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-950">
              <AdminSwitchScaled
                size="sm"
                id="clear-auto-suppress-checkbox"
                className="mt-0.5"
                checked={clearAutoSuppressOnSave}
                onChange={setClearAutoSuppressOnSave}
              />
              <label htmlFor="clear-auto-suppress-checkbox" className="cursor-pointer">
                <span className="font-medium">公告已更新，清空「下次不再弹出」记录</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-amber-900/85">
                  当前 {editAutoSuppressCount} 位被扫码人员已选择不再自动弹出。勾选后随「保存修改」一并清空，他们下次扫码将重新看到此公告；不勾选则仅保存内容，不会重弹。
                </span>
              </label>
            </div>
          ) : null}
          <div className="admin-form-actions border-t border-[var(--twin-hairline)] pt-3">
            <AdminButton type="button" tone="primary" loading={saving} className="gap-1.5" onClick={() => void saveAnnouncement()}>
              <Save className="h-4 w-4" aria-hidden />
              {editId != null ? "保存修改" : "发布公告"}
            </AdminButton>
            {editId != null ? (
              <AdminButton type="button" tone="secondary" onClick={resetForm}>
                取消编辑
              </AdminButton>
            ) : null}
          </div>
          {editId != null ? (
            <p className="admin-form-field-hint">
              {editAutoSuppressCount > 0
                ? "修改标题或正文后，是否让被扫码人员重新自动弹出，由上方勾选控制；未勾选时「不再弹出」偏好继续有效。"
                : "新发布公告会自动弹出；当前尚无被扫码人员选择「不再弹出」此公告。"}
            </p>
          ) : null}
        </div>
      </AdminFormCard>

      <AdminFormCard title="公告列表" description="拖拽左侧手柄可调整排序；排序大者靠前，扫码端多条平铺时按排序决定左右顺序。">
        <div className="mb-3 flex justify-end">
          <AdminButton type="button" tone="secondary" loading={listLoading} className="gap-1.5" onClick={() => void loadList()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            刷新列表
          </AdminButton>
        </div>
        {listLoading ? (
          <p className="text-sm text-[var(--twin-mute)]">加载中…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--twin-mute)]">暂无公告</p>
        ) : (
          <ul className="divide-y divide-[var(--twin-hairline)] rounded-twin-lg border border-[var(--twin-hairline)]">
            {rows.map((r, idx) => {
              const timeStatus = getTimeStatus(r);
              const statusMeta = TIME_STATUS_META[timeStatus];
              return (
              <li
                key={r.id}
                draggable
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm transition-colors",
                  editId === r.id && "bg-indigo-50/80",
                  "cursor-default select-none"
                )}
                onDragStart={() => onDragStart(idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDrop={() => void onDrop(idx)}
                onDragEnd={onDragEnd}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="shrink-0 cursor-grab text-[var(--twin-mute)] hover:text-[var(--twin-body)] active:cursor-grabbing"
                    title="拖拽排序"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--twin-ink)]">
                      #{r.id} {r.title}
                      {r.enabled === false ? (
                        <span className="ml-2 text-xs text-[var(--twin-mute)]">（已停用）</span>
                      ) : null}
                      {editId === r.id ? (
                        <span className="ml-2 rounded border border-indigo-200 bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">
                          编辑中
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-[var(--twin-mute)] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>排序 {r.sortOrder ?? 0}</span>
                      <span className={cn("rounded-full border px-1.5 py-px text-[10px] font-medium", statusMeta.color)}>
                        {statusMeta.label}
                      </span>
                      {r.publishAt ? (
                        <span>{new Date(r.publishAt).toLocaleDateString("zh-CN")} 起</span>
                      ) : null}
                      {r.expireAt ? (
                        <span>至 {new Date(r.expireAt).toLocaleDateString("zh-CN")}</span>
                      ) : null}
                      {(r.autoSuppressCount ?? 0) > 0 ? (
                        <span className="text-amber-700">· {r.autoSuppressCount} 人已选不再弹出</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <AdminButton
                    type="button"
                    tone="secondary"
                    size="sm"
                    active={editId === r.id}
                    className="gap-1"
                    onClick={() => pickRow(r)}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    编辑
                  </AdminButton>
                  <AdminButton type="button" tone="destructive" size="sm" className="gap-1" onClick={() => void onDelete(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    删除
                  </AdminButton>
                </div>
              </li>
            );
            })}
          </ul>
        )}
      </AdminFormCard>
    </div>
  );
}
