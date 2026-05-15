import { useCallback, useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import toast from "react-hot-toast";
import { AdminPageShell, AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import {
  createMpAnnouncement,
  createMpRelease,
  deleteMpAnnouncement,
  deleteMpRelease,
  fetchMpAnnouncementsAdmin,
  fetchMpReleases,
  updateMpAnnouncement,
  updateMpRelease,
  type MiniProgramReleaseView,
  type MpAnnouncementAdminView,
} from "@/api/domains/mpContentHub.api";

type TabKey = "announcements" | "releases";

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html || "", { USE_PROFILES: { html: true } });
}

export default function AdminContentHubPage() {
  const role = authStorage.getRole();
  const canOwnerRelease = hasMinRole(role, "PLATFORM_OWNER");

  const [tab, setTab] = useState<TabKey>("announcements");
  const [annRows, setAnnRows] = useState<MpAnnouncementAdminView[]>([]);
  const [relRows, setRelRows] = useState<MiniProgramReleaseView[]>([]);
  const [loadingAnn, setLoadingAnn] = useState(false);
  const [loadingRel, setLoadingRel] = useState(false);

  const [annOpen, setAnnOpen] = useState(false);
  const [annEditId, setAnnEditId] = useState<string | null>(null);
  const [annTitle, setAnnTitle] = useState("");
  const [annSummary, setAnnSummary] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annEnabled, setAnnEnabled] = useState(true);
  const [annSort, setAnnSort] = useState(0);
  const [annSaving, setAnnSaving] = useState(false);

  const [relOpen, setRelOpen] = useState(false);
  const [relEditId, setRelEditId] = useState<string | null>(null);
  const [relVersion, setRelVersion] = useState("");
  const [relTitle, setRelTitle] = useState("");
  const [relSummary, setRelSummary] = useState("");
  const [relBody, setRelBody] = useState("");
  const [relSplash, setRelSplash] = useState(false);
  const [relSaving, setRelSaving] = useState(false);

  const loadAnn = useCallback(async () => {
    setLoadingAnn(true);
    try {
      const list = await fetchMpAnnouncementsAdmin();
      setAnnRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载公告失败");
    } finally {
      setLoadingAnn(false);
    }
  }, []);

  const loadRel = useCallback(async () => {
    setLoadingRel(true);
    try {
      const list = await fetchMpReleases();
      setRelRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载版本失败");
    } finally {
      setLoadingRel(false);
    }
  }, []);

  useEffect(() => {
    void loadAnn();
    void loadRel();
  }, [loadAnn, loadRel]);

  const openNewAnn = () => {
    setAnnEditId(null);
    setAnnTitle("");
    setAnnSummary("");
    setAnnBody("<p></p>");
    setAnnEnabled(true);
    setAnnSort(0);
    setAnnOpen(true);
  };

  const openEditAnn = (r: MpAnnouncementAdminView) => {
    setAnnEditId(r.id);
    setAnnTitle(r.title || "");
    setAnnSummary(r.summary || "");
    setAnnBody(r.bodyHtml || "<p></p>");
    setAnnEnabled(r.enabled !== 0);
    setAnnSort(r.sortOrder ?? 0);
    setAnnOpen(true);
  };

  const saveAnn = async () => {
    if (!annTitle.trim()) {
      toast.error("请填写标题");
      return;
    }
    const bodyHtml = sanitizeHtml(annBody);
    const summarySan = annSummary.trim() ? sanitizeHtml(annSummary) : null;
    setAnnSaving(true);
    try {
      const payload = {
        title: annTitle.trim(),
        summary: summarySan,
        bodyHtml,
        enabled: annEnabled ? 1 : 0,
        sortOrder: Number.isFinite(annSort) ? annSort : 0,
      };
      if (annEditId) {
        const saved = await updateMpAnnouncement(annEditId, payload);
        // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
        setAnnRows((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
        toast.success("已保存");
      } else {
        const saved = await createMpAnnouncement(payload);
        setAnnRows((prev) => [saved, ...prev]);
        toast.success("已创建");
      }
      setAnnOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setAnnSaving(false);
    }
  };

  const removeAnn = async (id: string) => {
    if (!window.confirm("确认删除该公告？")) return;
    try {
      await deleteMpAnnouncement(id);
      setAnnRows((prev) => prev.filter((x) => x.id !== id));
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const openNewRel = () => {
    if (!canOwnerRelease) return;
    setRelEditId(null);
    setRelVersion("");
    setRelTitle("");
    setRelSummary("");
    setRelBody("<p></p>");
    setRelSplash(false);
    setRelOpen(true);
  };

  const openEditRel = (r: MiniProgramReleaseView) => {
    if (!canOwnerRelease) return;
    setRelEditId(r.id);
    setRelVersion(r.versionCode || "");
    setRelTitle(r.title || "");
    setRelSummary(r.summary || "");
    setRelBody(r.bodyHtml || "<p></p>");
    setRelSplash(r.showOnLaunch === 1);
    setRelOpen(true);
  };

  const saveRel = async () => {
    if (!canOwnerRelease) return;
    if (!relVersion.trim() || !relTitle.trim()) {
      toast.error("请填写版本号与标题");
      return;
    }
    const bodyHtml = sanitizeHtml(relBody);
    const summarySan = relSummary.trim() ? sanitizeHtml(relSummary) : null;
    setRelSaving(true);
    try {
      const payload = {
        versionCode: relVersion.trim(),
        title: relTitle.trim(),
        summary: summarySan,
        bodyHtml,
        showOnLaunch: relSplash,
      };
      if (relEditId) {
        const saved = await updateMpRelease(relEditId, payload);
        // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
        setRelRows((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
        toast.success("已保存");
      } else {
        const saved = await createMpRelease(payload);
        setRelRows((prev) => [saved, ...prev]);
        toast.success("已创建");
      }
      setRelOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setRelSaving(false);
    }
  };

  const removeRel = async (id: string) => {
    if (!canOwnerRelease) return;
    if (!window.confirm("确认删除该版本记录？")) return;
    try {
      await deleteMpRelease(id);
      setRelRows((prev) => prev.filter((x) => x.id !== id));
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const tabs = useMemo(
    () =>
      (
        [
          { key: "announcements" as const, label: "公告" },
          { key: "releases" as const, label: "版本更新" },
        ] as const
      ).map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => setTab(t.key)}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            tab === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {t.label}
        </button>
      )),
    [tab]
  );

  return (
    <div className="p-6">
      <AdminPageShell
        title="小程序内容中心"
        description="公告（管理员及以上）与版本更新（仅平台所有者可写）；正文保存前经 DOMPurify 与后端 Jsoup 消毒。"
      >
        <div className="mb-4 flex flex-wrap gap-2">{tabs}</div>

        {tab === "announcements" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={openNewAnn}>
                新建公告
              </Button>
            </div>
            {loadingAnn ? (
              <p className="text-sm text-slate-500">加载中…</p>
            ) : (
              <AdminDataTableWrap scrollable>
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">标题</th>
                      <th className="px-3 py-2">时间</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2 w-40">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annRows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-900">{r.title}</td>
                        <td className="px-3 py-2 text-slate-600">{r.publishedAtText || "—"}</td>
                        <td className="px-3 py-2">{r.enabled === 0 ? "下线" : "上线"}</td>
                        <td className="px-3 py-2 space-x-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => openEditAnn(r)}>
                            编辑
                          </Button>
                          <Button type="button" variant="destructive" size="sm" onClick={() => void removeAnn(r.id)}>
                            删除
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminDataTableWrap>
            )}
          </div>
        )}

        {tab === "releases" && (
          <div className="space-y-3">
            {canOwnerRelease && (
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={openNewRel}>
                  新建版本记录
                </Button>
              </div>
            )}
            {!canOwnerRelease && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                当前账号无版本写权限；仅平台所有者可新增或修改版本记录（读列表仍可见）。
              </p>
            )}
            {loadingRel ? (
              <p className="text-sm text-slate-500">加载中…</p>
            ) : (
              <AdminDataTableWrap scrollable>
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">版本</th>
                      <th className="px-3 py-2">标题</th>
                      <th className="px-3 py-2">时间</th>
                      <th className="px-3 py-2">首屏</th>
                      {canOwnerRelease && <th className="px-3 py-2 w-40">操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {relRows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{r.versionCode}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{r.title}</td>
                        <td className="px-3 py-2 text-slate-600">{r.publishedAtText || "—"}</td>
                        <td className="px-3 py-2">{r.showOnLaunch === 1 ? "是" : "否"}</td>
                        {canOwnerRelease && (
                          <td className="px-3 py-2 space-x-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => openEditRel(r)}>
                              编辑
                            </Button>
                            <Button type="button" variant="destructive" size="sm" onClick={() => void removeRel(r.id)}>
                              删除
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminDataTableWrap>
            )}
          </div>
        )}
      </AdminPageShell>

      <Dialog open={annOpen} onOpenChange={setAnnOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{annEditId ? "编辑公告" : "新建公告"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="block text-sm font-medium text-slate-700">
              标题
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              摘要（列表）
              <textarea
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm min-h-[72px]"
                value={annSummary}
                onChange={(e) => setAnnSummary(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">正文</label>
            <RichTextEditor value={annBody} onChange={setAnnBody} disabled={annSaving} />
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={annEnabled} onChange={(e) => setAnnEnabled(e.target.checked)} />
                上线展示
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                排序权重
                <input
                  type="number"
                  className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm"
                  value={annSort}
                  onChange={(e) => setAnnSort(Number(e.target.value))}
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAnnOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => void saveAnn()} disabled={annSaving}>
              {annSaving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={relOpen} onOpenChange={setRelOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{relEditId ? "编辑版本记录" : "新建版本记录"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="block text-sm font-medium text-slate-700">
              版本号
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={relVersion}
                onChange={(e) => setRelVersion(e.target.value)}
                disabled={!canOwnerRelease}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              标题
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={relTitle}
                onChange={(e) => setRelTitle(e.target.value)}
                disabled={!canOwnerRelease}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              摘要
              <textarea
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm min-h-[72px]"
                value={relSummary}
                onChange={(e) => setRelSummary(e.target.value)}
                disabled={!canOwnerRelease}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">正文</label>
            <RichTextEditor value={relBody} onChange={setRelBody} disabled={relSaving || !canOwnerRelease} />
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={relSplash}
                onChange={(e) => setRelSplash(e.target.checked)}
                disabled={!canOwnerRelease}
              />
              作为打开小程序时的首屏公告
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRelOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => void saveRel()} disabled={relSaving || !canOwnerRelease}>
              {relSaving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
