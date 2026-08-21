import { useEffect, useState } from "react";
import type { JSX } from "react";
import toast from "react-hot-toast";
import { Save } from "lucide-react";
import {
  createScanPopupAnnouncement,
  getScanPopupAnnouncement,
  updateScanPopupAnnouncement,
  type ScanPopupAnnouncementRow,
} from "@/api/domains/scanPopupAnnouncement.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { EditorInspectorLayout } from "../shared/EditorInspectorLayout";
import { InspectorGroup, InspectorRow } from "../shared/InspectorGroup";
import { BareInput } from "../shared/BareControl";
import { ContentBodySlot, contentBodyFromHtml, serializeContentBody, type ContentBodyValue } from "../slots/ContentBodySlot";

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

function applyAnnouncementToForm(
  hit: ScanPopupAnnouncementRow,
  setters: {
    setTitle: (v: string) => void;
    setBody: (v: ContentBodyValue) => void;
    setEnabled: (v: boolean) => void;
    setSortOrder: (v: string) => void;
    setPublishAt: (v: string) => void;
    setExpireAt: (v: string) => void;
  }
): void {
  setters.setTitle(hit.title ?? "");
  setters.setBody(contentBodyFromHtml(hit.contentHtml, [], hit.contentJson));
  setters.setEnabled(hit.enabled !== false);
  setters.setSortOrder(String(hit.sortOrder ?? 0));
  setters.setPublishAt(toDatetimeLocalValue(hit.publishAt));
  setters.setExpireAt(toDatetimeLocalValue(hit.expireAt));
}

type AnnouncementEditorProps = {
  id: number | null;
  onDone: () => void;
  onCancel: () => void;
};

export function AnnouncementEditor({ id, onDone, onCancel }: AnnouncementEditorProps): JSX.Element {
  const editing = id != null;
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [row, setRow] = useState<ScanPopupAnnouncementRow | null>(null);
  /** 正文仅在加载完成后挂载 TipTap，避免空值初始化后异步 setContent 偶发不回填 */
  const [bodyReady, setBodyReady] = useState(!editing);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState<ContentBodyValue>(() => contentBodyFromHtml(null, null));
  const [enabled, setEnabled] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [publishAt, setPublishAt] = useState("");
  const [expireAt, setExpireAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearAutoSuppress, setClearAutoSuppress] = useState(false);

  useEffect(() => {
    if (!editing) {
      setLoading(false);
      setBodyReady(true);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setBodyReady(false);
    setLoadError(null);
    getScanPopupAnnouncement(id)
      .then((hit) => {
        if (cancelled) return;
        setRow(hit);
        applyAnnouncementToForm(hit, { setTitle, setBody, setEnabled, setSortOrder, setPublishAt, setExpireAt });
        setBodyReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "公告加载失败");
        toast.error(e instanceof Error ? e.message : "公告加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, id]);

  const autoSuppressCount = row?.autoSuppressCount ?? 0;

  const save = async () => {
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
      const { html, contentJson } = serializeContentBody(body);
      const payload = {
        title: title.trim(),
        contentHtml: html,
        contentJson,
        enabled,
        sortOrder: Math.floor(sort),
        publishAt: normalizeDatetimeLocal(publishAt),
        expireAt: normalizeDatetimeLocal(expireAt),
        status: "ACTIVE",
      };
      if (editing) {
        await updateScanPopupAnnouncement(id, { ...payload, clearAutoSuppress });
        toast.success("公告已更新");
      } else {
        await createScanPopupAnnouncement(payload);
        toast.success("公告已发布");
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const canvas = (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-[var(--app-color-text-secondary)]">标题</label>
        <input
          className="mt-1 w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)] placeholder:text-[var(--app-color-text-tertiary)]"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="公告标题"
          disabled={loading}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--app-color-text-secondary)]">正文（富文本）</label>
        <div className="mt-1">
          {loading || !bodyReady ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] text-sm text-[var(--app-color-text-tertiary)]">
              {loadError ?? "加载正文…"}
            </div>
          ) : (
            <ContentBodySlot
              key={editing ? `announcement-body-${id}` : "announcement-body-new"}
              value={body}
              onChange={setBody}
              onPickFiles={() => {}}
            />
          )}
        </div>
      </div>
    </div>
  );

  const inspector = (
    <InspectorGroup title="发布">
      <InspectorRow label="启用展示">
        {(controlId) => <AdminSwitchScaled size="sm" id={controlId} checked={enabled} onChange={setEnabled} disabled={loading} />}
      </InspectorRow>
      <InspectorRow label="排序" hint="数字大靠前">
        {(controlId) => <BareInput id={controlId} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} disabled={loading} />}
      </InspectorRow>
      <InspectorRow label="最早展示">
        {(controlId) => <BareInput id={controlId} type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} disabled={loading} />}
      </InspectorRow>
      <InspectorRow label="过期时间">
        {(controlId) => <BareInput id={controlId} type="datetime-local" value={expireAt} onChange={(e) => setExpireAt(e.target.value)} disabled={loading} />}
      </InspectorRow>
    </InspectorGroup>
  );

  const header = (
    <div className="flex items-center justify-between gap-3">
      <AdminButton type="button" tone="secondary" size="sm" className="shrink-0" onClick={onCancel}>
        ← 返回公告列表
      </AdminButton>
      <div className="flex shrink-0 items-center gap-2">
        <AdminButton type="button" tone="secondary" onClick={onCancel}>
          取消
        </AdminButton>
        <AdminButton type="button" tone="primary" loading={saving} disabled={loading || Boolean(loadError)} className="gap-1.5" onClick={() => void save()}>
          <Save className="h-4 w-4" aria-hidden />
          {editing ? "保存修改" : "发布公告"}
        </AdminButton>
      </div>
    </div>
  );

  const footer =
    editing && autoSuppressCount > 0 ? (
      <div className="flex items-start gap-2 rounded-lg border border-[var(--app-color-feedback-warning)]/30 bg-[var(--app-color-feedback-warning-soft)] px-3 py-2.5 text-sm text-[var(--app-color-text-primary)]">
        <AdminSwitchScaled size="sm" id="clear-auto-suppress-checkbox" className="mt-0.5" checked={clearAutoSuppress} onChange={setClearAutoSuppress} />
        <label htmlFor="clear-auto-suppress-checkbox" className="cursor-pointer">
          <span className="font-medium">公告已更新，清空「下次不再弹出」记录</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--app-color-text-secondary)]">当前 {autoSuppressCount} 位被扫码人员已选择不再自动弹出。</span>
        </label>
      </div>
    ) : undefined;

  return <EditorInspectorLayout canvas={canvas} inspector={inspector} footer={footer} breadcrumb={header} />;
}
