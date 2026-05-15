import { useCallback, useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { BookOpen, MessageSquareText, Pencil, Eye } from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchAdminPageHelp,
  postAdminPageHelpMessage,
  saveAdminPageHelp,
  type AdminPageHelpBundle,
  type AdminPageHelpMessage,
} from "@/api/domains/adminPageHelp.api";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { cn } from "@/lib/utils";

function sanitizeDisplayHtml(html: string) {
  return DOMPurify.sanitize(html || "", { USE_PROFILES: { html: true } });
}

export function normalizeAdminHelpPath(pathname: string) {
  let p = (pathname || "").trim() || "/admin";
  if (!p.startsWith("/")) p = `/${p}`;
  while (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }
  return p;
}

type TabKey = "tutorial" | "messages";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pagePath: string;
};

export function AdminPageHelpDialog({ open, onOpenChange, pagePath }: Props) {
  const role = authStorage.getRole() || "STUDENT";
  const canEditTutorial = hasMinRole(role, "ADMIN");

  const [tab, setTab] = useState<TabKey>("tutorial");
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState<AdminPageHelpBundle | null>(null);
  const [draftHtml, setDraftHtml] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msgDraft, setMsgDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const pathKey = useMemo(() => normalizeAdminHelpPath(pagePath), [pagePath]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await fetchAdminPageHelp(pathKey);
      setBundle(b);
      setDraftHtml(b.bodyHtml || "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [pathKey]);

  useEffect(() => {
    if (!open) return;
    setTab("tutorial");
    setEditing(false);
    void load();
  }, [open, load]);

  const previewHtml = useMemo(() => sanitizeDisplayHtml(draftHtml || bundle?.bodyHtml || ""), [draftHtml, bundle?.bodyHtml]);

  const onSaveTutorial = async () => {
    if (!canEditTutorial) return;
    setSaving(true);
    try {
      await saveAdminPageHelp(pathKey, draftHtml);
      toast.success("教程已保存");
      setEditing(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const onPostMessage = async () => {
    const t = msgDraft.trim();
    if (!t) {
      toast.error("请输入留言");
      return;
    }
    setPosting(true);
    try {
      await postAdminPageHelpMessage(pathKey, t);
      toast.success("已发表");
      setMsgDraft("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发表失败");
    } finally {
      setPosting(false);
    }
  };

  const displayMeta = bundle?.updatedAt
    ? `更新 ${bundle.updatedAt}${bundle.updatedBy ? ` · ${bundle.updatedBy}` : ""}`
    : "尚无正文";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        className="flex max-h-[min(88vh,760px)] w-[min(96vw,44rem)] max-w-[min(96vw,44rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-100 px-4 pb-3 pt-4">
          <DialogTitle className="pr-8 text-left text-base">页面帮助</DialogTitle>
          <DialogDescription className="text-left text-xs text-slate-500">
            当前路由：<span className="font-mono text-slate-700">{pathKey}</span>
            <span className="mx-1.5 text-slate-300">·</span>
            {displayMeta}
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 gap-1 border-b border-slate-100 px-2 pt-1">
          <button
            type="button"
            onClick={() => setTab("tutorial")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium",
              tab === "tutorial" ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-slate-50",
            )}
          >
            <BookOpen className="h-3.5 w-3.5" />
            教程
          </button>
          <button
            type="button"
            onClick={() => setTab("messages")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium",
              tab === "messages" ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-slate-50",
            )}
          >
            <MessageSquareText className="h-3.5 w-3.5" />
            留言
            {bundle?.messages?.length ? (
              <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-700">{bundle.messages.length}</span>
            ) : null}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? <div className="py-12 text-center text-sm text-slate-500">加载中…</div> : null}

          {!loading && tab === "tutorial" ? (
            <div className="space-y-3">
              {canEditTutorial ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!editing) {
                        setDraftHtml(bundle?.bodyHtml || "");
                      }
                      setEditing(!editing);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {editing ? (
                      <>
                        <Eye className="h-3.5 w-3.5" />
                        预览
                      </>
                    ) : (
                      <>
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </>
                    )}
                  </button>
                  {editing ? (
                    <>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void onSaveTutorial()}
                        className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        {saving ? "保存中…" : "保存教程"}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setDraftHtml(bundle?.bodyHtml || "");
                          setEditing(false);
                        }}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        放弃修改
                      </button>
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-slate-500">仅管理员及以上可编辑正文；教职工可查看与在「留言」中反馈。</p>
              )}

              {editing && canEditTutorial ? (
                <RichTextEditor value={draftHtml} onChange={setDraftHtml} disabled={saving} />
              ) : (
                <div
                  className={cn(
                    "min-h-[160px] rounded-md border border-slate-100 bg-slate-50/80 px-3 py-3 text-sm leading-relaxed text-slate-800",
                    "[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold",
                    "[&_h3]:mb-1.5 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold",
                    "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5",
                    "[&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600",
                    "[&_img]:mx-auto [&_img]:my-2 [&_img]:block [&_img]:max-h-[min(38vh,400px)] [&_img]:w-auto [&_img]:max-w-[min(100%,28rem)] [&_img]:rounded-md [&_img]:object-contain [&_img]:shadow-sm",
                  )}
                  dangerouslySetInnerHTML={{ __html: previewHtml || "<p class=\"text-slate-500\">暂无教程内容。</p>" }}
                />
              )}
            </div>
          ) : null}

          {!loading && tab === "messages" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600">发表留言</label>
                <textarea
                  value={msgDraft}
                  onChange={(e) => setMsgDraft(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="对本页功能的使用疑问、改进建议等（最多 2000 字）"
                  className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400">{msgDraft.length}/2000</span>
                  <button
                    type="button"
                    disabled={posting}
                    onClick={() => void onPostMessage()}
                    className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                  >
                    {posting ? "发送中…" : "发送留言"}
                  </button>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="mb-2 text-xs font-medium text-slate-600">历史留言</div>
                <ul className="space-y-2">
                  {(bundle?.messages || []).length === 0 ? (
                    <li className="text-xs text-slate-400">暂无留言。</li>
                  ) : (
                    (bundle?.messages || []).map((m: AdminPageHelpMessage) => (
                      <li key={m.id} className="rounded-md border border-slate-100 bg-white px-3 py-2 text-sm shadow-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-slate-500">
                          <span className="font-medium text-slate-700">{m.authorLabel || m.userId}</span>
                          <span>{m.createdAt || ""}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-slate-800">{m.body}</p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
