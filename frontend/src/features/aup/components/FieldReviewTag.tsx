/**
 * FieldReviewTag —— 逐字段评审徽标 + 内联 popover（§3.9 快捷入口）。
 *
 * - 评审人（专家）编辑态：徽标反映当前草稿 verdict，点击弹 popover 设
 *   compliant / nonCompliant / suggest + reason + suggestion。
 * - 申请人返修 / 只读态：徽标反映该字段聚合评审状态，点击只读查看各评审人意见。
 *
 * 颜色取值复用原型 CSS 变量（--success / --danger / --warn / --muted）。
 */

import { useEffect, useRef, useState } from "react";
import type { ReviewItem, ReviewItemVerdict } from "@/features/aup/schema/review";

/** 字段级评审结论中文文案（与清单 §3.9 对齐） */
export const ITEM_VERDICT_LABELS: Record<ReviewItemVerdict, string> = {
  compliant: "合规",
  nonCompliant: "不合规",
  suggest: "建议修改",
};

/**
 * 字段级评审草稿（父级收集，随 VoteRequest.items 一起提交）。
 * verdict=null 表示「未评审」；nonCompliant 时 reason 必填；suggest 时填 suggestion。
 */
export interface FieldReviewDraft {
  verdict: ReviewItemVerdict | null;
  reason?: string;
  suggestion?: string;
}

export function emptyFieldReviewDraft(): FieldReviewDraft {
  return { verdict: null, reason: "", suggestion: "" };
}

/**
 * 聚合一条字段的评审状态：优先级 nonCompliant > suggest > compliant；
 * 无任何意见返回 null（未评审）。
 */
export function resolveFieldStatus(items: ReviewItem[] | undefined): ReviewItemVerdict | null {
  if (!items || items.length === 0) return null;
  if (items.some((i) => i.verdict === "nonCompliant")) return "nonCompliant";
  if (items.some((i) => i.verdict === "suggest")) return "suggest";
  return "compliant";
}

const BADGE: Record<"none" | ReviewItemVerdict, { bg: string; fg: string; text: string }> = {
  none: { bg: "#eef1f6", fg: "#8a94a6", text: "未评审" },
  compliant: { bg: "#e8f7ee", fg: "#16a34a", text: "合规" },
  nonCompliant: { bg: "#fdeaea", fg: "#dc2626", text: "不合规" },
  suggest: { bg: "#fdf3e3", fg: "#d97706", text: "建议" },
};

/** 评审角色徽标：secretary=格式（秘书格式审查）/ expert=内容（专家审查） */
const ROLE_BADGE: Record<string, { text: string; bg: string; fg: string }> = {
  secretary: { text: "格式", bg: "#eef1fd", fg: "#3b5bdb" },
  expert: { text: "内容", bg: "#e8f7ee", fg: "#16a34a" },
};

export interface FieldReviewTagProps {
  fieldKey: string;
  fieldLabel: string;
  /** true=可编辑；false=只读查看（申请人返修 / 已投票 / 非专家） */
  editable: boolean;
  /** 编辑角色：expert=专家三态（合规/不合规/建议）；secretary=秘书单档（仅格式建议） */
  reviewerRole?: "expert" | "secretary";
  /** 编辑态的草稿（受控） */
  draft?: FieldReviewDraft;
  onDraftChange?: (next: FieldReviewDraft) => void;
  /** 已提交的评审意见（只读展示；可能来自多位专家） */
  existing?: ReviewItem[];
  /** userId -> 显示名，用于只读意见署名 */
  reviewerNames?: Record<string, string>;
}

export function FieldReviewTag({
  fieldKey,
  fieldLabel,
  editable,
  reviewerRole = "expert",
  draft,
  onDraftChange,
  existing,
  reviewerNames,
}: FieldReviewTagProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const status: ReviewItemVerdict | null = editable
    ? (draft?.verdict ?? null)
    : resolveFieldStatus(existing);
  const badge = BADGE[status ?? "none"];

  // 不合规 / 建议时在徽标旁内联展示 reason / suggestion 摘要
  const note = editable
    ? status === "nonCompliant"
      ? draft?.reason?.trim()
      : status === "suggest"
        ? draft?.suggestion?.trim()
        : undefined
    : status === "nonCompliant"
      ? existing?.find((i) => i.verdict === "nonCompliant")?.reason
      : status === "suggest"
        ? existing?.find((i) => i.verdict === "suggest")?.suggestion
        : undefined;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const patch = (p: Partial<FieldReviewDraft>) => {
    if (!editable || !onDraftChange) return;
    const cur = draft ?? emptyFieldReviewDraft();
    onDraftChange({ ...cur, ...p });
  };

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={`${fieldLabel} · ${badge.text}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "1px 8px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: "18px",
          cursor: "pointer",
          border: "none",
          background: badge.bg,
          color: badge.fg,
          whiteSpace: "nowrap",
        }}
      >
        {badge.text}
      </button>
      {note ? (
        <span
          style={{
            fontSize: 11,
            color: "#64748b",
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={note}
        >
          {note}
        </span>
      ) : null}

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 890 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              zIndex: 900,
              width: 300,
              background: "#fff",
              border: "1px solid #e5e9ef",
              borderRadius: 10,
              boxShadow: "0 12px 32px rgba(15,23,42,.16)",
              padding: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <b style={{ fontSize: 12, color: "#1a2233" }}>{fieldLabel}</b>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#8a94a6" }}>{fieldKey}</span>
            </div>

            {editable ? (
              <EditablePopover
                fieldKey={fieldKey}
                reviewerRole={reviewerRole}
                draft={draft ?? emptyFieldReviewDraft()}
                patch={patch}
              />
            ) : (
              <ReadonlyPopover existing={existing} reviewerNames={reviewerNames} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

const VERDICT_OPTIONS: Array<{ verdict: ReviewItemVerdict; label: string }> = [
  { verdict: "compliant", label: "合规" },
  { verdict: "nonCompliant", label: "不合规" },
  { verdict: "suggest", label: "建议修改" },
];

function EditablePopover({
  fieldKey,
  reviewerRole,
  draft,
  patch,
}: {
  fieldKey: string;
  reviewerRole: "expert" | "secretary";
  draft: FieldReviewDraft;
  patch: (p: Partial<FieldReviewDraft>) => void;
}) {
  const verdict = draft.verdict ?? null;

  if (reviewerRole === "secretary") {
    return <SecretaryEditable draft={draft} patch={patch} />;
  }

  return (
    <div>
      <FieldLabel>评审结论</FieldLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {VERDICT_OPTIONS.map((opt) => {
          const b = BADGE[opt.verdict];
          const checked = verdict === opt.verdict;
          return (
            <label
              key={opt.verdict}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                border: `1px solid ${checked ? b.fg : "#d5dbe3"}`,
                borderRadius: 8,
                cursor: "pointer",
                background: checked ? b.bg : "#fff",
              }}
            >
              <input
                type="radio"
                name={`field-review-${fieldKey}`}
                checked={checked}
                onChange={() => patch({ verdict: opt.verdict })}
                style={{ accentColor: b.fg }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: checked ? b.fg : "#1a2233" }}>{opt.label}</span>
            </label>
          );
        })}
      </div>

      {verdict === "nonCompliant" ? (
        <>
          <FieldLabel>不合格原因（必填）</FieldLabel>
          <textarea
            value={draft.reason ?? ""}
            onChange={(e) => patch({ reason: e.target.value })}
            placeholder="填写该字段不合格的具体原因"
            style={textareaStyle}
          />
        </>
      ) : null}

      {verdict === "suggest" ? (
        <>
          <FieldLabel>修改建议</FieldLabel>
          <textarea
            value={draft.suggestion ?? ""}
            onChange={(e) => patch({ suggestion: e.target.value })}
            placeholder="填写对该字段的修改建议"
            style={textareaStyle}
          />
        </>
      ) : null}

      {verdict ? (
        <button
          type="button"
          onClick={() => patch({ verdict: null, reason: "", suggestion: "" })}
          style={{
            marginTop: 8,
            border: "none",
            background: "transparent",
            color: "#8a94a6",
            fontSize: 11,
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
          }}
        >
          清除评审
        </button>
      ) : (
        <div style={{ marginTop: 8, fontSize: 11, color: "#8a94a6", lineHeight: 1.5 }}>
          选择结论后：不合规需填写原因、建议需填写修改建议；未选择的字段不计入逐字段评审。
        </div>
      )}
    </div>
  );
}

function SecretaryEditable({
  draft,
  patch,
}: {
  draft: FieldReviewDraft;
  patch: (p: Partial<FieldReviewDraft>) => void;
}) {
  const marked = draft.verdict === "suggest";
  return (
    <div>
      <FieldLabel>格式建议</FieldLabel>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 10px",
          border: `1px solid ${marked ? "#d97706" : "#d5dbe3"}`,
          borderRadius: 8,
          cursor: "pointer",
          background: marked ? "#fdf3e3" : "#fff",
        }}
      >
        <input
          type="checkbox"
          checked={marked}
          onChange={(e) => patch(e.target.checked ? { verdict: "suggest" } : { verdict: null, suggestion: "" })}
          style={{ accentColor: "#d97706" }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: marked ? "#d97706" : "#1a2233" }}>
          标记为「格式建议」（退回返修）
        </span>
      </label>
      {marked ? (
        <>
          <FieldLabel>建议内容</FieldLabel>
          <textarea
            value={draft.suggestion ?? ""}
            onChange={(e) => patch({ suggestion: e.target.value })}
            placeholder="填写该字段的格式修改建议"
            style={textareaStyle}
          />
        </>
      ) : (
        <div style={{ marginTop: 8, fontSize: 11, color: "#8a94a6", lineHeight: 1.5 }}>
          勾选后填写格式修改建议；未勾选的字段不计入格式建议。
        </div>
      )}
    </div>
  );
}

function ReadonlyPopover({
  existing,
  reviewerNames,
}: {
  existing?: ReviewItem[];
  reviewerNames?: Record<string, string>;
}) {
  const list = existing ?? [];
  if (list.length === 0) {
    return <div style={{ fontSize: 12, color: "#8a94a6", padding: "4px 0 8px" }}>暂无评审意见</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {list.map((it, idx) => {
        const b = BADGE[it.verdict];
        const name = (it.reviewer && reviewerNames?.[it.reviewer]) || it.reviewer || "匿名";
        const role = it.reviewerRole ? ROLE_BADGE[it.reviewerRole] : undefined;
        return (
          <div key={idx} style={{ borderTop: idx > 0 ? "1px solid #f0f2f6" : undefined, paddingTop: idx > 0 ? 8 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 999, background: b.bg, color: b.fg }}>
                {b.text}
              </span>
              {role ? (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: role.bg, color: role.fg }}>
                  {role.text}
                </span>
              ) : null}
              <span style={{ fontSize: 11, color: "#64748b" }}>{name}</span>
              {it.createdAt ? (
                <span style={{ fontSize: 10, color: "#b6bcc8", marginLeft: "auto" }}>
                  {it.createdAt.slice(0, 10)}
                </span>
              ) : null}
            </div>
            {it.reason ? <div style={{ fontSize: 12, color: "#1a2233", lineHeight: 1.5 }}>{it.reason}</div> : null}
            {it.suggestion ? (
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, marginTop: 2 }}>
                建议：{it.suggestion}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", margin: "6px 0 4px" }}>{children}</div>
  );
}

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "6px 10px",
  border: "1px solid #d5dbe3",
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.5,
  fontFamily: "inherit",
  resize: "vertical",
  background: "#fff",
  color: "#1a2233",
};
