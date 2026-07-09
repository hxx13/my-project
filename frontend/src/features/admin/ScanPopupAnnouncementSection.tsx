import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
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

function normalizeDatetimeLocal(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return t + ":00";
  return t;
}

export type TimeStatus = "pending" | "active" | "expired" | "indefinite";
export function getTimeStatus(row: ScanPopupAnnouncementRow): TimeStatus {
  const now = Date.now();
  const publish = row.publishAt ? new Date(row.publishAt).getTime() : null;
  const expire = row.expireAt ? new Date(row.expireAt).getTime() : null;
  if (!publish && !expire) return "indefinite";
  if (publish && now < publish) return "pending";
  if (expire && now >= expire) return "expired";
  return "active";
}
export const TIME_STATUS_META: Record<TimeStatus, { label: string; color: string }> = {
  pending: { label: "待生效", color: "text-amber-600 bg-amber-50 border-amber-200" },
  active: { label: "生效中", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  expired: { label: "已过期", color: "text-neutral-500 bg-neutral-100 border-neutral-200" },
  indefinite: { label: "永久有效", color: "text-blue-600 bg-blue-50 border-blue-200" },
};

export type AnnounceSectionHandle = {
  settings: ScanPopupAnnouncementSettings;
  setSettings: (s: ScanPopupAnnouncementSettings) => void;
  settingsLoading: boolean;
  saveSettings: () => Promise<void>;
  rows: ScanPopupAnnouncementRow[];
  setRows: React.Dispatch<React.SetStateAction<ScanPopupAnnouncementRow[]>>;
  listLoading: boolean;
  loadList: () => Promise<void>;
  pickRow: (r: ScanPopupAnnouncementRow) => void;
  onDelete: (id: number) => Promise<void>;
  editId: number | null;
  resetForm: () => void;
};

export const ScanPopupAnnouncementSection = forwardRef<AnnounceSectionHandle>(function (_props, ref) {
  const [settings, setSettings] = useState<ScanPopupAnnouncementSettings>({ enabled: true, showNoticeEveryScan: true, applyRoleCodes: ["MEMBER"] });
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
    try { setSettings(await getScanPopupAnnouncementSettings()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "公告配置加载失败"); }
    finally { setSettingsLoading(false); }
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try { setRows(await listScanPopupAnnouncements()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "公告列表加载失败"); }
    finally { setListLoading(false); }
  }, []);

  useEffect(() => { void loadSettings(); void loadList(); }, [loadSettings, loadList]);

  const saveSettings = useCallback(async () => {
    setSettingsSaving(true);
    try { const saved = await saveScanPopupAnnouncementSettings(settings); setSettings(saved); toast.success("显示设置已保存"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSettingsSaving(false); }
  }, [settings]);

  const pickRow = useCallback((r: ScanPopupAnnouncementRow) => {
    setEditId(r.id); setTitle(r.title || ""); setContentHtml(r.contentHtml || "");
    setEnabled(r.enabled !== false); setSortOrder(String(r.sortOrder ?? 0));
    setPublishAt(toDatetimeLocalValue(r.publishAt)); setExpireAt(toDatetimeLocalValue(r.expireAt));
    setClearAutoSuppressOnSave(false);
  }, []);

  const resetForm = () => {
    if (editId != null && title.trim() && !window.confirm("当前正在编辑公告，是否放弃修改？")) return;
    setEditId(null); setTitle(""); setContentHtml(""); setEnabled(true); setSortOrder("0"); setPublishAt(""); setExpireAt(""); setClearAutoSuppressOnSave(false);
  };

  const saveAnnouncement = async () => {
    if (!title.trim()) { toast.error("请填写公告标题"); return; }
    const sort = Number(sortOrder);
    if (!Number.isFinite(sort)) { toast.error("排序需为数字"); return; }
    setSaving(true);
    try {
      const body = { title: title.trim(), contentHtml, enabled, sortOrder: Math.floor(sort), publishAt: normalizeDatetimeLocal(publishAt), expireAt: normalizeDatetimeLocal(expireAt), status: "ACTIVE" };
      if (editId != null) {
        const updated = await updateScanPopupAnnouncement(editId, { ...body, clearAutoSuppress: clearAutoSuppressOnSave });
        toast.success("公告已更新");
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      } else {
        const created = await createScanPopupAnnouncement(body);
        toast.success("公告已发布");
        setRows((prev) => [created, ...prev]);
        resetForm();
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  };

  const onDelete = useCallback(async (id: number) => {
    if (!window.confirm("确定删除该公告？")) return;
    try { await deleteScanPopupAnnouncement(id); toast.success("已删除"); if (editId === id) resetForm(); setRows((prev) => prev.filter((r) => r.id !== id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "删除失败"); }
  }, [editId]);

  // Drag sort
  const dragSrcIndexRef = useRef<number | null>(null);
  const onDragStart = useCallback((index: number) => { dragSrcIndexRef.current = index; }, []);
  const onDragOver = useCallback((e: React.DragEvent, _index: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }, []);
  const onDrop = useCallback(async (targetIndex: number) => {
    const srcIndex = dragSrcIndexRef.current; dragSrcIndexRef.current = null;
    if (srcIndex == null || srcIndex === targetIndex) return;
    const list = [...rows]; const dragged = list[srcIndex]; if (!dragged?.id) return;
    let newSortOrder: number;
    if (targetIndex === 0) newSortOrder = (list[0].sortOrder ?? 0) + 10;
    else if (targetIndex >= list.length - 1) newSortOrder = Math.max(0, (list[list.length - 1].sortOrder ?? 0) - 10);
    else { const prevOrder = list[targetIndex > srcIndex ? targetIndex : targetIndex - 1].sortOrder ?? 0; const nextOrder = list[targetIndex > srcIndex ? targetIndex + 1 : targetIndex].sortOrder ?? 0; newSortOrder = Math.floor((prevOrder + nextOrder) / 2); if (newSortOrder === prevOrder || newSortOrder === nextOrder) newSortOrder = prevOrder - 1; }
    const reordered = [...list]; reordered.splice(srcIndex, 1); reordered.splice(targetIndex, 0, dragged); setRows(reordered);
    try { await updateScanPopupAnnouncement(dragged.id, { title: dragged.title, contentHtml: dragged.contentHtml ?? "", enabled: dragged.enabled !== false, sortOrder: newSortOrder, publishAt: dragged.publishAt ?? null, expireAt: dragged.expireAt ?? null, status: dragged.status ?? "ACTIVE" }); setRows((prev) => prev.map((r) => (r.id === dragged.id ? { ...r, sortOrder: newSortOrder } : r))); }
    catch (e) { toast.error(e instanceof Error ? e.message : "排序保存失败，请刷新"); void loadList(); }
  }, [rows, loadList]);
  const onDragEnd = useCallback(() => { dragSrcIndexRef.current = null; }, []);

  // Expose state for parent dropdowns
  useImperativeHandle(ref, () => ({
    settings, setSettings, settingsLoading, saveSettings,
    rows, setRows, listLoading, loadList, pickRow, onDelete, editId, resetForm,
  }), [settings, settingsLoading, saveSettings, rows, listLoading, loadList, pickRow, onDelete, editId, title]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-5">
        <div className="admin-form-field">
          <label className="admin-form-field-label">标题</label>
          <input className={inputBase} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="admin-form-field mt-4">
          <label className="admin-form-field-label">正文（富文本）</label>
          <div className="admin-rich-text-field mt-1.5">
            <RichTextEditor value={contentHtml} onChange={setContentHtml} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
          <label className="flex items-center gap-2 text-sm">
            <AdminSwitchScaled size="sm" checked={enabled} onChange={setEnabled} />启用展示
          </label>
          <div>
            <label className="admin-form-field-label">排序（大靠前）</label>
            <input className={cn(inputBase, "mt-1")} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
          <div>
            <label className="admin-form-field-label">最早展示</label>
            <input type="datetime-local" className={cn(inputBase, "mt-1")} value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
          </div>
          <div>
            <label className="admin-form-field-label">过期时间</label>
            <input type="datetime-local" className={cn(inputBase, "mt-1")} value={expireAt} onChange={(e) => setExpireAt(e.target.value)} />
          </div>
        </div>
        {editId != null && editAutoSuppressCount > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-950 mt-4">
            <AdminSwitchScaled size="sm" id="clear-auto-suppress-checkbox" className="mt-0.5" checked={clearAutoSuppressOnSave} onChange={setClearAutoSuppressOnSave} />
            <label htmlFor="clear-auto-suppress-checkbox" className="cursor-pointer">
              <span className="font-medium">公告已更新，清空「下次不再弹出」记录</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-amber-900/85">当前 {editAutoSuppressCount} 位被扫码人员已选择不再自动弹出。</span>
            </label>
          </div>
        )}
      </div>
      <div className="shrink-0 flex justify-end gap-3 px-5 py-4 border-t border-[var(--app-color-border-default)]">
        {editId != null ? <AdminButton type="button" tone="secondary" onClick={resetForm}>取消编辑</AdminButton> : null}
        <AdminButton type="button" tone="primary" loading={saving} className="gap-1.5" onClick={() => void saveAnnouncement()}>
          <Save className="h-4 w-4" aria-hidden />{editId != null ? "保存修改" : "发布公告"}
        </AdminButton>
      </div>
    </div>
  );
});
