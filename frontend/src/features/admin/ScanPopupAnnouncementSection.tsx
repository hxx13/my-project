import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
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
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { cn } from "@/lib/utils";
import {
  SCAN_OPERATOR_ROLE_HINT_ANNOUNCEMENT,
  SCAN_OPERATOR_ROLE_LABEL,
} from "@/features/admin/scanOperatorRoleHint";

const inputBase =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25";

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = String(iso).trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScanPopupAnnouncementSection() {
  const [settings, setSettings] = useState<ScanPopupAnnouncementSettings>({
    enabled: true,
    showNoticeEveryScan: true,
    applyRoleCodes: ["STUDENT"],
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
  };

  const pickRow = (r: ScanPopupAnnouncementRow) => {
    setEditId(r.id);
    setTitle(r.title || "");
    setContentHtml(r.contentHtml || "");
    setEnabled(r.enabled !== false);
    setSortOrder(String(r.sortOrder ?? 0));
    setPublishAt(toDatetimeLocalValue(r.publishAt));
    setExpireAt(toDatetimeLocalValue(r.expireAt));
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
        publishAt: publishAt.trim() || null,
        expireAt: expireAt.trim() || null,
        status: "ACTIVE",
      };
      if (editId != null) {
        const updated = await updateScanPopupAnnouncement(editId, body);
        toast.success("公告已更新");
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

  return (
    <>
      <AdminFormCard
        title="扫码弹窗公告"
        description="复用违规警示同款弹窗；支持富文本与插图，多条公告在扫码端翻页查看。生效范围与「未绑卡扫码提示」相同：按当前登录操作员 sys_user 角色（默认仅学生）。"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300"
                checked={settings.enabled}
                disabled={settingsLoading}
                onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
              />
              启用扫码公告
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300"
                checked={settings.showNoticeEveryScan}
                disabled={settingsLoading}
                onChange={(e) => setSettings((s) => ({ ...s, showNoticeEveryScan: e.target.checked }))}
              />
              每次扫码自动展开
            </label>
            <AdminButton type="button" disabled={settingsSaving || settingsLoading} onClick={() => void saveSettings()}>
              {settingsSaving ? "保存中…" : "保存全局配置"}
            </AdminButton>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600">{SCAN_OPERATOR_ROLE_LABEL}</label>
            <p className="mt-0.5 text-[11px] text-neutral-500">{SCAN_OPERATOR_ROLE_HINT_ANNOUNCEMENT}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {UNBOUND_APPLY_ROLE_OPTIONS.map((opt) => {
                const checked = settings.applyRoleCodes.includes(opt.code);
                return (
                  <label
                    key={opt.code}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                      checked ? "border-violet-300 bg-violet-50 text-violet-900" : "border-neutral-200 bg-white",
                      (settingsLoading || !settings.enabled) && "opacity-60"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={settingsLoading || !settings.enabled}
                      onChange={(e) => {
                        setSettings((s) => {
                          const set = new Set(s.applyRoleCodes);
                          if (e.target.checked) set.add(opt.code);
                          else set.delete(opt.code);
                          const next = Array.from(set) as UnboundApplyRoleCode[];
                          return { ...s, applyRoleCodes: next.length ? next : ["STUDENT"] };
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
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-neutral-600">标题</label>
            <input className={cn(inputBase, "mt-1")} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600">正文（富文本）</label>
            <div className="mt-1">
              <RichTextEditor value={contentHtml} onChange={setContentHtml} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              启用展示
            </label>
            <div>
              <label className="text-xs text-neutral-600">排序（大靠前）</label>
              <input className={cn(inputBase, "mt-1")} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-600">最早展示</label>
              <input
                type="datetime-local"
                className={cn(inputBase, "mt-1")}
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-600">过期时间</label>
              <input
                type="datetime-local"
                className={cn(inputBase, "mt-1")}
                value={expireAt}
                onChange={(e) => setExpireAt(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdminButton type="button" tone="primary" disabled={saving} onClick={() => void saveAnnouncement()}>
              {saving ? "保存中…" : editId != null ? "保存修改" : "发布公告"}
            </AdminButton>
            {editId != null ? (
              <AdminButton type="button" tone="secondary" onClick={resetForm}>
                取消编辑
              </AdminButton>
            ) : null}
          </div>
        </div>
      </AdminFormCard>

      <AdminFormCard title="公告列表" description="按排序与 ID 倒序；扫码端多条时支持上一条/下一条翻页。">
        <div className="mb-3 flex justify-end">
          <AdminButton type="button" tone="secondary" disabled={listLoading} onClick={() => void loadList()}>
            刷新列表
          </AdminButton>
        </div>
        {listLoading ? (
          <p className="text-sm text-neutral-500">加载中…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-500">暂无公告</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-neutral-900">
                    #{r.id} {r.title}
                    {r.enabled === false ? (
                      <span className="ml-2 text-xs text-neutral-400">（已停用）</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-neutral-500">排序 {r.sortOrder ?? 0}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <AdminButton type="button" tone="secondary" size="sm" onClick={() => pickRow(r)}>
                    编辑
                  </AdminButton>
                  <AdminButton type="button" tone="destructive" size="sm" onClick={() => void onDelete(r.id)}>
                    删除
                  </AdminButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminFormCard>
    </>
  );
}
