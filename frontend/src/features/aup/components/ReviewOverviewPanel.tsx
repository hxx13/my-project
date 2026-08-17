/**
 * ReviewOverviewPanel —— 评审总览弹窗（§3.9 总览入口）。
 *
 * 以「评审会话」为单位组织：每一次专家投票 / 秘书格式审查 = 一个 tab（专家 + 日期 + 轮次）。
 * 切换 tab 查看该次评审的整体结论（同意/不合格/修改/拒评/回避）+ 逐字段意见。
 * 数据源：GET /aup/{id}/review/sessions —— 整体同意/弃权/回避且无逐条批注的评审人也会出现，
 * 解决「合格专家的评审在总览中看不到」的问题。
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ReviewItem, ReviewItemVerdict, ReviewVerdict } from "@/features/aup/schema/review";
import type { ReviewSessionVO } from "@/features/aup/api/aup.api";
import type { FormField } from "@/features/aup/schema/formTemplate";
import { ITEM_VERDICT_LABELS } from "./FieldReviewTag";

/** 平铺后的字段（模板嵌套树 + draftData 平铺值 → 一维），供总览分组与表单渲染共用 */
export interface FlatField {
  key: string;
  label: string;
  type: string;
  sectionKey: string;
  sectionLabel: string;
  subsectionLabel?: string;
  required?: boolean;
  value: unknown;
  /** 原始模板字段（渲染只读值用，如 options / table columns） */
  field: FormField;
}

export interface ReviewOverviewPanelProps {
  open: boolean;
  onClose: () => void;
  sessions?: ReviewSessionVO[];
}

/** 整体结论 → 展示（同意/不合格/修改/拒评/回避） */
const OVERALL_LABELS: Record<ReviewVerdict, { text: string; bg: string; fg: string }> = {
  agree: { text: "同意", bg: "#e8f7ee", fg: "#16a34a" },
  disagree: { text: "不合格", bg: "#fdeaea", fg: "#dc2626" },
  modify: { text: "修改", bg: "#fdf3e3", fg: "#d97706" },
  recuse: { text: "回避", bg: "#eef1f6", fg: "#64748b" },
  abstain: { text: "拒评", bg: "#eef1f6", fg: "#64748b" },
};

/** 评审角色 → 展示（格式 / 内容） */
const ROLE_BADGE: Record<string, { text: string; bg: string; fg: string }> = {
  secretary: { text: "格式", bg: "#eef1fd", fg: "#3b5bdb" },
  expert: { text: "内容", bg: "#e8f7ee", fg: "#16a34a" },
};

const STATUS_BADGE: Record<ReviewItemVerdict, { bg: string; fg: string }> = {
  compliant: { bg: "#e8f7ee", fg: "#16a34a" },
  nonCompliant: { bg: "#fdeaea", fg: "#dc2626" },
  suggest: { bg: "#fdf3e3", fg: "#d97706" },
};

/** "2026-08-15T10:30:00" → "08-15"（tab 标签用） */
function tabDate(iso?: string): string {
  return iso && iso.length >= 10 ? iso.slice(5, 10) : "";
}

/** "2026-08-15T10:30:00" → "2026-08-15 10:30"（内容区完整时间用） */
function fullDate(iso?: string): string {
  return iso ? iso.slice(0, 16).replace("T", " ") : "";
}

/** 无逐条批注时的兜底说明 */
function emptyHint(v: ReviewVerdict): { text: string; tone: "success" | "muted" } {
  if (v === "agree") {
    return { text: "该评审整体结论为「同意」，全部字段合规，未对具体字段逐条批注。", tone: "success" };
  }
  if (v === "abstain") {
    return { text: "该专家弃权（拒评），未对具体字段评审。", tone: "muted" };
  }
  if (v === "recuse") {
    return { text: "该专家回避，未对具体字段评审。", tone: "muted" };
  }
  return { text: "该次评审未留下逐字段意见。", tone: "muted" };
}

export function ReviewOverviewPanel({ open, onClose, sessions }: ReviewOverviewPanelProps) {
  const allSessions = sessions ?? [];
  const [activeIdx, setActiveIdx] = useState(0);
  const [roundFilter, setRoundFilter] = useState<number | "all">("all");

  // 打开时回到第一个会话 + 全部轮次
  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      setRoundFilter("all");
    }
  }, [open]);

  const roundNos = useMemo(
    () => Array.from(new Set(allSessions.map((s) => s.roundNo))).sort((a, b) => a - b),
    [allSessions]
  );
  const filtered = useMemo(
    () => (roundFilter === "all" ? allSessions : allSessions.filter((s) => s.roundNo === roundFilter)),
    [allSessions, roundFilter]
  );
  const safeIdx = Math.min(activeIdx, Math.max(0, filtered.length - 1));
  const active = filtered[safeIdx];

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "transparent",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          width: 900,
          maxWidth: "96vw",
          maxHeight: "88vh",
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,.24)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div style={hdStyle}>
          <b style={{ fontSize: 15, color: "#1a2233" }}>评审总览</b>
          <span style={{ fontSize: 12, color: "#8a94a6", fontWeight: 400 }}>
            {allSessions.length} 次评审记录
            {roundNos.length > 1 ? ` · ${roundNos.length} 个轮次` : ""}
          </span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={btnGhostSmall}>
            ✕ 关闭
          </button>
        </div>

        {/* 轮次筛选（多轮次时出现） */}
        {roundNos.length > 1 ? (
          <div style={{ padding: "10px 20px 0", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#8a94a6", marginRight: 2 }}>轮次：</span>
            <button
              type="button"
              onClick={() => {
                setRoundFilter("all");
                setActiveIdx(0);
              }}
              style={roundChip(roundFilter === "all")}
            >
              全部
            </button>
            {roundNos.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRoundFilter(r);
                  setActiveIdx(0);
                }}
                style={roundChip(roundFilter === r)}
              >
                第 {r} 轮
              </button>
            ))}
          </div>
        ) : null}

        {/* 会话 tab 条：专家 + 日期 + 轮次 */}
        {filtered.length > 0 ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "10px 20px 0",
              overflowX: "auto",
              overscrollBehavior: "contain",
              scrollbarWidth: "thin",
            }}
          >
            {filtered.map((s, i) => {
              const ol = OVERALL_LABELS[s.verdict] ?? OVERALL_LABELS.agree;
              const name = s.reviewerName || s.reviewer || "匿名";
              const nonCompliant = s.items.filter((it) => it.verdict === "nonCompliant").length;
              const suggest = s.items.filter((it) => it.verdict === "suggest").length;
              return (
                <button
                  key={`${s.reviewer}-${s.roundNo}-${s.createdAt}-${i}`}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 12px",
                    borderRadius: 9,
                    border: i === safeIdx ? "1px solid #3b5bdb" : "1px solid #d5dbe3",
                    background: i === safeIdx ? "#eef1fd" : "#fbfcfe",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "#1a2233",
                    whiteSpace: "nowrap",
                    fontFamily: "inherit",
                  }}
                  title={`${name} · ${fullDate(s.createdAt)} · 第 ${s.roundNo} 轮 · ${ol.text}`}
                >
                  <span
                    style={{ width: 8, height: 8, borderRadius: "50%", background: ol.fg, flexShrink: 0 }}
                  />
                  <b>{name}</b>
                  <span style={{ color: "#64748b" }}>{tabDate(s.createdAt)}</span>
                  <span style={{ color: "#8a94a6" }}>第{s.roundNo}轮</span>
                  {nonCompliant > 0 ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", background: "#fdeaea", padding: "1px 6px", borderRadius: 999 }}>
                      不合格 {nonCompliant}
                    </span>
                  ) : null}
                  {suggest > 0 && nonCompliant === 0 ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#d97706", background: "#fdf3e3", padding: "1px 6px", borderRadius: 999 }}>
                      建议 {suggest}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* 内容区 */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: "14px 20px 20px",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ fontSize: 13, color: "#8a94a6", textAlign: "center", padding: 28 }}>
              {allSessions.length === 0 ? "暂无评审记录" : "该轮次暂无评审记录"}
            </div>
          ) : active ? (
            <SessionDetail session={active} />
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* =====================================================================
 * 子组件
 * ================================================================== */

function SessionDetail({ session }: { session: ReviewSessionVO }) {
  const ol = OVERALL_LABELS[session.verdict] ?? OVERALL_LABELS.agree;
  const role = session.role ? ROLE_BADGE[session.role] : undefined;
  const name = session.reviewerName || session.reviewer || "匿名";
  const items = session.items ?? [];
  const hint = items.length === 0 ? emptyHint(session.verdict) : null;

  return (
    <div>
      {/* 会话头：评审人 + 角色 + 整体结论 + 时间 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        <b style={{ fontSize: 15, color: "#1a2233" }}>{name}</b>
        {role ? (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: role.bg, color: role.fg }}>
            {role.text}审查
          </span>
        ) : null}
        <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 999, background: ol.bg, color: ol.fg }}>
          {ol.text}
        </span>
        <span style={{ fontSize: 12, color: "#8a94a6" }}>
          第 {session.roundNo} 轮 · {fullDate(session.createdAt)}
        </span>
      </div>

      {/* 整体意见 */}
      {session.comment ? (
        <div style={{ fontSize: 13, color: "#334155", background: "#f8fafc", border: "1px solid #e5e9ef", borderRadius: 8, padding: "8px 12px", margin: "8px 0 12px", whiteSpace: "pre-wrap" }}>
          <span style={{ color: "#64748b", fontWeight: 600, marginRight: 6 }}>整体意见</span>
          {session.comment}
        </div>
      ) : null}

      {/* 逐字段意见 */}
      {items.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {items.map((it, i) => (
            <div key={`${it.fieldKey}-${i}`} style={{ border: "1px solid #e5e9ef", borderRadius: 8, padding: "8px 12px", background: "#fbfcfe" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "#1a2233", minWidth: 0 }}>{it.fieldLabel}</span>
                <FieldStatusBadge status={it.verdict} />
              </div>
              {it.reason ? (
                <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4, lineHeight: 1.5 }}>
                  原因：{it.reason}
                </div>
              ) : null}
              {it.suggestion ? (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, lineHeight: 1.5 }}>
                  建议：{it.suggestion}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : hint ? (
        <div
          style={{
            fontSize: 13,
            marginTop: 12,
            padding: "14px 16px",
            borderRadius: 8,
            textAlign: "center",
            color: hint.tone === "success" ? "#16a34a" : "#8a94a6",
            background: hint.tone === "success" ? "#e8f7ee" : "#f2f4f8",
          }}
        >
          {hint.text}
        </div>
      ) : null}
    </div>
  );
}

function FieldStatusBadge({ status }: { status: ReviewItemVerdict | null }) {
  if (!status) {
    return (
      <span style={{ fontSize: 10, color: "#b6bcc8", padding: "1px 8px", borderRadius: 999, background: "#f2f4f8" }}>
        未评审
      </span>
    );
  }
  const b = STATUS_BADGE[status];
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color: b.fg, padding: "1px 8px", borderRadius: 999, background: b.bg }}>
      {ITEM_VERDICT_LABELS[status]}
    </span>
  );
}

const hdStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "16px 20px",
  borderBottom: "1px solid #e5e9ef",
};

const btnGhostSmall: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  borderRadius: 6,
  cursor: "pointer",
  border: "1px solid #d5dbe3",
  background: "#fff",
  color: "#1a2233",
  fontFamily: "inherit",
};

function roundChip(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    fontSize: 12,
    borderRadius: 999,
    cursor: "pointer",
    border: active ? "1px solid #3b5bdb" : "1px solid #d5dbe3",
    background: active ? "#eef1fd" : "#fff",
    color: active ? "#3b5bdb" : "#1a2233",
    fontFamily: "inherit",
  };
}
