/**
 * AupReviewPage —— IACUC AUP 审批页（按角色渲染）。
 *
 * 组长(pi) → submitPiReview（approve 通过进格式审查 / return 退回申请人）
 * 秘书(secretary) → submitFormatReview（items 非空→退回；空→分配专家 + reviewForm + expertIds[]）
 * 专家(expert) → submitExpertReview（弃权/回避传 verdict；正常评审仅 items[] 逐字段，后端推导整体结论）
 *
 * 表单数据只读平铺渲染：draftData 平铺 {fieldKey:value}，template 嵌套树驱动字段结构。
 * 逐字段评审：FieldReviewTag（快捷入口）+ ReviewOverviewPanel（总览抽屉）。
 */

import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import {
  useAupDetail,
  useAupReview,
  useAupSnapshots,
  useAupSnapshot,
  useAupTemplateById,
  useReviewerConfig,
  useRestoreAupDemo,
  useUnlockAup,
  useExperts,
  useAupMyRoles,
} from "@/features/aup/hooks/useAup";
import type {
  AupRecord,
  ReviewForm,
  AupTrace,
} from "@/features/aup/schema/aup";
import type { FormSection, FormField } from "@/features/aup/schema/formTemplate";
import type {
  ReviewVerdict,
  ReviewItem,
  ReviewItemInput,
  FormatReviewItemInput,
  ReviewProgress,
  Expert,
  ReviewerConfig,
} from "@/features/aup/schema/review";
import type { ReviewItemsSummary, TemplateDetailVO } from "@/features/aup/api/aup.api";
import { FieldReviewTag, emptyFieldReviewDraft } from "../components/FieldReviewTag";
import { displayTitle } from "../components/FormField";
import type { FieldReviewDraft } from "../components/FieldReviewTag";
import { ReviewOverviewPanel } from "../components/ReviewOverviewPanel";
import type { FlatField } from "../components/ReviewOverviewPanel";

/* =====================================================================
 * 常量
 * ================================================================== */

const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  agree: "同意",
  disagree: "不合格",
  modify: "修改",
  recuse: "回避",
  abstain: "拒评",
};

const STAGE_META: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "填写中", bg: "#eef1f6", fg: "#64748b" },
  piReview: { label: "组长审核", bg: "#eef1fd", fg: "#3b5bdb" },
  formatReview: { label: "格式审查", bg: "#eef1fd", fg: "#3b5bdb" },
  expertReview: { label: "专家审查", bg: "#eef1fd", fg: "#3b5bdb" },
  approved: { label: "已批准", bg: "#e8f7ee", fg: "#16a34a" },
  terminated: { label: "已终止", bg: "#fdeaea", fg: "#dc2626" },
  expired: { label: "已过期", bg: "#fdeaea", fg: "#dc2626" },
};

const DRAFT_SOURCE_LABELS: Record<string, string> = {
  first: "首次填写",
  piReturn: "组长退回修改",
  formatReturn: "格式退回修改",
  expertReturn: "专家退回修改",
  rollback: "回退",
};

const STAGES: Array<{ key: string; label: string }> = [
  { key: "draft", label: "填写计划书" },
  { key: "piReview", label: "组长审核" },
  { key: "formatReview", label: "格式审查" },
  { key: "expertReview", label: "专家审查" },
  { key: "approved", label: "审核通过" },
];

/* =====================================================================
 * 工具函数
 * ================================================================== */

function parseFlatData(raw?: string | Record<string, unknown> | null): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw;
}

function flattenSections(sections: FormSection[], data: Record<string, unknown>): FlatField[] {
  const out: FlatField[] = [];
  const push = (sec: FormSection, subLabel: string | undefined, f: FormField) => {
    out.push({
      key: f.fieldKey,
      label: f.label,
      type: f.type,
      sectionKey: sec.code,
      sectionLabel: displayTitle(sec.code, sec.label),
      subsectionLabel: subLabel,
      required: f.required,
      value: data[f.fieldKey],
      field: f,
    });
  };
  for (const sec of sections) {
    for (const sub of sec.subsections ?? []) {
      for (const f of sub.fields ?? []) push(sec, sub.label, f);
    }
    for (const f of sec.fields ?? []) push(sec, undefined, f);
  }
  return out;
}

function flattenTemplate(
  template: TemplateDetailVO | undefined,
  data: Record<string, unknown>
): FlatField[] {
  return flattenSections(template?.sections ?? [], data);
}

function optionLabel(options: FormField["options"], v: unknown): string {
  const s = String(v ?? "");
  if (!options || options.length === 0) return s;
  for (const opt of options) {
    if (typeof opt === "string") {
      if (opt === s) return opt;
    } else if (opt.value === s) {
      return opt.label;
    }
  }
  return s;
}

function pickerLabel(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  const o = v as { label?: unknown; name?: unknown; value?: unknown };
  return String(o.label ?? o.name ?? o.value ?? "");
}

function fileLabel(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  const o = v as { fileName?: unknown; name?: unknown };
  return String(o.fileName ?? o.name ?? "");
}

function formatScalar(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "是" : "否";
  return String(v);
}

function formatFieldValue(field: FormField, value: unknown): string {
  if (value == null || value === "") return "";
  switch (field.type) {
    case "choice":
    case "checkbox": {
      if (Array.isArray(value)) return value.map((v) => optionLabel(field.options, v)).filter(Boolean).join("、");
      return optionLabel(field.options, value);
    }
    case "table":
      if (Array.isArray(value)) return `${value.length} 行`;
      return typeof value === "string" ? value : JSON.stringify(value);
    case "file":
    case "image":
      if (Array.isArray(value)) return value.map(fileLabel).filter(Boolean).join("、");
      return fileLabel(value);
    case "personPicker":
    case "departmentPicker":
    case "cagePicker":
    case "animalPicker":
      if (Array.isArray(value)) return value.map(pickerLabel).filter(Boolean).join("、");
      return pickerLabel(value);
    default:
      return typeof value === "string" ? value : JSON.stringify(value);
  }
}

type ReviewRole = "pi" | "secretary" | "expert" | "viewer";

/** 判断当前用户是否被分配为当前轮的审查专家：待投（unvoted）或已投/回避（votes）均算 */
function isAssignedExpert(userId: string, progress: ReviewProgress | undefined): boolean {
  if ((progress?.unvoted ?? []).includes(userId)) return true;
  return (progress?.votes ?? []).some((v) => v.reviewer === userId);
}

function resolveReviewRole(
  config: ReviewerConfig | undefined,
  userId: string | undefined,
  progress: ReviewProgress | undefined,
  isPi: boolean
): ReviewRole {
  if (!userId) return "viewer";
  // 组长身份按后端 isPi 判定（GROUP_LEADER 身份标识，与 my-roles.isPi 一致）
  if (isPi) return "pi";
  // 专家身份按「是否被分配为当前轮审查专家」判定，不再依赖 reviewer-config（纯专家无权限读该接口，会 403）
  if (isAssignedExpert(userId, progress)) return "expert";
  // 秘书身份按格式审查人名册判定（秘书可读 reviewer-config）
  if (config?.formatReviewers?.some((r) => r.userId === userId)) return "secretary";
  return "viewer";
}

/* =====================================================================
 * 页面
 * ================================================================== */

export default function AupReviewPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <Centered text="缺少计划书 id" />;
  }
  return <ReviewContent key={id} id={id} />;
}

function ReviewContent({ id }: { id: string }) {
  const navigate = useNavigate();
  const currentUserId = authStorage.getUserInfo()?.id;

  const detailQuery = useAupDetail(id);
  const detail = detailQuery.data;
  const record = detail?.record;

  // 模板结构由模板子模块另取（AupDetailVO 不返回 template）
  const templateQuery = useAupTemplateById(record?.templateId ?? undefined);

  const review = useAupReview(id);
  const configQuery = useReviewerConfig();
  const expertsQuery = useExperts();
  const myRolesQuery = useAupMyRoles();
  const restoreMut = useRestoreAupDemo();
  const unlockMut = useUnlockAup();
  const isAdmin = hasMinRole(authStorage.getRole() || "", "ADMIN");

  // 非 draft 阶段 draftData 可能不返回，回退取最新快照数据渲染只读表单
  const inDraft = record?.currentStage === "draft";
  const snapshotsQuery = useAupSnapshots(!inDraft && !!record ? id : undefined);
  const latestSnapshotId = useMemo(() => {
    const list = snapshotsQuery.data ?? detail?.snapshots ?? [];
    return [...list].sort((a, b) => (b.versionNo ?? 0) - (a.versionNo ?? 0))[0]?.snapshotId;
  }, [snapshotsQuery.data, detail?.snapshots]);
  const latestSnapshotQuery = useAupSnapshot(!inDraft && latestSnapshotId ? id : undefined, latestSnapshotId);

  const flatData = useMemo(() => {
    const d = parseFlatData(detail?.draftData);
    if (Object.keys(d).length > 0) return d;
    return parseFlatData(latestSnapshotQuery.data?.data);
  }, [detail?.draftData, latestSnapshotQuery.data?.data]);

  const flatFields = useMemo(() => flattenTemplate(templateQuery.data, flatData), [templateQuery.data, flatData]);

  const sectionGroups = useMemo(() => {
    const m = new Map<string, FlatField[]>();
    for (const f of flatFields) {
      const arr = m.get(f.sectionKey) ?? [];
      arr.push(f);
      m.set(f.sectionKey, arr);
    }
    return [...m.entries()];
  }, [flatFields]);

  const config = configQuery.data;
  const experts = expertsQuery.data ?? [];
  const progress = review.progressQuery.data;
  const overviewItems = review.itemsQuery.data?.items ?? [];
  const overviewSummary: ReviewItemsSummary | undefined = review.itemsQuery.data?.summary;

  const role: ReviewRole = resolveReviewRole(
    config,
    currentUserId,
    progress,
    myRolesQuery.data?.isPi ?? false
  );
  const stage = record?.currentStage ?? "draft";
  // 已投票判定：被分配专家且不在未投名单中（后端不再返回 reviews 列表）
  const alreadyVoted =
    role === "expert" && !!progress && !(progress.unvoted ?? []).includes(currentUserId ?? "");

  const canVoteExpert = stage === "expertReview" && role === "expert" && !alreadyVoted;
  const secretaryCanAct = stage === "formatReview" && role === "secretary";
  const piCanAct = stage === "piReview" && (role === "pi" || isAdmin);
  const fieldTagEditable = canVoteExpert || secretaryCanAct;
  const fieldTagRole: "expert" | "secretary" = secretaryCanAct ? "secretary" : "expert";

  const reviewerNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of experts) m[e.userId] = e.name;
    for (const r of config?.formatReviewers ?? []) m[r.userId] = r.name ?? r.userId;
    for (const r of config?.expertCandidates ?? []) m[r.userId] = r.name ?? r.userId;
    return m;
  }, [experts, config]);

  const itemsByFieldKey = useMemo(() => {
    const m = new Map<string, ReviewItem[]>();
    for (const it of overviewItems) {
      const arr = m.get(it.fieldKey) ?? [];
      arr.push(it);
      m.set(it.fieldKey, arr);
    }
    return m;
  }, [overviewItems]);

  // 专家逐字段草稿（三态）
  const [expertDrafts, setExpertDrafts] = useState<Record<string, FieldReviewDraft>>({});
  const updateExpertDraft = (fieldKey: string, next: FieldReviewDraft) =>
    setExpertDrafts((prev) => ({ ...prev, [fieldKey]: next }));

  // 秘书逐字段格式建议草稿（仅「建议」档）
  const [secretaryDrafts, setSecretaryDrafts] = useState<Record<string, FieldReviewDraft>>({});
  const updateSecretaryDraft = (fieldKey: string, next: FieldReviewDraft) =>
    setSecretaryDrafts((prev) => ({ ...prev, [fieldKey]: next }));

  // 当前编辑态对应的草稿集合与写入器（按阶段/角色二选一）
  const activeDrafts = secretaryCanAct ? secretaryDrafts : expertDrafts;
  const updateActiveDraft = secretaryCanAct ? updateSecretaryDraft : updateExpertDraft;

  // 秘书已标格式建议的字段数（>0 即退回）
  const secretarySuggestionCount = useMemo(
    () => flatFields.filter((f) => secretaryDrafts[f.key]?.verdict).length,
    [flatFields, secretaryDrafts]
  );

  // 总览抽屉
  const [overviewOpen, setOverviewOpen] = useState(false);

  const jumpToField = (fieldKey: string) => {
    document.getElementById(`field-${fieldKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /* ---------- 提交逻辑 ---------- */

  const buildItems = (): ReviewItemInput[] => {
    const out: ReviewItemInput[] = [];
    for (const f of flatFields) {
      const d = expertDrafts[f.key];
      if (!d?.verdict) continue;
      out.push({
        fieldKey: f.key,
        sectionKey: f.sectionKey,
        fieldLabel: f.label,
        verdict: d.verdict,
        reason: d.verdict === "nonCompliant" ? d.reason?.trim() || undefined : undefined,
        suggestion: d.verdict === "suggest" ? d.suggestion?.trim() || undefined : undefined,
      });
    }
    return out;
  };

  const buildSecretaryItems = (): FormatReviewItemInput[] => {
    const out: FormatReviewItemInput[] = [];
    for (const f of flatFields) {
      const d = secretaryDrafts[f.key];
      if (!d?.verdict) continue; // 秘书仅「suggest」档
      out.push({
        fieldKey: f.key,
        sectionKey: f.sectionKey,
        fieldLabel: f.label,
        suggestion: d.suggestion?.trim() || undefined,
      });
    }
    return out;
  };

  const handleExpertSubmit = (verdict: "abstain" | "recuse" | null, comment: string) => {
    // 弃权/回避：直接传 verdict，不标字段
    if (verdict === "abstain" || verdict === "recuse") {
      review.expertReview.mutate({ verdict, comment: comment.trim() || undefined });
      return;
    }
    // 正常评审：逐字段「不合规」必填原因
    for (const f of flatFields) {
      const d = expertDrafts[f.key];
      if (d?.verdict === "nonCompliant" && !d.reason?.trim()) {
        toast.error(`字段「${f.label}」标记为不合规，请填写不合格原因`);
        return;
      }
    }
    const items = buildItems();
    // 误操作防护：一个字段都不标即提交，后端会推导为「同意」并可能推动整本计划书通过，必须拦截
    if (items.length === 0) {
      toast.error("未标记任何字段，提交将视为同意，请先标记评审意见或选择弃权/回避");
      return;
    }
    // 只传 items，整体结论由后端逐字段推导
    review.expertReview.mutate({ comment: comment.trim() || undefined, items });
  };

  const handleFormatSubmit = (comment: string, reviewForm: ReviewForm, expertIds: string[]) => {
    const items = buildSecretaryItems();
    if (items.length > 0) {
      // 有格式建议 → 退回返修（后端判为 return）
      review.formatReview.mutate({ comment: comment.trim() || undefined, items });
      return;
    }
    // 无格式建议 → 分配专家（后端判为 approve 并流转）
    if (!reviewForm) {
      toast.error("请选择专家审查形式");
      return;
    }
    if (expertIds.length === 0) {
      toast.error("分配专家至少选择 1 名专家");
      return;
    }
    review.formatReview.mutate({ reviewForm, expertIds });
  };

  const handlePiSubmit = (action: "approve" | "return", comment: string) => {
    if (action === "return" && !comment.trim()) {
      toast.error("退回必须填写意见");
      return;
    }
    review.piReview.mutate({ action, comment: comment.trim() || undefined });
  };

  /* ---------- 渲染 ---------- */

  if (detailQuery.isLoading) return <Centered text="加载中…" />;
  if (detailQuery.isError || !record) {
    return <Centered text={detailQuery.isError ? "加载计划书失败" : "计划书不存在"} />;
  }

  const stageMeta = STAGE_META[stage] ?? STAGE_META.draft;
  const terminal = stage === "terminated" || stage === "expired";
  const currentStepIdx = terminal || stage === "approved" ? 4 : stage === "expertReview" ? 3 : stage === "formatReview" ? 2 : stage === "piReview" ? 1 : 0;

  return (
    <div className="aup-review">
      <style dangerouslySetInnerHTML={{ __html: REVIEW_CSS }} />

      {/* 工具栏 */}
      <div className="ar-toolbar">
        <button type="button" className="ar-btn ghost small" onClick={() => navigate("/console/admin/aup")}>
          ← 返回列表
        </button>
        <span style={{ fontSize: 15, fontWeight: 700 }}>计划书审核</span>
        <span className="ar-tag" style={{ background: stageMeta.bg, color: stageMeta.fg }}>
          {stageMeta.label}
        </span>
        {record.roundNo > 1 ? (
          <span className="ar-tag" style={{ background: "#fdf3e3", color: "#d97706" }}>
            第 {record.roundNo} 轮
          </span>
        ) : null}
        <span className="ar-spacer" />
        {record.isDemo === 1 ? (
          <button
            type="button"
            className="ar-btn ghost"
            disabled={restoreMut.isPending}
            onClick={() => restoreMut.mutate(record.id)}
          >
            {restoreMut.isPending ? "恢复中…" : "恢复示例"}
          </button>
        ) : null}
        {(terminal || stage === "approved") && isAdmin ? (
          <button
            type="button"
            className="ar-btn ghost"
            style={{ color: "#d97706", borderColor: "#d97706" }}
            disabled={unlockMut.isPending}
            onClick={() => unlockMut.mutate(record.id)}
          >
            {unlockMut.isPending ? "解锁中…" : "解锁返修"}
          </button>
        ) : null}
        <button type="button" className="ar-btn ghost" onClick={() => setOverviewOpen(true)}>
          评审总览
        </button>
      </div>

      {/* 阶段指示 */}
      <div className="ar-stepper-wrap">
        <div className="ar-stepper">
          {STAGES.map((s, i) => {
            const state = terminal
              ? i < 4
                ? "done"
                : i === 4
                  ? "end"
                  : "pending"
              : i < currentStepIdx
                ? "done"
                : i === currentStepIdx
                  ? "active"
                  : "pending";
            const label = terminal && i === 4 ? (stage === "terminated" ? "已终止" : "已过期") : s.label;
            return (
              <div key={s.key} style={{ display: "contents" }}>
                {i > 0 ? <div className={`ar-connector ${i <= currentStepIdx && !terminal ? "done" : ""}`} /> : null}
                <div className={`ar-step ${state}`}>
                  <div className="ar-dot">{state === "done" ? "✓" : i + 1}</div>
                  <div className="ar-label">{label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ar-layout">
        <div className="ar-main">
          <InfoCard record={record} />

          {record.isDemo === 1 ? (
            <div
              className="ar-card"
              style={{ marginBottom: 16, padding: "14px 18px", borderColor: "#eef1fd", background: "#f5f7ff", color: "#3b5bdb", fontSize: 13 }}
            >
              演示示例：本计划书为内置演示数据，可查看各阶段真实作答与评审状态；流转已被阻止，可点击右上角「恢复示例」重置。
            </div>
          ) : null}

          {terminal || stage === "approved" ? (
            <ReadonlyBanner
              text={stage === "approved" ? `已于 ${record.approvedAt?.slice(0, 10) ?? "—"} 审核通过` : stage === "terminated" ? "该计划书已终止" : "该计划书已过期"}
            />
          ) : null}

          {stage === "draft" ? (
            <ReadonlyBanner text={`当前为草稿/返修阶段（${DRAFT_SOURCE_LABELS[record.draftSource] ?? "—"}），只读查看`} />
          ) : null}

          {/* 按角色渲染的审查操作区 */}
          {stage === "piReview" && (
            <PiReviewPanel
              canAct={piCanAct}
              submitting={review.piReview.isPending}
              onSubmit={handlePiSubmit}
            />
          )}
          {stage === "formatReview" && (
            <FormatReviewPanel
              canAct={role === "secretary"}
              experts={experts}
              submitting={review.formatReview.isPending}
              suggestionCount={secretarySuggestionCount}
              onSubmit={handleFormatSubmit}
            />
          )}
          {stage === "expertReview" && (
            <ExpertReviewPanel
              canVote={canVoteExpert}
              alreadyVoted={alreadyVoted}
              submitting={review.expertReview.isPending}
              onSubmit={handleExpertSubmit}
            />
          )}

          {/* 只读表单 */}
          {sectionGroups.map(([sectionKey, fields]) => {
            const sectionLabel = fields[0]?.sectionLabel ?? sectionKey;
            return (
              <SectionCard
                key={sectionKey}
                sectionKey={sectionKey}
                sectionLabel={sectionLabel}
                fields={fields}
                editable={fieldTagEditable}
                reviewerRole={fieldTagRole}
                drafts={activeDrafts}
                onDraftChange={updateActiveDraft}
                itemsByFieldKey={itemsByFieldKey}
                reviewerNames={reviewerNames}
              />
            );
          })}
        </div>

        <div className="ar-side">
          {stage === "expertReview" ? (
            <ProgressCard progress={progress} names={reviewerNames} items={overviewItems} />
          ) : null}
          <ReviewHistoryCard traces={detail?.traces} />
        </div>
      </div>

      <ReviewOverviewPanel
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        summary={overviewSummary}
        items={overviewItems}
        fields={flatFields}
        reviewerNames={reviewerNames}
        onJumpToField={jumpToField}
      />
    </div>
  );
}

/* =====================================================================
 * 子组件
 * ================================================================== */

function Centered({ text }: { text: string }) {
  return (
    <div style={{ padding: 60, textAlign: "center", color: "#8a94a6", fontSize: 14 }}>{text}</div>
  );
}

function ReadonlyBanner({ text }: { text: string }) {
  return (
    <div
      className="ar-card"
      style={{ marginBottom: 16, padding: "14px 18px", borderColor: "#fdf3e3", background: "#fffaf0", color: "#d97706", fontSize: 13 }}
    >
      {text}
    </div>
  );
}

function InfoCard({ record }: { record: AupRecord }) {
  const rows: Array<[string, string]> = [
    ["注册号", record.registerNo ?? "—"],
    ["项目名称", record.projectName ?? "—"],
    ["课题负责人", record.piName ?? "—"],
    ["部门", record.dept ?? "—"],
    ["第几轮", String(record.roundNo ?? 1)],
    ["审查形式", record.reviewForm === "meeting" ? "会议审核" : record.reviewForm === "member" ? "函审（member）" : "—"],
    ["提交时间", record.submittedAt?.slice(0, 10) ?? "—"],
  ];
  return (
    <div className="ar-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px 20px" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ fontSize: 12 }}>
            <span style={{ color: "#8a94a6", marginRight: 8 }}>{k}</span>
            <span style={{ color: "#1a2233", fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionCard({
  sectionKey,
  sectionLabel,
  fields,
  editable,
  reviewerRole,
  drafts,
  onDraftChange,
  itemsByFieldKey,
  reviewerNames,
}: {
  sectionKey: string;
  sectionLabel: string;
  fields: FlatField[];
  editable: boolean;
  reviewerRole: "expert" | "secretary";
  drafts: Record<string, FieldReviewDraft>;
  onDraftChange: (fieldKey: string, next: FieldReviewDraft) => void;
  itemsByFieldKey: Map<string, ReviewItem[]>;
  reviewerNames: Record<string, string>;
}) {
  let lastSub: string | undefined;

  return (
    <div className="ar-card" style={{ marginBottom: 16 }}>
      <h3>{sectionLabel}</h3>
      <div className="sub">共 {fields.length} 个填写项</div>
      {fields.map((f) => {
        const subHeader = f.subsectionLabel && f.subsectionLabel !== lastSub ? f.subsectionLabel : undefined;
        lastSub = f.subsectionLabel;
        return (
          <div key={f.key}>
            {subHeader ? <div className="ar-subsection">{subHeader}</div> : null}
            <div id={`field-${f.key}`} className="ar-field" style={{ scrollMarginTop: 80 }}>
              <div className="ar-fl">
                <span className="ar-lbl">
                  {f.label}
                  {f.required ? <span className="ar-req">*</span> : null}
                </span>
                <FieldReviewTag
                  fieldKey={f.key}
                  fieldLabel={f.label}
                  editable={editable}
                  reviewerRole={reviewerRole}
                  draft={drafts[f.key] ?? emptyFieldReviewDraft()}
                  onDraftChange={(next) => onDraftChange(f.key, next)}
                  existing={itemsByFieldKey.get(f.key)}
                  reviewerNames={reviewerNames}
                />
              </div>
              <FieldValue field={f} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FieldValue({ field }: { field: FlatField }) {
  const value = field.value;
  if (value == null || value === "") {
    return <div className="ar-val empty">未填写</div>;
  }
  if (field.type === "table" && Array.isArray(value)) {
    const columns = field.field.config?.columns ?? [];
    const rows = value as Array<Record<string, unknown>>;
    if (columns.length > 0 && rows.length > 0) {
      return (
        <table className="ar-grid">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.fieldKey}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.fieldKey}>{formatScalar(r[c.fieldKey]) || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return <div className="ar-val">{rows.length} 行</div>;
  }
  return <div className="ar-val">{formatFieldValue(field.field, value)}</div>;
}

/* ---------- 组长审核 ---------- */

function PiReviewPanel({
  canAct,
  submitting,
  onSubmit,
}: {
  canAct: boolean;
  submitting: boolean;
  onSubmit: (action: "approve" | "return", comment: string) => void;
}) {
  const [comment, setComment] = useState("");

  if (!canAct) {
    return <ReadonlyBanner text="当前为组长审核阶段，您非本课题组组长（PI），仅只读查看。" />;
  }

  const approve = () => onSubmit("approve", comment);
  const return_ = () => {
    if (!comment.trim()) {
      toast.error("退回必须填写意见");
      return;
    }
    onSubmit("return", comment);
  };

  return (
    <div className="ar-card" style={{ marginBottom: 16, borderColor: "#eef1fd" }}>
      <h3>组长审核</h3>
      <div className="sub">审核本课题组计划书：通过流转至格式审查；退回由申请人修改后重新提交</div>

      <div className="ar-form-label">审核意见（退回时必填）</div>
      <textarea
        className="ar-form-control"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="填写审核意见（退回必填，通过可选）"
      />

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button type="button" className="ar-btn primary" disabled={submitting} onClick={approve}>
          {submitting ? "提交中…" : "通过"}
        </button>
        <button type="button" className="ar-btn danger" disabled={submitting} onClick={return_}>
          {submitting ? "提交中…" : "退回"}
        </button>
      </div>
    </div>
  );
}

/* ---------- 格式审查 ---------- */

function FormatReviewPanel({
  canAct,
  experts,
  submitting,
  suggestionCount,
  onSubmit,
}: {
  canAct: boolean;
  experts: Expert[];
  submitting: boolean;
  suggestionCount: number;
  onSubmit: (comment: string, reviewForm: ReviewForm, expertIds: string[]) => void;
}) {
  const [comment, setComment] = useState("");
  const [reviewForm, setReviewForm] = useState<ReviewForm>("member");
  const [expertIds, setExpertIds] = useState<string[]>([]);

  if (!canAct) {
    return <ReadonlyBanner text="当前为格式审查阶段，您非秘书（格式审查人），仅只读查看。" />;
  }

  const toggleExpert = (userId: string) =>
    setExpertIds((prev) => (prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]));

  const hasSuggestions = suggestionCount > 0;
  const submit = () => onSubmit(comment, reviewForm, expertIds);

  return (
    <div className="ar-card" style={{ marginBottom: 16, borderColor: "#eef1fd" }}>
      <h3>格式审查</h3>
      <div className="sub">在下方字段旁点徽标标「格式建议」即退回返修；未标建议则选择审查形式并分配专家流转</div>

      {hasSuggestions ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid #fdf3e3",
            background: "#fffaf0",
            color: "#d97706",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          已标记 <b>{suggestionCount}</b> 条格式建议，提交后将退回申请人修改。
        </div>
      ) : (
        <>
          <div className="ar-form-label">专家审查形式</div>
          <div className="ar-radio-group" style={{ marginBottom: 12 }}>
            <label className={`ar-choice ${reviewForm === "member" ? "chosen" : ""}`}>
              <input type="radio" checked={reviewForm === "member"} onChange={() => setReviewForm("member")} />
              函审（member）
            </label>
            <label className={`ar-choice ${reviewForm === "meeting" ? "chosen" : ""}`}>
              <input type="radio" checked={reviewForm === "meeting"} onChange={() => setReviewForm("meeting")} />
              会议审核（meeting）
            </label>
          </div>

          <div className="ar-form-label">分配专家（已选 {expertIds.length}）</div>
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #e5e9ef", borderRadius: 8, padding: 8 }}>
            {experts.length === 0 ? (
              <div style={{ fontSize: 12, color: "#8a94a6", padding: 8 }}>暂无可选专家（请在名册配置中维护）</div>
            ) : (
              experts.map((e) => {
                const checked = expertIds.includes(e.userId);
                return (
                  <label
                    key={e.userId}
                    className="ar-choice"
                    style={{ marginBottom: 6, background: checked ? "#eef1fd" : "#fff", borderColor: checked ? "#3b5bdb" : "#d5dbe3" }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleExpert(e.userId)} />
                    {e.name}
                    {e.dept ? <span style={{ color: "#8a94a6", fontSize: 12 }}>（{e.dept}）</span> : null}
                  </label>
                );
              })
            )}
          </div>
        </>
      )}

      <div className="ar-form-label" style={{ marginTop: 12 }}>审查意见（可选）</div>
      <textarea
        className="ar-form-control"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={hasSuggestions ? "填写整体退回说明（可选）" : "填写格式审查意见（可选）"}
      />

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button type="button" className={`ar-btn ${hasSuggestions ? "danger" : "primary"}`} disabled={submitting} onClick={submit}>
          {submitting ? "提交中…" : hasSuggestions ? "退回（含格式建议）" : "通过并分配专家"}
        </button>
      </div>
    </div>
  );
}

/* ---------- 专家投票 ---------- */

function ExpertReviewPanel({
  canVote,
  alreadyVoted,
  submitting,
  onSubmit,
}: {
  canVote: boolean;
  alreadyVoted: boolean;
  submitting: boolean;
  onSubmit: (verdict: "abstain" | "recuse" | null, comment: string) => void;
}) {
  const [specialVerdict, setSpecialVerdict] = useState<"abstain" | "recuse" | null>(null);
  const [comment, setComment] = useState("");

  if (!canVote) {
    return (
      <ReadonlyBanner
        text={
          alreadyVoted
            ? "您已提交本轮投票（只读查看）"
            : "当前为专家审查阶段，您未参与本轮评审，仅只读查看。"
        }
      />
    );
  }

  const submit = () => onSubmit(specialVerdict, comment);

  return (
    <div className="ar-card" style={{ marginBottom: 16, borderColor: "#eef1fd" }}>
      <h3>专家审查 · 投票</h3>
      <div className="sub">正常评审请在下方表单字段旁点徽标逐条打标（合规/不合规/建议），整体结论由系统自动推导；弃权或回避请直接选择下方选项</div>

      <div className="ar-form-label">整体结论</div>
      <div style={{ fontSize: 12, color: "#8a94a6", marginBottom: 8, lineHeight: 1.5 }}>
        由逐字段三态自动推导（含不合规 → 不合格；含建议且无不合规 → 修改；否则 → 同意），无需手动选择。
      </div>

      <div className="ar-form-label">弃权 / 回避（特殊情况，直接提交结论）</div>
      <div className="ar-radio-group" style={{ marginBottom: 12 }}>
        <label className={`ar-choice ${specialVerdict === "abstain" ? "chosen" : ""}`}>
          <input type="radio" checked={specialVerdict === "abstain"} onChange={() => setSpecialVerdict("abstain")} />
          弃权（拒评）
        </label>
        <label className={`ar-choice ${specialVerdict === "recuse" ? "chosen" : ""}`}>
          <input type="radio" checked={specialVerdict === "recuse"} onChange={() => setSpecialVerdict("recuse")} />
          回避
        </label>
        {specialVerdict ? (
          <button type="button" className="ar-btn ghost small" onClick={() => setSpecialVerdict(null)}>
            取消选择（回到正常评审）
          </button>
        ) : null}
      </div>

      <div className="ar-form-label">整体意见（可选）</div>
      <textarea className="ar-form-control" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="填写整体审核反馈" />

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="ar-btn primary" disabled={submitting} onClick={submit}>
          {submitting ? "提交中…" : specialVerdict ? "提交投票" : "提交逐字段评审"}
        </button>
      </div>
    </div>
  );
}

/* ---------- 投票进度 ---------- */

function ProgressCard({ progress, names, items }: { progress?: ReviewProgress; names: Record<string, string>; items?: ReviewItem[] }) {
  if (!progress) return null;
  const should = Math.max(0, (progress.assignCount ?? 0) - (progress.recusedCount ?? 0));
  const by = progress.byVerdict ?? { agree: 0, modify: 0, disagree: 0, abstain: 0 };

  // 逐人批注计数（来自逐字段意见）
  const countByReviewer: Record<string, number> = {};
  for (const it of items ?? []) {
    const key = it.reviewer ?? "?";
    countByReviewer[key] = (countByReviewer[key] ?? 0) + 1;
  }

  const voted = progress.votes ?? [];
  const unvoted = (progress.unvoted ?? []).map((uid) => ({ reviewer: uid, verdict: null as ReviewVerdict | null, comment: undefined as string | undefined }));
  const timeline = [...voted, ...unvoted];

  return (
    <div className="ar-card" style={{ marginBottom: 16 }}>
      <h3>投票进度</h3>

      {/* 汇总数字（辅助信息） */}
      <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#8a94a6" }}>
        <span>应投 <b style={{ color: "#1a2233", fontSize: 15 }}>{should}</b></span>
        <span>已投 <b style={{ color: "#1a2233", fontSize: 15 }}>{progress.votedCount ?? 0}</b></span>
        <span>回避 <b style={{ color: "#1a2233", fontSize: 15 }}>{progress.recusedCount ?? 0}</b></span>
        <span>同意 <b style={{ color: "#16a34a", fontSize: 15 }}>{by.agree}</b></span>
        <span>不合格 <b style={{ color: "#dc2626", fontSize: 15 }}>{by.disagree}</b></span>
        <span>修改 <b style={{ color: "#d97706", fontSize: 15 }}>{by.modify}</b></span>
        <span>拒评 <b style={{ color: "#8a94a6", fontSize: 15 }}>{by.abstain}</b></span>
      </div>

      {/* 流水式逐人投票 */}
      <div style={{ marginTop: 16 }}>
        {timeline.map((v, i) => {
          const isVoted = !!v.verdict;
          const color = isVoted ? (VERDICT_COLORS[v.verdict!] ?? "#8a94a6") : "#cbd2dc";
          const label = isVoted ? (VERDICT_LABELS[v.verdict!] ?? v.verdict) : "未投";
          const name = names[v.reviewer ?? ""] ?? v.reviewer ?? "匿名";
          const count = countByReviewer[v.reviewer ?? "?"];
          const last = i === timeline.length - 1;
          return (
            <div key={i} style={{ display: "flex", gap: 10, position: "relative", paddingBottom: last ? 0 : 14 }}>
              {!last && <div style={{ position: "absolute", left: 5, top: 16, bottom: 2, width: 2, background: "#e6eaf0" }} />}
              <div
                style={{
                  width: 12, height: 12, borderRadius: "50%", flexShrink: 0, marginTop: 2, position: "relative", zIndex: 1,
                  background: color, boxShadow: isVoted ? `0 0 0 3px ${color}22` : undefined,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 12, color: isVoted ? "#1a2233" : "#8a94a6" }}>{name}</b>
                  <span style={{ fontSize: 11, fontWeight: 600, color }}>{label}</span>
                  {isVoted && count ? <span style={{ fontSize: 11, color: "#8a94a6" }}>· 批注 {count} 条</span> : null}
                </div>
                {isVoted && v.comment ? (
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, lineHeight: 1.5 }}>{v.comment}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const VERDICT_COLORS: Record<ReviewVerdict, string> = {
  agree: "#16a34a",
  disagree: "#dc2626",
  modify: "#d97706",
  recuse: "#8a94a6",
  abstain: "#8a94a6",
};

/* ---------- 留痕 / 投票记录 ---------- */

function ReviewHistoryCard({
  traces,
}: {
  traces?: AupTrace[];
}) {
  return (
    <div className="ar-card">
      <h3>进行记录</h3>
      <div style={{ marginTop: 10 }}>
        {(traces ?? []).length === 0 ? (
          <div style={{ fontSize: 12, color: "#8a94a6" }}>暂无记录</div>
        ) : null}

        {(traces ?? []).map((t, i) => (
          <div className="ar-trace" key={`t-${i}`}>
            <div className="ar-trace-t">{t.action}</div>
            <div className="ar-trace-m">{t.createdAt?.slice(0, 16) ?? ""}</div>
            {t.actorName ? <div className="ar-trace-m">{t.actorName}</div> : null}
            {t.comment ? <div className="ar-trace-m">{t.comment}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =====================================================================
 * 样式（复用原型 CSS 变量与类名，作用域限定在 .aup-review）
 * ================================================================== */

const REVIEW_CSS = `
.aup-review{
  --bg:#f4f6f8; --card:#fff; --border:#e5e9ef; --text:#1a2233; --muted:#8a94a6;
  --primary:#3b5bdb; --primary-weak:#eef1fd; --success:#16a34a; --success-weak:#e8f7ee;
  --warn:#d97706; --warn-weak:#fdf3e3; --danger:#dc2626; --danger-weak:#fdeaea; --slate:#64748b;
  color:var(--text); font-size:14px; line-height:1.55;
}
.aup-review *{box-sizing:border-box;margin:0;padding:0}
.aup-review .ar-toolbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px;background:var(--card);border-bottom:1px solid var(--border);padding:10px 24px}
.aup-review .ar-spacer{flex:1}
.aup-review .ar-btn{padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid transparent;transition:.15s;white-space:nowrap;background:#fff;color:var(--text)}
.aup-review .ar-btn:hover{border-color:var(--muted)}
.aup-review .ar-btn.ghost{border-color:#d5dbe3}
.aup-review .ar-btn.primary{background:var(--primary);color:#fff;border-color:var(--primary)}
.aup-review .ar-btn.danger{border-color:var(--danger);color:var(--danger)}
.aup-review .ar-btn.small{padding:4px 10px;font-size:12px;border-radius:6px}
.aup-review .ar-btn:disabled{opacity:.5;cursor:not-allowed}
.aup-review .ar-tag{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap}
.aup-review .ar-stepper-wrap{background:var(--card);border-bottom:1px solid var(--border);padding:12px 24px}
.aup-review .ar-stepper{display:flex;align-items:center;max-width:1080px;margin:0 auto}
.aup-review .ar-step{display:flex;align-items:center;gap:7px}
.aup-review .ar-step .ar-dot{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:#e6eaf0;color:var(--muted)}
.aup-review .ar-step .ar-label{font-size:13px;font-weight:600;color:var(--muted);white-space:nowrap}
.aup-review .ar-step.done .ar-dot{background:var(--success);color:#fff}
.aup-review .ar-step.done .ar-label{color:var(--text)}
.aup-review .ar-step.active .ar-dot{background:var(--primary);color:#fff;box-shadow:0 0 0 4px var(--primary-weak)}
.aup-review .ar-step.active .ar-label{color:var(--primary)}
.aup-review .ar-step.end .ar-dot{background:var(--danger);color:#fff}
.aup-review .ar-step.end .ar-label{color:var(--danger)}
.aup-review .ar-connector{flex:1;height:2px;background:#e6eaf0;margin:0 10px;min-width:20px}
.aup-review .ar-connector.done{background:var(--success)}
.aup-review .ar-layout{display:flex;max-width:1240px;margin:20px auto;gap:20px;padding:0 24px;align-items:flex-start}
.aup-review .ar-main{flex:1;min-width:0}
.aup-review .ar-side{position:sticky;top:76px;width:300px;flex-shrink:0}
.aup-review .ar-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 24px}
.aup-review .ar-card h3{font-size:15px;font-weight:700;margin-bottom:4px}
.aup-review .ar-card .sub{font-size:12px;color:var(--muted);margin-bottom:14px}
.aup-review .ar-field{margin-bottom:14px}
.aup-review .ar-fl{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;justify-content:space-between}
.aup-review .ar-lbl{font-size:13px;font-weight:600}
.aup-review .ar-req{color:var(--danger);margin-left:2px}
.aup-review .ar-val{font-size:13px;color:var(--text);background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:8px 12px;white-space:pre-wrap}
.aup-review .ar-val.empty{color:var(--muted);font-style:italic}
.aup-review .ar-grid{width:100%;border-collapse:collapse;font-size:13px}
.aup-review .ar-grid th{background:#f8fafc;text-align:left;padding:8px 10px;font-weight:600;color:var(--muted);border-bottom:1px solid var(--border)}
.aup-review .ar-grid td{padding:8px 10px;border-bottom:1px solid var(--border)}
.aup-review .ar-subsection{margin:14px 0 6px;font-size:13px;font-weight:700;color:var(--slate)}
.aup-review .ar-form-label{font-size:12px;font-weight:600;color:var(--slate);margin:8px 0 4px}
.aup-review .ar-form-control{width:100%;padding:8px 12px;border:1px solid #d5dbe3;border-radius:8px;font-size:13px;font-family:inherit;background:#fff;color:var(--text)}
.aup-review textarea.ar-form-control{min-height:84px;resize:vertical}
.aup-review .ar-form-control:focus{outline:none;border-color:var(--primary)}
.aup-review .ar-choice{display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #d5dbe3;border-radius:8px;cursor:pointer;font-size:13px}
.aup-review .ar-choice.chosen{border-color:var(--primary);background:var(--primary-weak)}
.aup-review .ar-radio-group{display:flex;gap:8px;flex-wrap:wrap}
.aup-review .ar-stat{display:flex;gap:20px;flex-wrap:wrap}
.aup-review .ar-stat-k{font-size:12px;color:var(--muted)}
.aup-review .ar-stat-v{font-size:20px;font-weight:800;color:var(--text)}
.aup-review .ar-trace{border-left:2px solid #e6eaf0;padding:0 0 12px 16px;margin-left:6px;position:relative}
.aup-review .ar-trace::before{content:"";position:absolute;left:-6px;top:3px;width:10px;height:10px;border-radius:50%;background:var(--slate)}
.aup-review .ar-trace-t{font-size:12px;font-weight:600}
.aup-review .ar-trace-m{font-size:11px;color:var(--muted);margin-top:1px}
@media (max-width:900px){.aup-review .ar-layout{flex-direction:column}.aup-review .ar-side{position:static;width:auto}}
`;
