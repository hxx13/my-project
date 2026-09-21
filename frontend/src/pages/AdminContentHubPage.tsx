import { useMemo, useState } from "react";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import DOMPurify from "dompurify";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminPageShell, AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
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
  createMpRelease,
  deleteMpRelease,
  fetchMpReleases,
  updateMpRelease,
  type MiniProgramReleaseView,
} from "@/api/domains/mpContentHub.api";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";

import { appConfirm } from "@/lib/appDialog";
type TabKey = "releases";

const REL_QUERY_KEY = ["mpReleases"] as const;

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html || "", { USE_PROFILES: { html: true } });
}

export default function AdminContentHubPage() {
  const qc = useQueryClient();
  const role = authStorage.getRole();
  const canOwnerRelease = hasMinRole(role, "PLATFORM_OWNER");

  const [tab, setTab] = useState<TabKey>("releases");

  const { data: relRows = [], isLoading: loadingRel } = useQuery({
    queryKey: REL_QUERY_KEY,
    queryFn: fetchMpReleases,
  });

  const [relOpen, setRelOpen] = useState(false);
  const [relEditId, setRelEditId] = useState<string | null>(null);
  const [relVersion, setRelVersion] = useState("");
  const [relTitle, setRelTitle] = useState("");
  const [relSummary, setRelSummary] = useState("");
  const [relBody, setRelBody] = useState("");
  const [relSplash, setRelSplash] = useState(false);
  const [relSaving, setRelSaving] = useState(false);

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
        qc.setQueryData(REL_QUERY_KEY, (prev: MiniProgramReleaseView[] | undefined) =>
          (prev || []).map((x) => (x.id === saved.id ? saved : x))
        );
        toast.success("已保存");
      } else {
        const saved = await createMpRelease(payload);
        qc.setQueryData(REL_QUERY_KEY, (prev: MiniProgramReleaseView[] | undefined) => [saved, ...(prev || [])]);
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
    if (!await appConfirm("确认删除该版本记录？")) return;
    try {
      await deleteMpRelease(id);
      qc.setQueryData(REL_QUERY_KEY, (prev: MiniProgramReleaseView[] | undefined) =>
        (prev || []).filter((x) => x.id !== id)
      );
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const tabs = useMemo(
    () =>
      (
        [
          { key: "releases" as const, label: "版本更新" },
        ] as const
      ).map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => setTab(t.key)}
          className={`rounded-twin-md px-4 py-2 text-sm font-medium ${
            tab === t.key
              ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]"
              : "bg-[var(--twin-canvas-soft)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft-2)]"
          }`}
        >
          {t.label}
        </button>
      )),
    [tab]
  );

  return (
    <AdminFullWidthPage>
      <div className="p-4">
        <AdminPageShell>
          <div className="mb-4 flex flex-wrap gap-2">{tabs}</div>

          <div className="max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px] overflow-y-auto">

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
              <p className="rounded-twin-md border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-sm text-amber-900">
                当前账号无版本写权限；仅平台所有者可新增或修改版本记录（读列表仍可见）。
              </p>
            )}
            {loadingRel ? (
              <DataSkeleton variant="table" rows={4} />
            ) : relRows.length === 0 ? (
              <EmptyState title="暂无版本记录" />
            ) : (
              <AdminDataTableWrap scrollable>
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]">
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
                      <tr key={r.id} className="border-t border-[var(--twin-hairline)]">
                        <td className="px-3 py-2 text-[var(--twin-ink)]">{r.versionCode}</td>
                        <td className="px-3 py-2 font-medium text-[var(--twin-ink)]">{r.title}</td>
                        <td className="px-3 py-2 text-[var(--twin-body)]">{r.publishedAtText || "—"}</td>
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
          </div>
        </AdminPageShell>

        <Dialog open={relOpen} onOpenChange={setRelOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{relEditId ? "编辑版本记录" : "新建版本记录"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="block text-sm font-medium text-[var(--twin-body)]">
              版本号
              <input
                className="mt-1 w-full rounded-twin-md border border-[var(--twin-hairline)] px-3 py-2 text-sm"
                value={relVersion}
                onChange={(e) => setRelVersion(e.target.value)}
                disabled={!canOwnerRelease}
              />
            </label>
            <label className="block text-sm font-medium text-[var(--twin-body)]">
              标题
              <input
                className="mt-1 w-full rounded-twin-md border border-[var(--twin-hairline)] px-3 py-2 text-sm"
                value={relTitle}
                onChange={(e) => setRelTitle(e.target.value)}
                disabled={!canOwnerRelease}
              />
            </label>
            <label className="block text-sm font-medium text-[var(--twin-body)]">
              摘要
              <textarea
                className="mt-1 w-full rounded-twin-md border border-[var(--twin-hairline)] px-3 py-2 text-sm min-h-[72px]"
                value={relSummary}
                onChange={(e) => setRelSummary(e.target.value)}
                disabled={!canOwnerRelease}
              />
            </label>
            <label className="block text-sm font-medium text-[var(--twin-body)]">正文</label>
            <RichTextEditor value={relBody} onChange={setRelBody} disabled={relSaving || !canOwnerRelease} />
            <label className="inline-flex items-center gap-2 text-sm text-[var(--twin-body)]">
              <AdminSwitchScaled size="sm" checked={relSplash} onChange={setRelSplash} disabled={!canOwnerRelease} />
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
    </AdminFullWidthPage>
  );
}
