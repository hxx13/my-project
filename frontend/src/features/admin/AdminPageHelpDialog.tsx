import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, History, MessageSquareText, Pencil, Eye, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  deletePageHelpVersion,
  fetchAdminPageHelp,
  pageHelpVersionKindLabel,
  postAdminPageHelpMessage,
  publishPageHelpVersion,
  suggestNextPageHelpVersion,
  updatePageHelpVersion,
  type AdminPageHelpBundle,
  type AdminPageHelpMessage,
  type AdminPageHelpVersion,
} from "@/api/domains/adminPageHelp.api";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { PageHelpModalShell } from "@/features/page-help/PageHelpModalShell";
import { PageHelpProseHtml } from "@/features/page-help/PageHelpProseHtml";
import { normalizePageHelpPath } from "@/features/page-help/pageHelpPath";
import { isRichTextEmpty } from "@/utils/announcementHtml";
import { PAGE_HELP_DIALOG_CLASS, PAGE_HELP_SCROLL_CLASS } from "@/utils/pageHelpHtml";
import { cn } from "@/lib/utils";

export function normalizeAdminHelpPath(pathname: string) {
  return normalizePageHelpPath(pathname);
}

type TabKey = "tutorial" | "versions" | "messages";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pagePath: string;
};

function VersionBadge({ version }: { version: AdminPageHelpVersion }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--app-radius-pill)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-0.5 text-[10px] font-semibold">
      <span className="font-mono text-[var(--app-color-text-primary)]">{version.versionLabel}</span>
      <span className="text-[var(--app-color-text-tertiary)]">·</span>
      <span
        className={
          version.versionKind === "new"
            ? "text-[var(--app-color-accent-secondary)]"
            : "text-[var(--app-color-text-secondary)]"
        }
      >
        {pageHelpVersionKindLabel(version.versionKind)}
      </span>
    </span>
  );
}

export function AdminPageHelpDialog({ open, onOpenChange, pagePath }: Props) {
  const role = authStorage.getRole() || "STUDENT";
  const canEditTutorial = hasMinRole(role, "ADMIN");

  const [tab, setTab] = useState<TabKey>("tutorial");
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState<AdminPageHelpBundle | null>(null);
  const [draftHtml, setDraftHtml] = useState("");
  const [versionLabel, setVersionLabel] = useState("V1.0.0");
  const [versionKind, setVersionKind] = useState<"update" | "new">("update");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msgDraft, setMsgDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null);
  const [editingVersionId, setEditingVersionId] = useState<number | null>(null);
  const [editDraftHtml, setEditDraftHtml] = useState("");
  const [editVersionKind, setEditVersionKind] = useState<"update" | "new">("update");
  const [versionSavingId, setVersionSavingId] = useState<number | null>(null);
  const [versionDeletingId, setVersionDeletingId] = useState<number | null>(null);

  const pathKey = useMemo(() => normalizeAdminHelpPath(pagePath), [pagePath]);

  const resetVersionEdit = useCallback(() => {
    setEditingVersionId(null);
    setEditDraftHtml("");
    setEditVersionKind("update");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await fetchAdminPageHelp(pathKey);
      setBundle(b);
      setDraftHtml(b.bodyHtml || "");
      setVersionLabel(suggestNextPageHelpVersion(b.versions || []));
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
    setExpandedVersionId(null);
    resetVersionEdit();
    void load();
  }, [open, load, resetVersionEdit]);

  const onPublishVersion = async () => {
    if (!canEditTutorial) return;
    const label = versionLabel.trim();
    if (!label) {
      toast.error("请填写版本号，例如 V1.0.1");
      return;
    }
    if (isRichTextEmpty(draftHtml)) {
      toast.error("正文不能为空");
      return;
    }
    setSaving(true);
    try {
      await publishPageHelpVersion(pathKey, label, versionKind, draftHtml);
      toast.success(`已发布 ${label.toUpperCase()}`);
      setEditing(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发布失败");
    } finally {
      setSaving(false);
    }
  };

  const startEditVersion = (v: AdminPageHelpVersion) => {
    setExpandedVersionId(v.id);
    setEditingVersionId(v.id);
    setEditDraftHtml(v.bodyHtml || "");
    setEditVersionKind(v.versionKind === "new" ? "new" : "update");
  };

  const onSaveVersionEdit = async (v: AdminPageHelpVersion) => {
    if (!canEditTutorial) return;
    if (isRichTextEmpty(editDraftHtml)) {
      toast.error("正文不能为空");
      return;
    }
    setVersionSavingId(v.id);
    try {
      await updatePageHelpVersion(pathKey, v.id, editVersionKind, editDraftHtml);
      toast.success(`${v.versionLabel} 已保存`);
      resetVersionEdit();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setVersionSavingId(null);
    }
  };

  const onDeleteVersion = async (v: AdminPageHelpVersion) => {
    if (!canEditTutorial) return;
    const ok = window.confirm(`确定删除 ${v.versionLabel}？删除后不可恢复。`);
    if (!ok) return;
    setVersionDeletingId(v.id);
    try {
      await deletePageHelpVersion(pathKey, v.id);
      toast.success(`已删除 ${v.versionLabel}`);
      if (expandedVersionId === v.id) setExpandedVersionId(null);
      if (editingVersionId === v.id) resetVersionEdit();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setVersionDeletingId(null);
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

  const displayMeta = bundle?.currentVersion
    ? `${bundle.currentVersion.versionLabel} · ${pageHelpVersionKindLabel(bundle.currentVersion.versionKind)}${bundle.updatedAt ? ` · ${bundle.updatedAt}` : ""}`
    : bundle?.updatedAt
      ? `更新 ${bundle.updatedAt}${bundle.updatedBy ? ` · ${bundle.updatedBy}` : ""}`
      : "尚无正文";

  const tabBtnClass = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-t-[var(--app-radius-element)] px-3 py-2 text-xs font-medium",
      active
        ? "bg-[var(--app-color-surface-container)] text-[var(--app-color-accent-secondary)] shadow-[var(--app-elevation-card)] ring-1 ring-[var(--app-color-border-default)]"
        : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]",
    );

  const actionBtnClass =
    "inline-flex items-center gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1 text-[11px] font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50";

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <PageHelpModalShell
      open={open}
      onClose={close}
      showClose
      ariaLabel="页面帮助"
      className={cn(
        PAGE_HELP_DIALOG_CLASS,
        "flex max-h-[min(88vh,760px)] w-[min(96vw,44rem)] max-w-[min(96vw,44rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl sm:rounded-[var(--app-radius-container)]",
      )}
    >
      <header className="shrink-0 space-y-1 border-b border-[var(--app-color-border-default)] px-4 pb-3 pt-4 text-left">
        <h2 className="pr-8 text-base font-semibold text-[var(--app-color-text-primary)]">页面帮助</h2>
        <p className="text-xs text-[var(--app-color-text-secondary)]">
          当前路由：<span className="font-mono text-[var(--app-color-text-primary)]">{pathKey}</span>
          <span className="mx-1.5 text-[var(--app-color-text-tertiary)]">·</span>
          {displayMeta}
        </p>
      </header>

        <div className="flex shrink-0 gap-1 border-b border-[var(--app-color-border-default)] px-2 pt-1">
          <button type="button" onClick={() => setTab("tutorial")} className={tabBtnClass(tab === "tutorial")}>
            <BookOpen className="h-3.5 w-3.5" />
            教程
          </button>
          <button type="button" onClick={() => setTab("versions")} className={tabBtnClass(tab === "versions")}>
            <History className="h-3.5 w-3.5" />
            版本历史
            {bundle?.versions?.length ? (
              <span className="rounded-[var(--app-radius-pill)] bg-[var(--app-color-surface-hover)] px-1.5 text-[10px] font-semibold text-[var(--app-color-text-secondary)]">
                {bundle.versions.length}
              </span>
            ) : null}
          </button>
          <button type="button" onClick={() => setTab("messages")} className={tabBtnClass(tab === "messages")}>
            <MessageSquareText className="h-3.5 w-3.5" />
            留言
            {bundle?.messages?.length ? (
              <span className="rounded-[var(--app-radius-pill)] bg-[var(--app-color-surface-hover)] px-1.5 text-[10px] font-semibold text-[var(--app-color-text-secondary)]">
                {bundle.messages.length}
              </span>
            ) : null}
          </button>
        </div>

        <div data-modal-scroll className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-3", PAGE_HELP_SCROLL_CLASS)}>
          {loading ? <div className="py-12 text-center text-sm text-[var(--app-color-text-secondary)]">加载中…</div> : null}

          {!loading && tab === "tutorial" ? (
            <div className="space-y-3">
              {bundle?.currentVersion ? (
                <div className="flex flex-wrap items-center gap-2">
                  <VersionBadge version={bundle.currentVersion} />
                  <span className="text-[11px] text-[var(--app-color-text-tertiary)]">当前对外展示与首次弹窗均使用此版本</span>
                </div>
              ) : null}

              {canEditTutorial ? (
                <div className="space-y-3 rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!editing) {
                          setDraftHtml(bundle?.bodyHtml || "");
                          setVersionLabel(suggestNextPageHelpVersion(bundle?.versions || []));
                          setVersionKind("update");
                        }
                        setEditing(!editing);
                      }}
                      className="inline-flex items-center gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2.5 py-1.5 text-xs font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                    >
                      {editing ? (
                        <>
                          <Eye className="h-3.5 w-3.5" />
                          预览
                        </>
                      ) : (
                        <>
                          <Pencil className="h-3.5 w-3.5" />
                          发布新版本
                        </>
                      )}
                    </button>
                  </div>

                  {editing ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-xs font-medium text-[var(--app-color-text-secondary)]">
                          版本号
                          <input
                            value={versionLabel}
                            onChange={(e) => setVersionLabel(e.target.value)}
                            placeholder="V1.0.1"
                            className="w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2.5 py-1.5 text-sm font-mono text-[var(--app-color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--app-color-accent-secondary)]"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-medium text-[var(--app-color-text-secondary)]">
                          版本类型
                          <select
                            value={versionKind}
                            onChange={(e) => setVersionKind(e.target.value as "update" | "new")}
                            className="w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2.5 py-1.5 text-sm text-[var(--app-color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--app-color-accent-secondary)]"
                          >
                            <option value="update">更新内容（小版本）</option>
                            <option value="new">新内容（大版本）</option>
                          </select>
                        </label>
                      </div>
                      <RichTextEditor value={draftHtml} onChange={setDraftHtml} disabled={saving} />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void onPublishVersion()}
                          className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--app-color-text-inverse)] hover:bg-[var(--app-color-accent)] disabled:opacity-50"
                        >
                          {saving ? "发布中…" : "确认发布"}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setDraftHtml(bundle?.bodyHtml || "");
                            setVersionLabel(suggestNextPageHelpVersion(bundle?.versions || []));
                            setEditing(false);
                          }}
                          className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2.5 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50"
                        >
                          放弃修改
                        </button>
                      </div>
                      <p className="text-[11px] text-[var(--app-color-text-tertiary)]">
                        发布后，未确认该版本号的用户进入页面时会再次看到「新功能介绍」弹窗。
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-[var(--app-color-text-secondary)]">
                  仅管理员及以上可发布新版本；教职工可查看与在「留言」中反馈。
                </p>
              )}

              {!editing ? (
                <PageHelpProseHtml
                  html={draftHtml || bundle?.bodyHtml || ""}
                  className="min-h-[160px] rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-3"
                  emptyHtml='<p class="text-[var(--app-color-text-tertiary)]">暂无教程内容。</p>'
                />
              ) : null}
            </div>
          ) : null}

          {!loading && tab === "versions" ? (
            <div className="space-y-2">
              {(bundle?.versions || []).length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--app-color-text-tertiary)]">
                  尚无版本记录。在「教程」中发布第一个版本。
                </p>
              ) : (
                (bundle?.versions || []).map((v) => {
                  const expanded = expandedVersionId === v.id;
                  const isEditing = editingVersionId === v.id;
                  return (
                    <div
                      key={v.id}
                      className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setExpandedVersionId(expanded ? null : v.id)}
                          className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left hover:opacity-90"
                        >
                          <VersionBadge version={v} />
                          {bundle?.currentVersion?.id === v.id ? (
                            <span className="text-[10px] font-semibold text-[var(--app-color-accent-secondary)]">当前</span>
                          ) : null}
                          <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
                            {v.createdAt || ""}
                            {v.createdBy ? ` · ${v.createdBy}` : ""}
                          </span>
                        </button>
                        {canEditTutorial ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              disabled={versionSavingId === v.id || versionDeletingId === v.id}
                              onClick={() => (isEditing ? resetVersionEdit() : startEditVersion(v))}
                              className={actionBtnClass}
                            >
                              <Pencil className="h-3 w-3" />
                              {isEditing ? "取消" : "编辑"}
                            </button>
                            <button
                              type="button"
                              disabled={versionSavingId === v.id || versionDeletingId === v.id}
                              onClick={() => void onDeleteVersion(v)}
                              className={cn(actionBtnClass, "text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-surface-hover)]")}
                            >
                              <Trash2 className="h-3 w-3" />
                              {versionDeletingId === v.id ? "删除中…" : "删除"}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {expanded && isEditing && canEditTutorial ? (
                        <div className="space-y-3 border-t border-[var(--app-color-border-default)] px-3 py-3">
                          <p className="text-[11px] text-[var(--app-color-text-tertiary)]">
                            版本号 {v.versionLabel} 不可修改（与用户「已知晓」记录绑定）。
                          </p>
                          <label className="block space-y-1 text-xs font-medium text-[var(--app-color-text-secondary)]">
                            版本类型
                            <select
                              value={editVersionKind}
                              onChange={(e) => setEditVersionKind(e.target.value as "update" | "new")}
                              disabled={versionSavingId === v.id}
                              className="w-full max-w-xs rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2.5 py-1.5 text-sm text-[var(--app-color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--app-color-accent-secondary)]"
                            >
                              <option value="update">更新内容（小版本）</option>
                              <option value="new">新内容（大版本）</option>
                            </select>
                          </label>
                          <RichTextEditor
                            value={editDraftHtml}
                            onChange={setEditDraftHtml}
                            disabled={versionSavingId === v.id}
                          />
                          <button
                            type="button"
                            disabled={versionSavingId === v.id}
                            onClick={() => void onSaveVersionEdit(v)}
                            className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--app-color-text-inverse)] hover:bg-[var(--app-color-accent)] disabled:opacity-50"
                          >
                            {versionSavingId === v.id ? "保存中…" : "保存修改"}
                          </button>
                        </div>
                      ) : null}

                      {expanded && !isEditing ? (
                        <PageHelpProseHtml
                          html={v.bodyHtml || ""}
                          className="border-t border-[var(--app-color-border-default)] px-3 py-3"
                          emptyHtml='<p class="text-[var(--app-color-text-tertiary)]">（空）</p>'
                        />
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}

          {!loading && tab === "messages" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--app-color-text-secondary)]">发表留言</label>
                <textarea
                  value={msgDraft}
                  onChange={(e) => setMsgDraft(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="对本页功能的使用疑问、改进建议等（最多 2000 字）"
                  className="w-full resize-y rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--app-color-accent-secondary)]"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-[var(--app-color-text-tertiary)]">{msgDraft.length}/2000</span>
                  <button
                    type="button"
                    disabled={posting}
                    onClick={() => void onPostMessage()}
                    className="rounded-[var(--app-radius-element)] bg-[var(--app-color-text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--app-color-text-inverse)] hover:opacity-90 disabled:opacity-50"
                  >
                    {posting ? "发送中…" : "发送留言"}
                  </button>
                </div>
              </div>
              <div className="border-t border-[var(--app-color-border-default)] pt-3">
                <div className="mb-2 text-xs font-medium text-[var(--app-color-text-secondary)]">历史留言</div>
                <ul className="space-y-2">
                  {(bundle?.messages || []).length === 0 ? (
                    <li className="text-xs text-[var(--app-color-text-tertiary)]">暂无留言。</li>
                  ) : (
                    (bundle?.messages || []).map((m: AdminPageHelpMessage) => (
                      <li
                        key={m.id}
                        className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm shadow-[var(--app-elevation-card)]"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-[var(--app-color-text-tertiary)]">
                          <span className="font-medium text-[var(--app-color-text-secondary)]">{m.authorLabel || m.userId}</span>
                          <span>{m.createdAt || ""}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-[var(--app-color-text-primary)]">{m.body}</p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
    </PageHelpModalShell>
  );
}
