import { useRef, useState } from "react";
import type { JSX } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Trash2, X } from "lucide-react";
import { Portal } from "@/components/Portal";
import { AdminButton } from "@/components/admin/AdminButton";
import { isRichTextEmpty, richTextPlainPreview } from "@/utils/announcementHtml";
import { useMultiSelectPopover } from "../shared/useMultiSelectPopover";

/**
 * 违规弹窗警告域专用：文案模板快捷选择 + 保存预设。挂到 ContentBodySlot 的 templateSlot。
 *
 * T2-2 定稿：本组件是预设模板库的唯一消费方（管理端快选调色板）。
 * 运行时渲染不读本库，走 ViolationTextTemplateRenderer + 滞留/规则模板。
 * 仅限 student-violations 管理面，勿挂到全站其它 RichTextEditor。
 *
 * 弹层用 Portal + fixed（复用 useMultiSelectPopover），逃逸 PageTransition transform 与画布 overflow 裁切。
 *
 * 高度注意：外层只用 max-h（不定高），列表区禁止 flex-1 + min-h-0——否则在
 * 「父级高度由内容撑开」时 flex-basis:0% 会把列表主尺寸压成 0，文案只剩一条缝。
 * 列表自带 max-h + overflow-y-auto，由内容决定高度、触顶后再滚。
 */
export function ViolationTemplateQuickSelect({
  onSelect,
  currentText,
}: {
  onSelect: (text: string) => void;
  currentText: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { panelStyle } = useMultiSelectPopover({ triggerRef, panelRef, open, onClose: () => setOpen(false) });

  const { data: templates = [], refetch } = useQuery({
    queryKey: ["violationTextTemplates"],
    queryFn: () => import("@/api/domains/violationTextTemplate.api").then((m) => m.listViolationTextTemplates()),
    staleTime: 30_000,
  });

  const handleSave = async () => {
    if (isRichTextEmpty(currentText)) return;
    setSaving(true);
    try {
      const { createViolationTextTemplate } = await import("@/api/domains/violationTextTemplate.api");
      await createViolationTextTemplate(saveName || `模板 ${templates.length + 1}`, currentText, 0);
      await refetch();
      setSaveName("");
      toast.success("模板已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const { deleteViolationTextTemplate } = await import("@/api/domains/violationTextTemplate.api");
      await deleteViolationTextTemplate(id);
      await refetch();
      toast.success("模板已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  return (
    <div>
      <AdminButton
        ref={triggerRef}
        type="button"
        tone="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="gap-1.5"
      >
        <ClipboardList className="h-3.5 w-3.5" />
        选择模板
        {templates.length > 0 ? <span className="text-[var(--app-color-text-tertiary)]">{templates.length}</span> : null}
      </AdminButton>

      {open ? (
        <Portal>
          <div
            ref={panelRef}
            style={panelStyle}
            className="flex w-[min(420px,calc(100vw-2rem))] max-h-[min(480px,calc(100vh-2rem))] flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] [box-shadow:var(--app-elevation-modal)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--app-color-border-default)] px-4 py-2.5">
              <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">选择模板</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="rounded p-1 text-[var(--app-color-text-tertiary)] transition-colors hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="max-h-[min(320px,calc(100vh-12rem))] overflow-y-auto overscroll-y-contain p-2">
              {templates.length === 0 ? (
                <p className="py-8 text-center text-xs text-[var(--app-color-text-tertiary)]">
                  暂无保存的模板，先写一段文案再点「保存当前」。
                </p>
              ) : (
                templates.map((t) => (
                  <div key={t.id} className="group flex items-start gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--app-color-surface-hover)]">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      title={richTextPlainPreview(t.violationText, 400)}
                      onClick={() => {
                        onSelect(t.violationText);
                        setOpen(false);
                      }}
                    >
                      <div className="break-words text-sm font-medium text-[var(--app-color-text-primary)]">{t.name}</div>
                      <div className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--app-color-text-secondary)]">
                        {richTextPlainPreview(t.violationText, 160) || "（空）"}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-[var(--app-color-text-tertiary)] opacity-0 transition-all group-hover:opacity-100 hover:bg-[var(--app-color-feedback-danger-soft)] hover:text-[var(--app-color-feedback-danger)]"
                      onClick={() => void handleDelete(t.id)}
                      title="删除模板"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="shrink-0 border-t border-[var(--app-color-border-default)] px-4 py-3">
              <div className="flex gap-2">
                <input
                  className="h-9 min-w-0 flex-1 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 text-sm text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)]"
                  placeholder="模板名称（可选）"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSave();
                  }}
                />
                <AdminButton
                  type="button"
                  tone="primary"
                  size="sm"
                  loading={saving}
                  disabled={isRichTextEmpty(currentText)}
                  onClick={() => void handleSave()}
                >
                  {saving ? "保存中…" : "保存当前"}
                </AdminButton>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </div>
  );
}
