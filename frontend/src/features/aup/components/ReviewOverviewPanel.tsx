/**
 * ReviewOverviewPanel —— 评审总览抽屉（§3.9 总览入口）。
 *
 * 按轮次（roundNo 升序）分组，逐轮按评审人展示逐字段意见，能看出每轮由谁提了什么。
 * 数据源：GET /aup/{id}/review/items?roundNo=0（返回全部轮次；summary 为全轮汇总）。
 */

import { useMemo } from "react";
import type { ReviewItem, ReviewItemVerdict } from "@/features/aup/schema/review";
import type { ReviewItemsSummary } from "@/features/aup/api/aup.api";
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
  summary?: ReviewItemsSummary;
  items?: ReviewItem[];
  reviewerNames?: Record<string, string>;
}

const STATUS_BADGE: Record<ReviewItemVerdict, { bg: string; fg: string }> = {
  compliant: { bg: "#e8f7ee", fg: "#16a34a" },
  nonCompliant: { bg: "#fdeaea", fg: "#dc2626" },
  suggest: { bg: "#fdf3e3", fg: "#d97706" },
};

/** roundNo 兜底：缺失 / 0 归为「历史批注」（key=0） */
function roundKeyOf(it: ReviewItem): number {
  return it.roundNo && it.roundNo > 0 ? it.roundNo : 0;
}

function roundLabel(roundNo: number): string {
  return roundNo > 0 ? `第 ${roundNo} 轮` : "历史批注";
}

function groupByReviewer(items: ReviewItem[]): Array<[string, ReviewItem[]]> {
  const m = new Map<string, ReviewItem[]>();
  for (const it of items) {
    const key = it.reviewer ?? "未知评审人";
    const arr = m.get(key) ?? [];
    arr.push(it);
    m.set(key, arr);
  }
  return [...m.entries()];
}

export function ReviewOverviewPanel({
  open,
  onClose,
  summary,
  items,
  reviewerNames,
}: ReviewOverviewPanelProps) {
  // 全部轮次按 roundNo 升序分组，每个轮次内再按评审人分组
  const rounds = useMemo(() => {
    const m = new Map<number, ReviewItem[]>();
    for (const it of items ?? []) {
      const r = roundKeyOf(it);
      const arr = m.get(r) ?? [];
      arr.push(it);
      m.set(r, arr);
    }
    return [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([roundNo, roundItems]) => ({
        roundNo,
        label: roundLabel(roundNo),
        itemsByReviewer: groupByReviewer(roundItems),
      }));
  }, [items]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          width: 640,
          maxWidth: "94vw",
          maxHeight: "85vh",
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,.2)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #e5e9ef",
          }}
        >
          <b style={{ fontSize: 15, color: "#1a2233" }}>评审总览</b>
          <button
            type="button"
            onClick={onClose}
            style={btnGhostSmall}
          >
            ✕ 关闭
          </button>
        </div>

        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e9ef" }}>
          <SummaryStrip summary={summary} />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: "12px 20px 20px" }}>
          {rounds.length === 0 ? (
            <div style={{ fontSize: 13, color: "#8a94a6", textAlign: "center", padding: 24 }}>暂无评审意见</div>
          ) : (
            rounds.map((r) => (
              <div key={r.roundNo} style={{ marginBottom: 18 }}>
                <b
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: ".04em",
                    marginBottom: 8,
                  }}
                >
                  {r.label}
                </b>
                <ReviewerBreakdown itemsByReviewer={r.itemsByReviewer} reviewerNames={reviewerNames} />
              </div>
            ))
          )}
        </div>
      </div>
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

const ROLE_BADGE: Record<string, { text: string; bg: string; fg: string }> = {
  secretary: { text: "格式", bg: "#eef1fd", fg: "#3b5bdb" },
  expert: { text: "内容", bg: "#e8f7ee", fg: "#16a34a" },
};

/** 按评审人分组展示其格式/内容批注（逐人区分快照） */
function ReviewerBreakdown({
  itemsByReviewer,
  reviewerNames,
}: {
  itemsByReviewer: Array<[string, ReviewItem[]]>;
  reviewerNames?: Record<string, string>;
}) {
  if (itemsByReviewer.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {itemsByReviewer.map(([reviewer, its]) => {
        const name = (reviewer && reviewerNames?.[reviewer]) || reviewer || "匿名";
        const role = its[0]?.reviewerRole ? ROLE_BADGE[its[0].reviewerRole] : undefined;
        const nonCompliant = its.filter((i) => i.verdict === "nonCompliant").length;
        const suggest = its.filter((i) => i.verdict === "suggest").length;
        return (
          <div key={reviewer} style={{ border: "1px solid #e5e9ef", borderRadius: 8, padding: "8px 10px", background: "#fbfcfe" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <b style={{ fontSize: 12, color: "#1a2233" }}>{name}</b>
              {role ? (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: role.bg, color: role.fg }}>
                  {role.text}
                </span>
              ) : null}
              <span style={{ fontSize: 11, color: "#8a94a6" }}>
                共 {its.length} 条{nonCompliant > 0 ? ` · 不合规 ${nonCompliant}` : ""}{suggest > 0 ? ` · 建议 ${suggest}` : ""}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {its.map((it, i) => (
                <div key={i} style={{ fontSize: 12, color: "#1a2233", lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600 }}>{it.fieldLabel}</span>
                  <span style={{ marginLeft: 6 }}>
                    <FieldStatusBadge status={it.verdict} />
                  </span>
                  {it.reason ? <span style={{ color: "#64748b", marginLeft: 6 }}>{it.reason}</span> : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SummaryStrip({ summary }: { summary?: ReviewItemsSummary }) {
  const totalFields = summary?.totalFields ?? 0;
  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <Stat label="已评审" value={summary ? `${summary.reviewedCount}/${summary.totalFields}` : `—/${totalFields}`} />
      <Stat label="不合规" value={summary ? String(summary.nonCompliantCount) : "—"} danger />
      <Stat label="建议修改" value={summary ? String(summary.suggestCount) : "—"} warn />
    </div>
  );
}

function Stat({ label, value, danger, warn }: { label: string; value: string; danger?: boolean; warn?: boolean }) {
  const color = danger ? "#dc2626" : warn ? "#d97706" : "#1a2233";
  return (
    <div>
      <div style={{ fontSize: 11, color: "#8a94a6" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

const btnGhostSmall: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  borderRadius: 6,
  cursor: "pointer",
  border: "1px solid #d5dbe3",
  background: "#fff",
  color: "#1a2233",
};
