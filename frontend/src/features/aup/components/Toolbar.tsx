import type { AutosaveState } from "../hooks/useAup";

interface ToolbarProps {
  onBack: () => void;
  /** 模板名称（不再展示版本号） */
  templateName?: string;
  autosaveState: AutosaveState;
  /** 尚未保存到草稿箱（无后端 id），此时不自动保存、保存按钮文案为「保存到草稿箱」 */
  isNew?: boolean;
  readOnly?: boolean;
  onSave: () => void;
  saving?: boolean;
  onSubmit: () => void;
  submitting?: boolean;
  onOpenAttachments?: () => void;
  onPrint?: () => void;
  /** 打开「评审总览」抽屉（已提交过的计划书可见） */
  onOpenReview?: () => void;
  canSubmit?: boolean;
  canSave?: boolean;
}

const AUTOSAVE_TEXT: Record<AutosaveState, string> = {
  idle: "已同步",
  saving: "自动保存中…",
  saved: "已保存",
  error: "自动保存失败",
};

/**
 * 顶部吸顶工具栏（`.toolbar`）：返回 / 模板版本 / 附件 / 打印 / 保存 / 提交。
 * 保存、提交、附件、打印均由调用方绑定后端端点。
 */
export default function Toolbar({
  onBack,
  templateName,
  autosaveState,
  isNew,
  readOnly,
  onSave,
  saving,
  onSubmit,
  submitting,
  onOpenAttachments,
  onPrint,
  onOpenReview,
  canSubmit,
  canSave,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <button className="btn ghost" onClick={onBack}>← 返回</button>
      {templateName && (
        <span className="tag" style={{ background: "var(--success-weak)", color: "var(--success)" }}>
          {templateName}
        </span>
      )}
      <span className="spacer" />
      <span className={"autosave" + (autosaveState === "error" ? " err" : "")}>
        {isNew ? "尚未保存到草稿箱" : AUTOSAVE_TEXT[autosaveState]}
      </span>
      {onOpenAttachments && (
        <button className="btn ghost" onClick={onOpenAttachments}>附件</button>
      )}
      {onPrint && (
        <button className="btn ghost" onClick={onPrint}>打印 / PDF</button>
      )}
      {onOpenReview && (
        <button className="btn ghost" onClick={onOpenReview}>评审总览</button>
      )}
      {!readOnly && (
        <>
          <button className="btn ghost" onClick={onSave} disabled={saving || canSave === false}>
            {saving ? "保存中…" : isNew ? "保存到草稿箱" : "保存草稿"}
          </button>
          <button className="btn primary" onClick={onSubmit} disabled={submitting || canSubmit === false}>
            {submitting ? "提交中…" : "提交"}
          </button>
        </>
      )}
    </div>
  );
}
